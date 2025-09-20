# 🧱 KeytoCoin Wallet – Online Blockchain

█▄░█ █▀▀ █▄█ ▀█▀ █▀█ █▀█ █ █▄░█  
      █░▀█ ██▄ ░█░ ░█░ █▄█ █▀▄ █ █░▀█  

💰 **Blockchain Wallet Simulation + Mining + Swap to IDR**  
🎮 Built with **HTML + CSS + JS**  
✨ Featuring **2D Coin Rain** + **Trigonometric Floating Coins**  

---

## 🚀 Features
- 🔐 **Wallet** → create, save, clear, and manage addresses.
- ⚒️ **Mining** → mine blocks automatically every 5 seconds.
- 💸 **Transactions** → send KTC to other wallets.
- 🔄 **Swap** → exchange KTC into Rupiah (fixed rate `1 KTC = Rp10,000`).
- 🏦 **Withdraw** → withdraw Rupiah balance to bank account.
- 📂 **Saved Wallets** → store multiple addresses in LocalStorage.
- 🎆 **2D Animations**  
  - ✨ Coin Rain (gold coins falling)  
  - 🌊 Trigonometric Floating Coins (sinusoidal movement)

---

## 📸 UI Preview
- **Coin Rain Animation:**  
  KTC coins fall from the top of the screen like golden rain.  
- **Trig Floating Coins:**  
  KTC coins float smoothly following a sine wave.  
- **Brick Gradient Text:**  
  Gradient brick-style animated logo 🔥.  

---

## ⚙️ How to Use

### 1. Run the Backend API
This project requires a **simple backend server** (Node.js/Express) with the following endpoints:

- `POST /mine` → mine a block for a given wallet address.  
- `GET /wallet/:address` → check wallet balance & mined blocks.  
- `POST /send` → send transactions between wallets.  

> **Default API URL:** `http://localhost:3000`  
> (You can change it in the `API` variable inside the HTML code.)

### 2. Open the Wallet
- Open **`index.html`** in your browser.  
- Click **Create Wallet** → generates `privKey` + `address`.  

### 3. Mining
- Click **Start Mining** to begin block mining.  
- Click **Stop Mining** to halt mining.  
- Rewards are automatically credited to your wallet.

### 4. Transactions
- Enter the recipient address + KTC amount.  
- Click **Send** → transaction is broadcast via the server API.

### 5. Swap to IDR
- Enter KTC amount in the **Swap** field.  
- Click **Swap** → your KTC is deducted & IDR balance increases.  

### 6. Withdraw
- Enter your **bank account number** + Rupiah amount.  
- Click **Withdraw** → IDR balance decreases & withdrawal is logged.

### 7. Multi-Wallet
- Click **Save Address** to save the current wallet.  
- All addresses are stored in LocalStorage → visible in the **Saved Wallets** list.

---

## 🎨 2D Animations

- **Coin Rain (CSS + JS)**  
  ```css
  .coin {
    position:fixed;
    top:-60px;
    width:50px;height:50px;
    border-radius:50%;
    background:radial-gradient(circle at 30% 30%,#ffd700,#c99700);
    animation:fall linear forwards;
  }
  @keyframes fall {
    to { transform:translateY(110vh) rotate(360deg); opacity:0.8; }
  }
