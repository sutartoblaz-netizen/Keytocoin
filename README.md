# 🔐 KeytoCoin Wallet – Blockchain Online

![GitHub Repo Size](https://img.shields.io/github/repo-size/USERNAME/REPO?style=flat-square)
![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

KeytoCoin Wallet is a **browser-based blockchain wallet** for **KeytoCoin (KTC)**.  
It allows users to **create wallets**, **mine blocks**, **send transactions**, and **swap KTC tokens** — all in the browser, with **interactive animations**.

---

## 🌟 Features

- **Wallet Management**  
  - Generate a new wallet with a private key and address  
  - Load and clear wallet from browser local storage  

- **Mining**  
  - Start/stop mining blocks  
  - Real-time blockchain log  
  - Display mined blocks and total supply  

- **Transactions & Swap**  
  - Send KTC to other addresses  
  - Swap KTC to other tokens (IDR)
- **Animations**  
  - Coin rain effect  
  - Animated brick-style text for KeytoCoin branding  

---

## 🖥️ Demo Animation

![Coin Rain Animation](https://raw.githubusercontent.com/USERNAME/REPO/main/coin_rain.gif)

> Replace the URL above with your uploaded GIF if different.

---

## 🚀 How to Use

1. **Open the HTML file**  
   Open `keytocoin.html` in a modern browser.

2. **Create Wallet**  
   Click `Create Wallet` → Wallet address and private key will appear.

3. **Start Mining**  
   Click `Start Mining` to mine blocks. Click `Stop Mining` to stop.

4. **Send Transactions**  
   Enter recipient address and amount → Click `Send`.

5. **Swap KTC**  
   Enter token and amount → Click `Swap`. Result shows below.

6. **View Blockchain Log**  
   All activity is displayed in the log panel.

---

## ⚙️ Setup Backend

Update this line in `keytocoin.html` to point to your **live backend server**:

```javascript
const API = "https://your-backend-url.com"; // Replace with live backend URL
