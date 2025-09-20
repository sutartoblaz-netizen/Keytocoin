# 🧱 KeytoCoin Wallet – Blockchain Online

█▄░█ █▀▀ █▄█ ▀█▀ █▀█ █▀█ █ █▄░█
      █░▀█ ██▄ ░█░ ░█░ █▄█ █▀▄ █ █░▀█
💰 **Dompet Blockchain Simulasi + Mining + Swap ke IDR**  
🎮 Dibuat dengan **HTML + CSS + JS**  
✨ Menyediakan animasi **2D Coin Rain** + **Trigonometri Coin Floating**  

---

## 🚀 Fitur
- 🔐 **Wallet** → buat, simpan, hapus, dan kelola alamat.
- ⚒️ **Mining** → tambang block otomatis setiap 5 detik.
- 💸 **Transaksi** → kirim KTC ke wallet lain.
- 🔄 **Swap** → tukar KTC ke Rupiah (kurs tetap `1 KTC = Rp10.000`).
- 🏦 **Withdraw** → tarik saldo Rupiah ke rekening.
- 📂 **Saved Wallets** → simpan banyak address dalam LocalStorage.
- 🎆 **Animasi 2D**  
  - ✨ Coin Rain (emas berjatuhan)  
  - 🌊 Trigonometric Floating Coin (bergerak sinusoidal)

---

## 📸 Tampilan UI
- **Coin Rain Animation:**  
  Koin KTC jatuh dari atas layar seperti hujan emas.  
- **Trig Floating Coins:**  
  Koin KTC melayang mengikuti kurva sinus.  
- **Brick Gradient Text:**  
  Logo teks bergerak dengan gradasi warna bata 🔥.  

---

## ⚙️ Cara Menggunakan

### 1. Jalankan Server API
Proyek ini butuh **server backend** sederhana (Node.js/Express) yang melayani endpoint:

- `POST /mine` → menambang block untuk wallet tertentu.  
- `GET /wallet/:address` → cek saldo & blok wallet.  
- `POST /send` → kirim transaksi antar wallet.  

> **Default API:** `http://localhost:3000`  
> (Ubah di variabel `API` di kode HTML jika perlu.)

### 2. Buka Wallet
- Buka file **`index.html`** di browser.  
- Klik tombol **Create Wallet** → otomatis menghasilkan `privKey` + `address`.  

### 3. Mining
- Klik **Start Mining** untuk mulai menambang block.  
- Klik **Stop Mining** untuk berhenti.  
- Reward langsung masuk ke saldo wallet.

### 4. Transaksi
- Masukkan alamat tujuan + jumlah KTC.  
- Klik **Send** → transaksi terkirim via server API.

### 5. Swap ke IDR
- Isi jumlah KTC di kolom **Swap**.  
- Klik **Swap** → otomatis mengurangi saldo KTC & menambah saldo Rupiah.  

### 6. Withdraw
- Masukkan **nomor rekening bank** + jumlah Rupiah.  
- Klik **Withdraw** → saldo IDR berkurang, transaksi tercatat di log.

### 7. Multi Wallet
- Klik **Save Address** untuk menyimpan wallet.  
- Semua address tersimpan di LocalStorage → muncul di daftar **Saved Wallets**.

---

## 🎨 Animasi 2D

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
  }let x=startX+Math.sin(t*speed)*amplitude;
coin.style.transform=`translate(${x}px, ${y}px)`;
