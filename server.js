// server.js
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
const MIN_REWARD = 1;
const DEFAULT_REWARD = 1;

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
  };
  block.hash = sha256(JSON.stringify({ ...block, hash: undefined }));
  return block;
}

// init with genesis
blockchain.push(createGenesisBlock());
rebuildBalances();

// === BLOCK / CHAIN VALIDATION ===
function calculateHash(block) {
  // exclude hash field when calculating
  return sha256(JSON.stringify({ ...block, hash: undefined }));
}

function isValidBlock(newBlock, prevBlock) {
  if (!newBlock || !prevBlock) return false;
  if (prevBlock.index + 1 !== newBlock.index) return false;
  if (prevBlock.hash !== newBlock.prevHash) return false;
  if (calculateHash(newBlock) !== newBlock.hash) return false;
  return true;
}

function isValidChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return false;
  // check genesis
  const genesis = chain[0];
  const ourGenesis = blockchain[0];
  if (calculateHash(genesis) !== genesis.hash) return false;
  // validate sequentially
  for (let i = 1; i < chain.length; i++) {
    const newBlock = chain[i];
    const prevBlock = chain[i - 1];
    if (!isValidBlock(newBlock, prevBlock)) return false;
  }
  return true;
}

// === BALANCES REBUILD ===
function rebuildBalances() {
  balances = {};
  supply = 0;
  for (let block of blockchain) {
    if (block.index === 0) continue; // skip genesis
    const d = block.data;
    if (!d) continue;
    // mining reward pattern: { reward: X, to: address }
    if (d.reward && d.to) {
      balances[d.to] = (balances[d.to] || 0) + Number(d.reward);
      supply += Number(d.reward);
    } else if (d.amount && d.from && d.to) {
      // transfer
      balances[d.from] = (balances[d.from] || 0) - Number(d.amount);
      balances[d.to] = (balances[d.to] || 0) + Number(d.amount);
    }
  }
}

// === P2P SETUP ===
let sockets = [];

function initConnection(ws) {
  sockets.push(ws);
  console.log("🔗 Peer connected (total peers:", sockets.length + ")");
  ws.on("message", data => {
    handleMessage(ws, data);
  });
  ws.on("close", () => {
    sockets = sockets.filter(s => s !== ws);
    console.log("🔌 Peer disconnected (remaining:", sockets.length + ")");
  });
  ws.on("error", (err) => {
    sockets = sockets.filter(s => s !== ws);
    console.log("❌ Peer error:", err.message || err);
  });

  // send our current blockchain (peers will decide whether to replace)
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
      try { ws.send(msg); } catch (e) { /* ignore send errors */ }
    }
  });
}

function handleMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch (e) {
    console.log("❌ Received invalid JSON:", data);
    return;
  }

  if (msg.type === "BLOCKCHAIN" && Array.isArray(msg.data)) {
    // Received a full chain from peer
    try {
      const incomingChain = msg.data;
      if (incomingChain.length > blockchain.length && isValidChain(incomingChain)) {
        console.log("📥 Received longer valid chain — replacing local chain...");
        blockchain = incomingChain;
        rebuildBalances();
      } else {
        // if incoming chain is longer but invalid, ignore
        if (incomingChain.length > blockchain.length) {
          console.log("❌ Received longer chain but invalid — rejected.");
        }
      }
    } catch (e) {
      console.log("❌ Error processing incoming chain:", e.message || e);
    }
    return;
  }

  if (msg.type === "NEW_BLOCK" && msg.data) {
    try {
      const newBlock = msg.data;
      const prevBlock = blockchain[blockchain.length - 1];

      if (isValidBlock(newBlock, prevBlock)) {
        blockchain.push(newBlock);

        // apply the block to balances/supply
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

        console.log("📥 Block added from peer:", newBlock.index);
      } else {
        console.log("❌ Invalid NEW_BLOCK received — rejected.");
      }
    } catch (e) {
      console.log("❌ Error handling NEW_BLOCK:", e.message || e);
    }
    return;
  }

  // unknown message type
  console.log("ℹ️ Unknown message type:", msg.type);
}

// === HTTP SERVER (API) ===
const app = express();
app.use(bodyParser.json());

// Mining
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

  let prevBlock = blockchain[blockchain.length - 1];
  let block = {
    index: blockchain.length,
    timestamp: Date.now(),
    data: { reward: rewardValue, to: address },
    prevHash: prevBlock.hash,
  };
  block.hash = calculateHash(block);
  blockchain.push(block);

  balances[address] = (balances[address] || 0) + rewardValue;
  supply += rewardValue;

  broadcast({ type: "NEW_BLOCK", data: block });
  res.json({ message: "⛏️ KTC mined ⛓️", block, balance: balances[address], supply });
});

// Wallet info
app.get("/wallet/:address", (req, res) => {
  let address = req.params.address;
  res.json({
    balance: balances[address] || 0,
    blocks: blockchain.filter(b => b.data && b.data.to === address).length,
    supply
  });
});

// Send transaction
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

  let prevBlock = blockchain[blockchain.length - 1];
  let block = {
    index: blockchain.length,
    timestamp: Date.now(),
    data: { from, to, amount: amt },
    prevHash: prevBlock.hash,
  };
  block.hash = calculateHash(block);
  blockchain.push(block);

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
    maxSupply: MAX_SUPPLY
  });
});

app.listen(HTTP_PORT, () => console.log(`✅ HTTP Server running at http://localhost:${HTTP_PORT}`));

// P2P server
const wss = new WebSocket.Server({ port: P2P_PORT });
wss.on("connection", ws => initConnection(ws));
console.log("🌏📡 P2P WebSocket running on port:", P2P_PORT);

// Connect to initial peers
peers.forEach(p => {
  // accept both "ws://..." and bare "host:port" forms
  const peerUrl = p.startsWith("ws://") || p.startsWith("wss://") ? p : `ws://${p}`;
  connectToPeer(peerUrl);
});
