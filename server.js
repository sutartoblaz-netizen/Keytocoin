// server.js — Non-blocking mining + global access
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

const HTTP_PORT = process.env.HTTP_PORT || 3005;
const P2P_PORT = process.env.P2P_PORT || 6006;
const peers = process.env.PEERS ? process.env.PEERS.split(",") : [];

let blockchain = [];
let balances = {};
let supply = 0;
const MAX_SUPPLY = 17000000;
const MIN_REWARD = 1;
const DEFAULT_REWARD = 1;

let DIFFICULTY = 3; // leading zeros
const CHAIN_FOLDER = path.resolve(__dirname, "data");
const CHAIN_FILE = path.join(CHAIN_FOLDER, "blockchain.json");

// === HASH FUNCTION ===
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// === GENESIS BLOCK ===
function createGenesisBlock() {
  const block = { index: 0, timestamp: Date.now(), data: "Genesis Block", prevHash: "0", nonce: 0 };
  block.hash = calculateHash(block);
  return block;
}

// === HASH CALC ===
function calculateHash(block) {
  const clone = { ...block, hash: undefined };
  return sha256(JSON.stringify(clone));
}

// === PERSISTENCE ===
function ensureDataFolder() { if (!fs.existsSync(CHAIN_FOLDER)) fs.mkdirSync(CHAIN_FOLDER, { recursive: true }); }
function saveChainToDisk() { try { ensureDataFolder(); fs.writeFileSync(CHAIN_FILE, JSON.stringify(blockchain, null, 2)); } catch(e){ console.error("Save error:", e.message); } }
function loadChainFromDisk() {
  try {
    if (fs.existsSync(CHAIN_FILE)) {
      const raw = fs.readFileSync(CHAIN_FILE, "utf8");
      const c = JSON.parse(raw);
      if (Array.isArray(c) && c.length > 0 && calculateHash(c[0]) === c[0].hash) {
        blockchain = c;
        rebuildBalances();
        console.log("🔁 Chain loaded:", blockchain.length, "blocks");
        return;
      }
    }
  } catch(e){ console.error("Load error:", e.message); }
}

// === BALANCES ===
function rebuildBalances() {
  balances = {};
  supply = 0;
  for (let block of blockchain) {
    if (block.index === 0) continue;
    const d = block.data;
    if (!d) continue;
    if (d.reward && d.to) {
      balances[d.to] = (balances[d.to]||0)+Number(d.reward);
      supply += Number(d.reward);
    } else if(d.amount && d.from && d.to){
      balances[d.from] = (balances[d.from]||0)-Number(d.amount);
      balances[d.to] = (balances[d.to]||0)+Number(d.amount);
    }
  }
}

// === BLOCK VALIDATION ===
function isValidBlock(newBlock, prevBlock) {
  if (!newBlock || !prevBlock) return false;
  if (prevBlock.index+1 !== newBlock.index) return false;
  if (prevBlock.hash !== newBlock.prevHash) return false;
  if (calculateHash(newBlock) !== newBlock.hash) return false;
  if (!newBlock.hash.startsWith("0".repeat(DIFFICULTY))) return false;
  return true;
}

function isValidChain(chain) {
  if (!Array.isArray(chain) || chain.length===0) return false;
  if (calculateHash(chain[0])!==chain[0].hash) return false;
  for (let i=1;i<chain.length;i++){
    if(!isValidBlock(chain[i],chain[i-1])) return false;
  }
  return true;
}

// === P2P ===
let sockets=[];
function initConnection(ws){
  sockets.push(ws);
  console.log("🔗 Peer connected. Total:", sockets.length);
  ws.on("message", data=>handleMessage(ws,data));
  ws.on("close", ()=>{ sockets=sockets.filter(s=>s!==ws); console.log("🔌 Peer disconnected. Remaining:", sockets.length); });
  ws.on("error", err=>{ sockets=sockets.filter(s=>s!==ws); console.log("❌ Peer error:", err.message||err); });
  ws.send(JSON.stringify({type:"BLOCKCHAIN",data:blockchain}));
}

function connectToPeer(peer){
  try {
    const ws=new WebSocket(peer);
    ws.on("open",()=>initConnection(ws));
    ws.on("error",err=>console.log("❌ Connect failed:",peer,err.message||err));
  } catch(e){ console.log("❌ connectToPeer exception:", e.message||e); }
}

function broadcast(msg){ const j=JSON.stringify(msg); sockets.forEach(ws=>{ if(ws.readyState===WebSocket.OPEN) ws.send(j); }); }

function handleMessage(ws,data){
  let msg;
  try{ msg=JSON.parse(data); } catch(e){ console.log("❌ Invalid JSON:",data); return; }
  if(msg.type==="BLOCKCHAIN" && Array.isArray(msg.data)){
    const incoming=msg.data;
    if(incoming.length>blockchain.length && isValidChain(incoming)){
      blockchain=incoming; rebuildBalances(); saveChainToDisk();
      console.log("📥 Replaced chain from peer.");
    } else if(incoming.length>blockchain.length){
      console.log("❌ Longer chain invalid, rejected.");
    }
    return;
  }
  if(msg.type==="NEW_BLOCK" && msg.data){
    const newBlock=msg.data;
    const prevBlock=blockchain[blockchain.length-1];
    if(isValidBlock(newBlock,prevBlock)){
      blockchain.push(newBlock);
      const d=newBlock.data;
      if(d){
        if(d.reward&&d.to){ balances[d.to]=(balances[d.to]||0)+Number(d.reward); supply+=Number(d.reward); }
        else if(d.amount&&d.from&&d.to){ balances[d.from]=(balances[d.from]||0)-Number(d.amount); balances[d.to]=(balances[d.to]||0)+Number(d.amount); }
      }
      saveChainToDisk();
      console.log("📥 Block added from peer:", newBlock.index);
    } else console.log("❌ Invalid NEW_BLOCK, rejected.");
    return;
  }
  console.log("ℹ️ Unknown message type:", msg.type);
}

