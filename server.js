// server.js (patched)
// Node.js minimal blockchain with persistence, simple PoW, basic P2P, and compatibility endpoints.

const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HTTP_PORT = process.env.HTTP_PORT || 3005;
const P2P_PORT = process.env.P2P_PORT || 6006;
const peers = process.env.PEERS ? process.env.PEERS.split(",") : [];

let blockchain = [];
let balances = {};
let supply = 0;
const MAX_SUPPLY = 17000000;
const MIN_REWARD = 1;
const DEFAULT_REWARD = 1;

let DIFFICULTY = 3; // leading zeros for PoW (adjust as needed)
const CHAIN_FOLDER = path.resolve(__dirname, "data");
const CHAIN_FILE = path.join(CHAIN_FOLDER, "blockchain.json");

// === HASH FUNCTION ===
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// === GENESIS BLOCK ===
function createGenesisBlock() {
  const block = {
    index: 0,
    timestamp: Date.now(),
    data: "Genesis Block",
    prevHash: "0",
    nonce: 0,
  };
  block.hash = calculateHash(block);
  return block;
}

// === HASH / CALC ===
function calculateHash(block) {
  // exclude hash field when calculating
  const clone = { ...block, hash: undefined };
  return sha256(JSON.stringify(clone));
}

// === PERSISTENCE ===
function ensureDataFolder() {
  if (!fs.existsSync(CHAIN_FOLDER)) fs.mkdirSync(CHAIN_FOLDER, { recursive: true });
}

function saveChainToDisk() {
  try {
    ensureDataFolder();
    fs.writeFileSync(CHAIN_FILE, JSON.stringify(blockchain, null, 2));
    // console.log("💾 Chain saved to disk.");
  } catch (e) {
    console.error("❌ Save chain error:", e.message);
  }
}

function loadChainFromDisk() {
  try {
    if (fs.existsSync(CHAIN_FILE)) {
      const raw = fs.readFileSync(CHAIN_FILE, "utf8");
      const c = JSON.parse(raw);
      if (Array.isArray(c) && c.length > 0 && calculateHash(c[0]) === c[0].hash) {
        blockchain = c;
        rebuildBalances();
        console.log("🔁 Chain loaded from disk:", blockchain.length, "blocks");
        return;
      } else {
        console.log("⚠️ Disk chain invalid -> using genesis.");
      }
    }
  } catch (e) {
    console.error("❌ Load chain error:", e.message);
  }
}

// === BALANCES REBUILD ===
function rebuildBalances() {
  balances = {};
  supply = 0;
  for (let block of blockchain) {
    if (block.index === 0) continue; // skip genesis
    const d = block.data;
    if (!d) continue;
    if (d.reward && d.to) {
      balances[d.to] = (balances[d.to] || 0) + Number(d.reward);
      supply += Number(d.reward);
    } else if (d.amount && d.from && d.to) {
      balances[d.from] = (balances[d.from] || 0) - Number(d.amount);
      balances[d.to] = (balances[d.to] || 0) + Number(d.amount);
    }
  }
}

// === BLOCK / CHAIN VALIDATION ===
function isValidBlock(newBlock, prevBlock) {
  if (!newBlock || !prevBlock) return false;
  if (prevBlock.index + 1 !== newBlock.index) return false;
  if (prevBlock.hash !== newBlock.prevHash) return false;
  if (calculateHash(newBlock) !== newBlock.hash) return false;
  // PoW: check difficulty
  if (!newBlock.hash.startsWith("0".repeat(DIFFICULTY))) return false;
  return true;
}

function isValidChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return false;
  if (calculateHash(chain[0]) !== chain[0].hash) return false;
  for (let i = 1; i < chain.length; i++) {
    const newBlock = chain[i];
    const prevBlock = chain[i - 1];
    if (!isValidBlock(newBlock, prevBlock)) return false;
  }
  return true;
}

// === P2P SETUP ===
let sockets = [];

