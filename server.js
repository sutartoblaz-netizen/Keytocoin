// ================================
// KeytoCoin Bitcoin Layer-2 (REAL)
// Custodial / Federated L2
// Anchored to Bitcoin Mainnet via OP_RETURN
// ================================

const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// fetch for Node 18+
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/* ================= CONFIG ================= */
const HTTP_PORT = 3005;
const P2P_PORT = 6006;

const DIFFICULTY = 3;
const MAX_SUPPLY = 17_000_000;
const BLOCK_REWARD = 1;

// Bitcoin Core RPC (MAINNET)
const BTC_RPC = {
  url: "http://127.0.0.1:8332",
  user: "ktc",
  pass: "strongpassword"
};

// BTC lock address (custody / multisig recommended)
const BTC_LOCK_ADDRESS = "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

/* ================= STORAGE ================= */
const DATA_DIR = path.join(__dirname, "data");
const CHAIN_FILE = path.join(DATA_DIR, "l2-chain.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

/* ================= UTILS ================= */
const sha256 = d =>
  crypto.createHash("sha256").update(d).digest("hex");

async function btcRPC(method, params = []) {
  const res = await fetch(BTC_RPC.url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${BTC_RPC.user}:${BTC_RPC.pass}`).toString("base64"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "ktc",
      method,
      params
    })
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

/* ================= BLOCK ================= */
function calcHash(b) {
  return sha256(
    b.index +
      b.prevHash +
      b.timestamp +
      JSON.stringify(b.data) +
      b.nonce
  );
}

function genesisBlock() {
  const g = {
    index: 0,
    timestamp: Date.now(),
    prevHash: "0",
    nonce: 0,
    data: { type: "GENESIS" }
  };
  g.hash = calcHash(g);
  return g;
}

/* ================= STATE ================= */
let chain = [genesisBlock()];
let balances = {};
let issuedSupply = 0;
let btcLocks = [];

/* ================= LOAD ================= */
if (fs.existsSync(CHAIN_FILE)) {
  const raw = JSON.parse(fs.readFileSync(CHAIN_FILE));
  chain = raw.chain || chain;
  btcLocks = raw.btcLocks || [];
  rebuildState();
}

function save() {
  fs.writeFileSync(
    CHAIN_FILE,
    JSON.stringify({ chain, btcLocks }, null, 2)
  );
}

/* ================= REBUILD ================= */
function rebuildState() {
  balances = {};
  issuedSupply = 0;

  for (const b of chain) {
    const d = b.data;
    if (!d) continue;

    if (d.type === "REWARD") {
      balances[d.to] = (balances[d.to] || 0) + d.amount;
      issuedSupply += d.amount;
    }

    if (d.type === "TRANSFER") {
      balances[d.from] = (balances[d.from] || 0) - d.amount;
      balances[d.to] = (balances[d.to] || 0) + d.amount;
    }
  }
}

function getStateCommitment() {
  return sha256(
    JSON.stringify({
      height: chain.length,
      balances,
      issuedSupply
    })
  );
}

/* ================= EXPRESS ================= */
const app = express();
app.use(bodyParser.json());
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

/* ================= BTC LOCK ================= */
app.post("/btc-lock", async (req, res) => {
  try {
    const { btcTxid, ktcAddress } = req.body;

    const tx = await btcRPC("getrawtransaction", [btcTxid, true]);
    if (!tx || tx.confirmations < 6)
      return res.status(400).json({ error: "TX not confirmed" });

    const out = tx.vout.find(v =>
      v.scriptPubKey.address === BTC_LOCK_ADDRESS ||
      v.scriptPubKey.addresses?.includes(BTC_LOCK_ADDRESS)
    );

    if (!out)
      return res.status(400).json({ error: "No BTC lock output" });

    btcLocks.push({
      btcTxid,
      amount: out.value,
      ktcAddress,
      blockhash: tx.blockhash
    });

    save();
    res.json({ locked: true, amount: out.value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= MINE ================= */
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });

  if (issuedSupply + BLOCK_REWARD > MAX_SUPPLY)
    return res.status(400).json({ error: "max supply reached" });

  const block = {
    index: chain.length,
    timestamp: Date.now(),
    prevHash: chain.at(-1).hash,
    nonce: 0,
    data: { type: "REWARD", to: address, amount: BLOCK_REWARD }
  };

  while (true) {
    block.hash = calcHash(block);
    if (block.hash.startsWith("0".repeat(DIFFICULTY))) break;
    block.nonce++;
  }

  chain.push(block);
  rebuildState();
  save();
  broadcast({ type: "BLOCK", block });

  res.json({ mined: true, height: block.index });
});

/* ================= TRANSFER ================= */
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;

  if ((balances[from] || 0) < amount)
    return res.status(400).json({ error: "insufficient balance" });

  const block = {
    index: chain.length,
    timestamp: Date.now(),
    prevHash: chain.at(-1).hash,
    nonce: 0,
    data: { type: "TRANSFER", from, to, amount }
  };

  while (true) {
    block.hash = calcHash(block);
    if (block.hash.startsWith("0".repeat(DIFFICULTY))) break;
    block.nonce++;
  }

  chain.push(block);
  rebuildState();
  save();
  broadcast({ type: "BLOCK", block });

  res.json({ sent: true });
});

/* ================= BTC ANCHOR (REAL OP_RETURN) ================= */
app.post("/btc-anchor", async (_, res) => {
  try {
    const commitment = getStateCommitment();

    const raw = await btcRPC("createrawtransaction", [
      [],
      {
        data: Buffer.from(commitment).toString("hex")
      }
    ]);

    const funded = await btcRPC("fundrawtransaction", [raw]);
    const signed = await btcRPC("signrawtransactionwithwallet", [
      funded.hex
    ]);

    const txid = await btcRPC("sendrawtransaction", [signed.hex]);

    const block = {
      index: chain.length,
      timestamp: Date.now(),
      prevHash: chain.at(-1).hash,
      nonce: 0,
      data: { type: "BTC_ANCHOR", btcTxid: txid, commitment }
    };

    block.hash = calcHash(block);
    chain.push(block);
    save();

    res.json({ anchored: true, btcTxid: txid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= STATUS ================= */
app.get("/status", (_, res) => {
  res.json({
    network: "KEYTOCOIN BITCOIN L2",
    height: chain.length,
    supply: issuedSupply,
    anchors: chain.filter(b => b.data.type === "BTC_ANCHOR").length
  });
});

/* ================= P2P ================= */
let peers = [];
function broadcast(msg) {
  peers.forEach(p => p.readyState === 1 && p.send(JSON.stringify(msg)));
}

const wss = new WebSocket.Server({ port: P2P_PORT });
wss.on("connection", ws => {
  peers.push(ws);
  ws.on("message", m => {
    const msg = JSON.parse(m);
    if (
      msg.type === "BLOCK" &&
      msg.block.prevHash === chain.at(-1).hash
    ) {
      chain.push(msg.block);
      rebuildState();
      save();
    }
  });
});

/* ================= START ================= */
app.listen(HTTP_PORT, () => {
  console.log("🚀 KeytoCoin Bitcoin Layer-2 NODE RUNNING");
});
