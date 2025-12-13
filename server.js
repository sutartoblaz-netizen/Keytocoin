const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

/* ================= CONFIG ================= */
const HTTP_PORT = process.env.HTTP_PORT || 3005;
const P2P_PORT = process.env.P2P_PORT || 6006;

const DIFFICULTY = 3;
const MAX_SUPPLY = 17_000_000;
const DEFAULT_REWARD = 1;

const DATA_DIR = path.join(__dirname, "data");
const CHAIN_FILE = path.join(DATA_DIR, "blockchain.json");

/* ================= UTIL ================= */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/* ================= BLOCKCHAIN ================= */
function calculateHash(block) {
  const clone = { ...block };
  delete clone.hash;
  return sha256(JSON.stringify(clone));
}

function createGenesisBlock() {
  const block = {
    index: 0,
    timestamp: Date.now(),
    data: { type: "GENESIS" },
    prevHash: "0",
    nonce: 0
  };
  block.hash = calculateHash(block);
  return block;
}

/* ================= STORAGE ================= */
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let executionLayer = [createGenesisBlock()];
let balances = {};
let issuedSupply = 0;
let btcLocks = [];

/* ================= LOAD / SAVE ================= */
function saveChain() {
  fs.writeFileSync(
    CHAIN_FILE,
    JSON.stringify({ executionLayer, btcLocks }, null, 2)
  );
}

function loadChain() {
  if (!fs.existsSync(CHAIN_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(CHAIN_FILE));
  executionLayer = raw.executionLayer || executionLayer;
  btcLocks = raw.btcLocks || [];
  rebuildState();
}

/* ================= STATE ================= */
function rebuildState() {
  balances = {};
  issuedSupply = 0;

  for (const block of executionLayer) {
    if (!block.data) continue;
    const d = block.data;

    if (d.type === "MINING_REWARD") {
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
      height: executionLayer.length,
      issuedSupply,
      balances
    })
  );
}

/* ================= VALIDATION ================= */
function isValidBlock(block, prev) {
  if (prev.index + 1 !== block.index) return false;
  if (prev.hash !== block.prevHash) return false;
  if (calculateHash(block) !== block.hash) return false;
  if (!block.hash.startsWith("0".repeat(DIFFICULTY))) return false;
  return true;
}

/* ================= P2P ================= */
let sockets = [];

function broadcast(msg) {
  const data = JSON.stringify(msg);
  sockets.forEach(s => s.readyState === 1 && s.send(data));
}

function initConnection(ws) {
  sockets.push(ws);
  ws.on("message", msg => handleMessage(ws, msg));
  ws.on("close", () => (sockets = sockets.filter(s => s !== ws)));
  ws.send(JSON.stringify({ type: "SYNC", data: executionLayer }));
}

function handleMessage(ws, msg) {
  const data = JSON.parse(msg);
  if (data.type === "NEW_BLOCK") {
    const prev = executionLayer.at(-1);
    if (isValidBlock(data.data, prev)) {
      executionLayer.push(data.data);
      rebuildState();
      saveChain();
    }
  }
}

/* ================= EXPRESS ================= */
const app = express();
app.use(bodyParser.json());

// ✅ CORS (WAJIB agar HTML bisa fetch)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

/* ================= MINING ================= */
function mineAsync(address, reward) {
  return new Promise(resolve => {
    const prev = executionLayer.at(-1);

    const worker = new Worker(
      `
      const { parentPort } = require("worker_threads");
      const crypto = require("crypto");
      const sha256 = d => crypto.createHash("sha256").update(d).digest("hex");

      parentPort.on("message", msg => {
        let nonce = 0;
        while (true) {
          const block = {
            index: msg.index,
            timestamp: Date.now(),
            data: msg.data,
            prevHash: msg.prevHash,
            nonce
          };
          const hash = sha256(JSON.stringify(block));
          if (hash.startsWith("0".repeat(msg.difficulty))) {
            block.hash = hash;
            parentPort.postMessage(block);
            break;
          }
          nonce++;
        }
      });
    `,
      { eval: true }
    );

    worker.on("message", block => resolve(block));
    worker.postMessage({
      index: executionLayer.length,
      prevHash: prev.hash,
      difficulty: DIFFICULTY,
      data: {
        type: "MINING_REWARD",
        to: address,
        amount: reward
      }
    });
  });
}