// === BOOTSTRAP ===
blockchain.push(createGenesisBlock());
loadChainFromDisk();
rebuildBalances();

// === EXPRESS SERVER ===
const app=express();
app.use(bodyParser.json());
app.use((req,res,next)=>{ res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers","Content-Type"); next(); });

// === MINING (Worker) ===
function mineBlockAsync(address, rewardValue=DEFAULT_REWARD){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(`
      const { parentPort } = require('worker_threads');
      const crypto = require('crypto');
      function sha256(d){return crypto.createHash("sha256").update(d).digest("hex");}
      parentPort.on('message', msg=>{
        const { index, prevHash, reward, to, difficulty } = msg;
        let nonce=0, block=null;
        while(true){
          const candidate={ index, timestamp:Date.now(), data:{reward,to}, prevHash, nonce };
          const hash=sha256(JSON.stringify({...candidate,hash:undefined}));
          if(hash.startsWith('0'.repeat(difficulty))){ candidate.hash=hash; block=candidate; break; }
          nonce++;
          if(nonce%200000===0) require('deasync').sleep(0);
        }
        parentPort.postMessage(block);
      });
    `,{ eval:true });
    const prevBlock=blockchain[blockchain.length-1];
    worker.once('message', block=>{
      blockchain.push(block);
      balances[address]=(balances[address]||0)+rewardValue;
      supply+=rewardValue;
      saveChainToDisk();
      broadcast({type:"NEW_BLOCK",data:block});
      resolve(block);
    });
    worker.postMessage({ index:blockchain.length, prevHash:prevBlock.hash, reward:rewardValue, to:address, difficulty:DIFFICULTY });
  });
}

// Mining endpoint
app.post("/mine", async (req,res)=>{
  const { address, reward } = req.body;
  const rewardValue = reward?Number(reward):DEFAULT_REWARD;
  if(!address) return res.status(400).json({error:"No address"});
  if(!Number.isFinite(rewardValue)||rewardValue<MIN_REWARD) return res.status(400).json({error:"Invalid reward"});
  if(supply+rewardValue>MAX_SUPPLY) return res.status(400).json({error:"Max supply reached"});
  try{
    const block=await mineBlockAsync(address,rewardValue);
    res.json({message:"⛏️ KTC mined ⛓️",block,balance:balances[address],supply});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Wallet endpoints
app.get("/create-wallet",(req,res)=>res.json({address:sha256(String(Math.random())+Date.now()).slice(0,32)}));
app.get("/balance",(req,res)=>res.json({supply,knownAddresses:Object.keys(balances).length}));
app.get("/wallet/:address",(req,res)=>{
  const address=req.params.address;
  res.json({ balance:balances[address]||0, blocks:blockchain.filter(b=>b.data&&b.data.to===address).length, supply });
});
app.post("/send",(req,res)=>{
  const { from,to,amount }=req.body; const amt=Number(amount);
  if(!from||!to||!Number.isFinite(amt)||amt<=0) return res.status(400).json({error:"Invalid"});
  if(!balances[from]||balances[from]<amt) return res.status(400).json({error:"Insufficient"});
  balances[from]-=amt; balances[to]=(balances[to]||0)+amt;
  const prevBlock=blockchain[blockchain.length-1];
  const block={ index:blockchain.length, timestamp:Date.now(), data:{from,to,amount:amt}, prevHash:prevBlock.hash, nonce:0 };
  block.hash=calculateHash(block);
  blockchain.push(block); saveChainToDisk(); broadcast({type:"NEW_BLOCK",data:block});
  res.json({message:"Transaction confirmed",block});
});
app.get("/blocks",(req,res)=>res.json(blockchain));
app.get("/status",(req,res)=>res.json({blocks:blockchain.length,peers:sockets.length,supply,maxSupply:MAX_SUPPLY,difficulty:DIFFICULTY}));

// Start HTTP server (global)
app.listen(HTTP_PORT,'0.0.0.0',()=>console.log(`✅ HTTP Server running at http://0.0.0.0:${HTTP_PORT}`));

// P2P WebSocket
const wss=new WebSocket.Server({port:P2P_PORT});
wss.on("connection",ws=>initConnection(ws));
console.log("🌏📡 P2P WebSocket running on port:",P2P_PORT);
peers.forEach(p=>connectToPeer(p.startsWith("ws://")||p.startsWith("wss://")?p:`ws://${p}`));

// Save on exit
process.on("SIGINT",()=>{ console.log("✋ Shutting down..."); saveChainToDisk(); process.exit(); });
process.on("SIGTERM",()=>{ console.log("✋ Shutting down..."); saveChainToDisk(); process.exit(); });
