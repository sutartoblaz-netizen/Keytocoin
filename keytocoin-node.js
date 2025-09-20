// keytocoin-node.js
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(bodyParser.json());

// Blockchain data
let chain = [];
let mempool = [];
let balances = {};
let peers = new Set();
const TOTAL_SUPPLY = 17000000;
let minedSupply = 0;

// Genesis block
function createGenesis() {
  const genesis = {
    index: 0,
    timestamp: Date.now(),
    transactions: [],
    prevHash: "0",
    hash: "GENESIS"
  };
  chain.push(genesis);
}
createGenesis();

// Hash util
function hash(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Add block
function addBlock(transactions, miner) {
  const block = {
    index: chain.length,
    timestamp: Date.now(),
    transactions,
    prevHash: chain[chain.length - 1].hash,
    miner
  };
  block.hash = hash(block);
  chain.push(block);
  return block;
}

// Wallet info
app.get("/wallet/:address", (req, res) => {
  const addr = req.params.address;
  res.json({
    balance: balances[addr] || 0,
    blocks: chain.filter(b => b.miner === addr).length,
    supply: minedSupply
  });
});

// Mining
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No address" });
  if (minedSupply >= TOTAL_SUPPLY) return res.json({ error: "All KTC mined" });

  const reward = 1; // 1 KTC per block
  balances[address] = (balances[address] || 0) + reward;
  minedSupply++;

  const block = addBlock(mempool, address);
  mempool = [];

  res.json({ message: "Mined!", block });
  broadcastBlock(block);
});

// Kirim transaksi
app.post("/send", (req, res) => {
  const { from, to, amount, signature } = req.body;
  if (!from || !to || !amount) return res.json({ error: "Invalid tx" });
  if ((balances[from] || 0) < amount) return res.json({ error: "Not enough balance" });

  balances[from] -= amount;
  balances[to] = (balances[to] || 0) + amount;

  const tx = { from, to, amount, signature, timestamp: Date.now() };
  mempool.push(tx);

  res.json({ message: "Tx added", tx });
  broadcastTx(tx);
});

// Swap (nyata → hubungkan ke API exchanger)
app.post("/swap", async (req, res) => {
  const { from, token, amount } = req.body;
  if (!from || !token || !amount) return res.json({ error: "Invalid swap request" });
  if ((balances[from] || 0) < amount) return res.json({ error: "Not enough KTC" });

  balances[from] -= amount;

  // Contoh kurs nyata (ambil dari API harga crypto)
  let rate = 0.1;
  try {
    const r = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,tether&vs_currencies=usd");
    if (token === "USDT") rate = 0.5;
    if (token === "ETH") rate = 0.0002;
  } catch {}

  const swapped = amount * rate;
  res.json({ message: "Swap done", swapped });
});

// Peer sync
app.post("/peer", (req, res) => {
  const { peer } = req.body;
  if (peer) peers.add(peer);
  res.json({ peers: Array.from(peers) });
});

function broadcastBlock(block) {
  peers.forEach(p => axios.post(`${p}/receive-block`, block).catch(()=>{}));
}
function broadcastTx(tx) {
  peers.forEach(p => axios.post(`${p}/receive-tx`, tx).catch(()=>{}));
}

app.listen(PORT, () => console.log(`✅ KeytoCoin node at http://localhost:${PORT}`));
