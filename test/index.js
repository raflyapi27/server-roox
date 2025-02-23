require("dotenv").config();
const express = require("express");
const cors = require("cors");
const midtransClient = require("midtrans-client");
const RouterClient = require("../index.js");
const Logger = require("../src/logger.js");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json()); // Agar dapat menerima request dengan format JSON

const logger = Logger.createLogger("@mhycy/routeros-client/test/voucher.js", Logger.LEVEL.DEBUG);

// ==================== KONFIGURASI MIKROTIK ====================
const connectOptions = {
  host: process.env.MIKROTIK_HOST || "192.168.1.10",
  port: 8728,
  debug: true,
};

const client = RouterClient.createClient(connectOptions);

// Fungsi untuk membuat voucher dengan username dan password dari user
// API untuk membuat voucher setelah pembayaran berhasil
app.post("/api/create-voucher-after-payment", async (req, res) => {
  const { orderId, voucherCode, profile } = req.body;

  if (!orderId || !voucherCode || !profile) {
    return res.status(400).json({ error: "Order ID, voucher code, and profile are required" });
  }

  try {
    // Mengecek status transaksi melalui Midtrans
    const transactionStatus = await snap.transaction.status(orderId);

    // Periksa apakah status transaksi 'settlement' (berhasil)
    if (transactionStatus.transaction_status === "settlement") {
      console.log(`Transaction ${orderId} is successfully settled`);

      // Login ke Mikrotik dan buat voucher dengan profile yang sesuai
      await client.login(process.env.MIKROTIK_USER, process.env.MIKROTIK_PASS);

      logger.info(`<Test> Creating Voucher: ${voucherCode} with Profile: ${profile}`);

      await client.command("/ip/hotspot/user/add").setAttrs({
        name: voucherCode,
        password: voucherCode, // Anda bisa menyesuaikan password
        profile: profile,  // Menetapkan profile sesuai dengan paket
        comment: "Voucher User Defined",
      }).get();

      logger.info("<Test> Voucher created successfully");

      res.json({ success: true, message: `Voucher ${voucherCode} created with profile ${profile}` });
    } else {
      res.status(400).json({ error: "Transaction not settled yet" });
    }
  } catch (error) {
    console.error("Error creating voucher:", error);
    res.status(500).json({ error: "Failed to create voucher" });
  }
});


// ==================== KONFIGURASI MIDTRANS ====================
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
});

// API untuk mengecek status transaksi dan membuat voucher dengan username dan password user
app.post("/api/order-status", async (req, res) => {
  const { orderId, username, password } = req.body;

  if (!orderId || !username || !password) {
    return res.status(400).json({ error: "Order ID, username, and password are required" });
  }

  try {
    const transactionStatus = await snap.transaction.status(orderId);

    // Mengirimkan status transaksi terlebih dahulu
    res.json(transactionStatus);

    // Periksa jika status transaksi adalah 'settlement' (berhasil)
    if (transactionStatus.transaction_status === "settlement") {
      console.log(`Transaction ${orderId} is successfully settled`);

      // Generate voucher dengan username dan password yang ditentukan
      const voucher = await createVoucher(username, password);
      console.log("Voucher created:", voucher);
    }
  } catch (error) {
    console.error("Error fetching transaction status by orderId:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to fetch transaction status by orderId" });
    }
  }
});

// API untuk membuat pembayaran baru
app.post("/api/payment", async (req, res) => {
  try {
    const { orderId, grossAmount, customerName, phone } = req.body;

    if (!orderId || !grossAmount || !customerName || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: customerName,
        phone: phone,
      },
    };

    const transaction = await snap.createTransaction(parameter);
    res.json({ token: transaction.token });
  } catch (error) {
    console.error("Midtrans Payment Error:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// API untuk membuat voucher setelah pembayaran berhasil
// API untuk membuat voucher
app.post("/api/create-voucher", async (req, res) => {
  const { orderId, voucherCode, profile } = req.body;

  if (!orderId || !voucherCode || !profile) {
    return res.status(400).json({ error: "Order ID, voucher code, and profile are required" });
  }

  try {
    // Login ke Mikrotik dan buat voucher dengan profile yang sesuai
    await client.login(process.env.MIKROTIK_USER, process.env.MIKROTIK_PASS);

    logger.info(`<Test> Creating Voucher: ${voucherCode} with Profile: ${profile}`);

    await client.command("/ip/hotspot/user/add").setAttrs({
      name: voucherCode,
      password: voucherCode, // Anda bisa menyesuaikan password
      profile: profile,  // Menetapkan profile sesuai dengan paket
      comment: "Voucher User Defined",
    }).get();

    logger.info("<Test> Voucher created successfully");

    res.json({ success: true, message: `Voucher ${voucherCode} created with profile ${profile}` });
  } catch (error) {
    logger.error("Error creating voucher:", error);
    res.status(500).json({ error: "Failed to create voucher" });
  }
});

// ==================== KONFIGURASI MIKROTIK (Update Pengguna Aktif) ====================
let cachedActiveUsers = { count: 0, users: [] };

async function updateActiveUsers() {
  try {
    console.log("Fetching active users...");
    await client.login(process.env.MIKROTIK_USER, process.env.MIKROTIK_PASS);
    const result = await client.command("/ip/hotspot/active/print").get();

    const users = result.replies || [];
    cachedActiveUsers = { count: users.length, users: users };

    console.log("Updated Active Users Count:", cachedActiveUsers.count);
  } catch (error) {
    console.error("Error updating active users:", error);
  }
}

app.get("/active-users", (req, res) => {
  res.json(cachedActiveUsers);
});

updateActiveUsers();
setInterval(updateActiveUsers, 60000);

// ==================== MENJALANKAN SERVER ====================
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