function initConnection(ws) {
  sockets.push(ws);
  console.log("🔗 Peer connected (total peers:", sockets.length + ")");
  ws.on("message", data => handleMessage(ws, data));
  ws.on("close", () => {
    sockets = sockets.filter(s => s !== ws);
    console.log("🔌 Peer disconnected (remaining:", sockets.length + ")");
  });
  ws.on("error", (err) => {
    sockets = sockets.filter(s => s !== ws);
    console.log("❌ Peer error:", err.message || err);
  });
  ws.send(JSON.stringify({ type: "BLOCKCHAIN", data: blockchain }));
}

function connectToPeer(peer) {
  try {
    const ws = new WebSocket(peer);
    ws.on("open", () => initConnection(ws));
    ws.on("error", (err) => console.log("❌ Connection failed to", peer, err.message || err));
  } catch (e) {
    console.log("❌ connectToPeer exception:", e.message || e);
  }
}

function broadcast(message) {
  const msg = JSON.stringify(message);
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch (e) { /* ignore */ }
    }
  });
}

function handleMessage(ws, data) {
  let msg;
  try { msg = JSON.parse(data); } catch (e) { console.log("❌ Received invalid JSON:", data); return; }

  if (msg.type === "BLOCKCHAIN" && Array.isArray(msg.data)) {
    try {
      const incomingChain = msg.data;
      if (incomingChain.length > blockchain.length && isValidChain(incomingChain)) {
        console.log("📥 Received longer valid chain — replacing local chain...");
        blockchain = incomingChain;
        rebuildBalances();
        saveChainToDisk();
      } else {
        if (incomingChain.length > blockchain.length) {
          console.log("❌ Received longer chain but invalid — rejected.");
        }
      }
    } catch (e) { console.log("❌ Error processing incoming chain:", e.message || e); }
    return;
  }

  if (msg.type === "NEW_BLOCK" && msg.data) {
    try {
      const newBlock = msg.data;
      const prevBlock = blockchain[blockchain.length - 1];
      if (isValidBlock(newBlock, prevBlock)) {
        blockchain.push(newBlock);
        const d = newBlock.data;
        if (d) {
          if (d.reward && d.to) {
            balances[d.to] = (balances[d.to] || 0) + Number(d.reward);
            supply += Number(d.reward);
            console.log(`🔔 Notifikasi: reward ${d.reward} masuk ke ${d.to}`);
          } else if (d.amount && d.from && d.to) {
            balances[d.from] = (balances[d.from] || 0) - Number(d.amount);
            balances[d.to] = (balances[d.to] || 0) + Number(d.amount);
            console.log(`🔔 Notifikasi: ${d.amount} terkirim ke ${d.to} dari ${d.from}`);
          }
        }
        saveChainToDisk();
        console.log("📥 Block added from peer:", newBlock.index);
      } else {
        console.log("❌ Invalid NEW_BLOCK received — rejected.");
      }
    } catch (e) { console.log("❌ Error handling NEW_BLOCK:", e.message || e); }
    return;
  }

  console.log("ℹ️ Unknown message type:", msg.type);
}

// === BOOTSTRAP CHAIN ===
blockchain.push(createGenesisBlock());
loadChainFromDisk(); // if exists, will replace genesis
rebuildBalances();

// === HTTP SERVER (API) ===
const app = express();
app.use(bodyParser.json());

// Basic CORS (for convenience)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // dev only
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// === SIMPLE POW MINER (server-side, sync - for demo only) ===
function mineBlockFor(address, rewardValue = DEFAULT_REWARD) {
  if (supply + rewardValue > MAX_SUPPLY) {
    throw new Error("Max supply reached");
  }
  const prevBlock = blockchain[blockchain.length - 1];
  const index = blockchain.length;
  let nonce = 0;
  let block = null;
  while (true) {
    const candidate = {
      index,
      timestamp: Date.now(),
      data: { reward: rewardValue, to: address },
      prevHash: prevBlock.hash,
      nonce
    };
    const hash = calculateHash(candidate);
    if (hash.startsWith("0".repeat(DIFFICULTY))) {
      candidate.hash = hash;
      block = candidate;
      break;
    }
    nonce++;
    // make sure we don't busy-loop forever in case DIFFICULTY high
    if (nonce % 200000 === 0) {
      // yield event loop a bit
      // (in production, move mining to worker thread or separate process)
    }
  }
  blockchain.push(block);
  balances[address] = (balances[address] || 0) + rewardValue;
  supply += rewardValue;
  saveChainToDisk();
  broadcast({ type: "NEW_BLOCK", data: block });
  return block;
}

