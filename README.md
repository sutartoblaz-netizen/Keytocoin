# 🧱 KeytoCoin Wallet – Online Blockchain

KeytoCoin Wallet is a **blockchain + crypto wallet simulation** built with **HTML + JavaScript**, integrated with a **Node.js Express backend**.  
It supports mining, transactions, KTC-to-IDR swaps, and even bank withdrawals through the **Xendit API**.  

In addition to the core blockchain features, this wallet also comes with **advanced 2D animations** for an engaging visual experience 🎨✨.

---

## 🚀 Key Features

- 🔐 **Crypto Wallet**
  - Generate a new wallet (auto private key & address)
  - Save / load wallet using LocalStorage
  - Multi-wallet support

- ⚡ **Mining**
  - Auto mine blocks every 5 seconds
  - Track total supply (max 17 million KTC)

- 💸 **Transactions**
  - Send KTC to another wallet address
  - Simple signature system with hashing

- 🔄 **Swap KTC → IDR**
  - Fixed rate: 1 KTC = Rp10,000
  - IDR balance stored in LocalStorage

- 🏦 **Withdraw IDR**
  - Enter bank account number
  - Deducts IDR balance
  - Backend can be integrated with **Xendit Disbursement API** for real bank/e-wallet transfers

- 🎨 **Advanced 2D Animations**
  - 🌧️ **Coin Rain**: Golden coins fall randomly across the screen
  - 🔵 **Trigonometric Floating Coins**: Blue coins move in a sinusoidal pattern
  - 🧱 **Brick Gradient Text**: Titles with animated gradient color effects

---

## 🛠️ Backend Installation (Node.js + Express)

1. Clone / download this project  
2. Install dependencies:
   ```bash
   npm install
