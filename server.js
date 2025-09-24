const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");

const HTTP_PORT = process.env.HTTP_PORT || 3005;
const P2P_PORT = process.env.P2P_PORT || 6006;
const peers = process.env.PEERS ? process.env.PEERS.split(",") : [];

let blockchain = [];
let balances = {};
let supply = 0;
const MAX_SUPPLY = 17000000;

// === GENESIS BLOCK ===
function createGenesisBlock() {
  return {
    index: 0,
    timestamp: Date.now(),
    data: "Genesis Block",
    prevHash: "0",
    hash: "0"
  };
}
blockchain.push(createGenesisBlock());

// === HASH FUNCTION ===
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// === P2P SETUP ===
let sockets = [];

function connectToPeer(peer) {
  const ws = new WebSocket(peer);
  ws.on("open", () => initConnection(ws));
  ws.on("error", () => console.log("❌ Connection failed", peer));
}

function initConnection(ws) {
  sockets.push(ws);
  console.log("🔗 Peer connected");
  ws.on("message", data => handleMessage(ws, data));
  ws.send(JSON.stringify({ type: "BLOCKCHAIN", data: blockchain }));
}

function broadcast(message) {
  sockets.forEach(ws => ws.send(JSON.stringify(message)));
}

function handleMessage(ws, data) {
  const msg = JSON.parse(data);
  if (msg.type === "BLOCKCHAIN") {
    if (msg.data.length > blockchain.length) {
      console.log("📥 Received longer chain, replacing...");
      blockchain = msg.data;
    }
  }
  if (msg.type === "NEW_BLOCK") {
    blockchain.push(msg.data);
    console.log("📥 Block added from peer:", msg.data.index);
  }
}

// 🔔 Notifikasi transaksi masuk ke penerima
    console.log(`🔔 Notifikasi: ${msg.data.amount} ma>
  }
}

// === HTTP SERVER (API) ===
const app = express();
app.use(bodyParser.json());

// Mining
app.post("/mine", (req, res) => {
  const { address } = req.body;
  if (!address) return res.json({ error: "No address" });
  if (supply >= MAX_SUPPLY) return res.json({ error: "Max supply reached" });

  let prevBlock = blockchain[blockchain.length - 1];
  let block = {
    index: blockchain.length,
    timestamp: Date.now(),
    data: { reward: 10, to: address },
    prevHash: prevBlock.hash,
  };
  block.hash = sha256(JSON.stringify(block));
  blockchain.push(block);

  balances[address] = (balances[address] || 0) + 10;
  supply += 10;

  broadcast({ type: "NEW_BLOCK", data: block });
  res.json({ message: "⛏️ KTC mined ⛓️", block, balance: balances[address], supply });
});

// Wallet info
app.get("/wallet/:address", (req, res) => {
  let address = req.params.address;
  res.json({
    balance: balances[address] || 0,
    blocks: blockchain.filter(b => b.data.to === address).length,
    supply
  });
});

// Send transaction
app.post("/send", (req, res) => {
  const { from, to, amount } = req.body;
  if (!balances[from] || balances[from] < amount) {
    return res.json({ error: "Insufficient balance" });
  }
  balances[from] -= amount;
  balances[to] = (balances[to] || 0) + amount;

  let prevBlock = blockchain[blockchain.length - 1];
  let block = {
    index: blockchain.length,
    timestamp: Date.now(),
    data: { from, to, amount },
    prevHash: prevBlock.hash,
  };
  block.hash = sha256(JSON.stringify(block));
  blockchain.push(block);

  broadcast({ type: "NEW_BLOCK", data: block });
  res.json({ message: "Transaction confirmed", block });
});

// Blockchain log
app.get("/blocks", (req, res) => res.json(blockchain));

app.listen(HTTP_PORT, () => console.log(`✅ HTTP Server running at http://localhost:${HTTP_PORT}`));

// P2P server
const wss = new WebSocket.Server({ port: P2P_PORT });
wss.on("connection", ws => initConnection(ws));
console.log("🌏📡 P2P WebSocket running on port:", P2P_PORT);

// Connect to initial peers
peers.forEach(connectToPeer);