/* ================= ROUTES ================= */

// Wallet info (dipakai HTML)
app.get("/wallet/:address", (req, res) => {
  const address = req.params.address;
  res.json({
    balance: balances[address] || 0,
    blocks: executionLayer.filter(
      b => b.data?.type === "MINING_REWARD" && b.data.to === address
    ).length,
    supply: issuedSupply
  });
});

// Mine
app.post("/mine", async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });
  if (issuedSupply + DEFAULT_REWARD > MAX_SUPPLY)
    return res.status(400).json({ error: "max supply reached" });

  const block = await mineAsync(address, DEFAULT_REWARD);
  executionLayer.push(block);
  rebuildState();
  saveChain();
  broadcast({ type: "NEW_BLOCK", data: block });

  res.json({
    message: "Block mined",
    block,
    balance: balances[address],
    issuedSupply
  });
});

// Send transaction (PoW ringan)
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;
  if (!from || !to || !amount)
    return res.status(400).json({ error: "invalid tx" });
  if ((balances[from] || 0) < amount)
    return res.status(400).json({ error: "insufficient balance" });

  const prev = executionLayer.at(-1);
  const block = {
    index: executionLayer.length,
    timestamp: Date.now(),
    data: { type: "TRANSFER", from, to, amount },
    prevHash: prev.hash,
    nonce: 0
  };

  let nonce = 0;
  let hash;
  do {
    nonce++;
    hash = sha256(
      JSON.stringify({
        index: block.index,
        timestamp: block.timestamp,
        data: block.data,
        prevHash: block.prevHash,
        nonce
      })
    );
  } while (!hash.startsWith("0".repeat(DIFFICULTY)));

  block.nonce = nonce;
  block.hash = hash;

  executionLayer.push(block);
  rebuildState();
  saveChain();
  broadcast({ type: "NEW_BLOCK", data: block });

  res.json({ message: "Transaction confirmed" });
});

// Balance (opsional)
app.get("/balance", (req, res) => {
  res.json(balances);
});

// Dummy create-wallet (frontend generator)
app.get("/create-wallet", (req, res) => {
  res.json({ ok: true });
});

// BTC lock
app.post("/btc-lock", (req, res) => {
  const { btcTxid, amount, ktcAddress } = req.body;
  btcLocks.push({ btcTxid, amount, ktcAddress, time: Date.now() });
  saveChain();
  res.json({ status: "BTC locked (proof recorded)" });
});

// BTC anchor (PoW ringan)
app.post("/btc-anchor", (req, res) => {
  const { btcTxid } = req.body;
  const commitment = getStateCommitment();

  const prev = executionLayer.at(-1);
  const block = {
    index: executionLayer.length,
    timestamp: Date.now(),
    data: { type: "BTC_ANCHOR", btcTxid, commitment },
    prevHash: prev.hash,
    nonce: 0
  };

  let nonce = 0;
  let hash;
  do {
    nonce++;
    hash = sha256(
      JSON.stringify({
        index: block.index,
        timestamp: block.timestamp,
        data: block.data,
        prevHash: block.prevHash,
        nonce
      })
    );
  } while (!hash.startsWith("0".repeat(DIFFICULTY)));

  block.nonce = nonce;
  block.hash = hash;

  executionLayer.push(block);
  saveChain();
  broadcast({ type: "NEW_BLOCK", data: block });

  res.json({ anchored: true, commitment });
});

// Status
app.get("/status", (req, res) => {
  res.json({
    layer: "Bitcoin Layer-2",
    executionHeight: executionLayer.length,
    issuedSupply,
    maxSupply: MAX_SUPPLY,
    stateCommitment: getStateCommitment()
  });
});

/* ================= START ================= */
loadChain();
if (executionLayer.length === 1) saveChain();

app.listen(HTTP_PORT, () =>
  console.log(`💎 KeytoCoin L2 running on ${HTTP_PORT}`)
);

const wss = new WebSocket.Server({ port: P2P_PORT });
wss.on("connection", initConnection);
console.log("🌐 P2P running");