// Mine endpoint (uses PoW)
app.post("/mine", (req, res) => {
  const { address, reward } = req.body;
  const rewardValue = reward ? Number(reward) : DEFAULT_REWARD;
  if (!address) return res.status(400).json({ error: "No address" });
  if (!Number.isFinite(rewardValue) || rewardValue < MIN_REWARD) {
    return res.status(400).json({ error: "Invalid reward value" });
  }
  if (supply + rewardValue > MAX_SUPPLY) {
    return res.status(400).json({ error: "Max supply reached or reward would exceed max supply" });
  }
  try {
    const block = mineBlockFor(address, rewardValue);
    return res.json({ message: "⛏️ KTC mined ⛓️", block, balance: balances[address], supply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Wallet info
app.get("/wallet/:address", (req, res) => {
  const address = req.params.address;
  res.json({
    balance: balances[address] || 0,
    blocks: blockchain.filter(b => b.data && b.data.to === address).length,
    supply
  });
});

// compatibility endpoints used by your HTML
app.get("/create-wallet", (req, res) => {
  // DO NOT RETURN private keys from server in production
  const addr = sha256(String(Math.random()) + Date.now()).slice(0, 32);
  res.json({ address: addr });
});

app.get("/balance", (req, res) => {
  res.json({ supply, knownAddresses: Object.keys(balances).length });
});

// Send transaction (no signature verification - simple)
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;
  const amt = Number(amount);
  if (!from || !to || !Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "Invalid from/to/amount" });
  }
  if (!balances[from] || balances[from] < amt) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  balances[from] -= amt;
  balances[to] = (balances[to] || 0) + amt;

  const prevBlock = blockchain[blockchain.length - 1];
  const block = {
    index: blockchain.length,
    timestamp: Date.now(),
    data: { from, to, amount: amt },
    prevHash: prevBlock.hash,
    nonce: 0
  };
  block.hash = calculateHash(block);
  // ensure it passes PoW difficulty check (we can accept tx-blocks without pow for simplicity)
  // but require block.hash leadings zeros to be valid
  // If you prefer, you can disable the difficulty check for tx blocks by adjusting isValidBlock.
  blockchain.push(block);
  saveChainToDisk();
  broadcast({ type: "NEW_BLOCK", data: block });
  res.json({ message: "Transaction confirmed", block });
});

// Blockchain log
app.get("/blocks", (req, res) => res.json(blockchain));

// Basic status
app.get("/status", (req, res) => {
  res.json({
    blocks: blockchain.length,
    peers: sockets.length,
    supply,
    maxSupply: MAX_SUPPLY,
    difficulty: DIFFICULTY
  });
});

// start HTTP server
app.listen(HTTP_PORT, () => console.log(`✅ HTTP Server running at http://localhost:${HTTP_PORT}`));

// P2P server
const wss = new WebSocket.Server({ port: P2P_PORT });
wss.on("connection", ws => initConnection(ws));
console.log("🌏📡 P2P WebSocket running on port:", P2P_PORT);

// connect to initial peers
peers.forEach(p => {
  const peerUrl = p.startsWith("ws://") || p.startsWith("wss://") ? p : `ws://${p}`;
  connectToPeer(peerUrl);
});

// save on exit
process.on("SIGINT", () => { console.log("✋ Shutting down, saving chain..."); saveChainToDisk(); process.exit(); });
process.on("SIGTERM", () => { console.log("✋ Shutting down, saving chain..."); saveChainToDisk(); process.exit(); });
