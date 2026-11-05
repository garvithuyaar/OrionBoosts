const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// ⚙️ SYSTEM CONFIGURATION & STATE
// ==========================================
const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const DISCORD_WEBHOOK_URL = ''; // Paste your Discord Webhook URL here to get live alerts

let LTC_USD = 85.00;
let lastRateUpdate = Date.now();
let totalApiRequests = 0;
let blockchainScans = 0;
let totalDonationsUsd = 0.00;

const orders = new Map();
const usedTxids = new Set();
const systemLogs = [];
const topDonators = [
  { name: 'Anonymous', amount: 5.00, time: Date.now() - 86400000 },
  { name: 'DiscordAdmin', amount: 2.50, time: Date.now() - 12000000 }
];

const PROMO_CODES = {
  'ORION10': { discount: 0.10, desc: '10% Off Launch Promo' },
  'VIPBOOST': { discount: 0.15, desc: '15% Off VIP Member' },
  'GARVIT': { discount: 0.25, desc: '25% Off Founder Special' },
  'MEGA50': { discount: 0.50, desc: '50% Off Secret Admin Code' }
};

// Serve logo
app.get('/1000056901.gif', (req, res) => {
  res.sendFile(path.join(__dirname, '1000056901.gif'));
});

// ==========================================
// 🛡️ CUSTOM SECURITY & LOGGING
// ==========================================
function addLog(type, msg) {
  const time = new Date().toISOString().split('T')[1].slice(0, 8);
  systemLogs.unshift({ time, type, msg });
  if (systemLogs.length > 50) systemLogs.pop();
  console.log(`[${time}] [${type}] ${msg}`);
}

async function sendDiscordWebhook(title, description, color, fields = []) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [{
        title: title,
        description: description,
        color: color,
        fields: fields,
        footer: { text: 'Orion Boosts System' },
        timestamp: new Date().toISOString()
      }]
    });
  } catch (err) {
    addLog('WEBHOOK', 'Failed to send Discord alert.');
  }
}

// Simple Rate Limiter Middleware
const ipRequestCounts = new Map();
app.use((req, res, next) => {
  totalApiRequests++;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const current = ipRequestCounts.get(ip) || { count: 0, resetTime: Date.now() + 60000 };
  
  if (Date.now() > current.resetTime) {
    current.count = 0;
    current.resetTime = Date.now() + 60000;
  }
  
  current.count++;
  ipRequestCounts.set(ip, current);
  
  if (current.count > 60) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

// ==========================================
// 💱 LIVE ORACLE & DATA
// ==========================================
async function updateLtcPrice() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd', { timeout: 5000 });
    if (res.data && res.data.litecoin && res.data.litecoin.usd) {
      LTC_USD = parseFloat(res.data.litecoin.usd);
      lastRateUpdate = Date.now();
      addLog('ORACLE', `Live LTC rate updated: $${LTC_USD.toFixed(2)}`);
    }
  } catch (err) {
    addLog('WARN', `Oracle sync failed, using cached rate: $${LTC_USD.toFixed(2)}`);
  }
}
updateLtcPrice();
setInterval(updateLtcPrice, 180000); // 3 minutes

// ==========================================
// 🌐 PUBLIC ENDPOINTS
// ==========================================
app.get('/api/metrics', (req, res) => {
  let pendingCount = 0;
  for (const o of orders.values()) if (o.status === 'pending' || o.status === 'detected') pendingCount++;
  
  res.json({
    status: 'online',
    ltcUsd: LTC_USD,
    totalDonations: totalDonationsUsd,
    totalOrders: orders.size,
    activeOrders: pendingCount,
    scans: blockchainScans,
    logs: systemLogs.slice(0, 15)
  });
});

app.get('/api/leaderboard', (req, res) => {
  // Sort donations highest to lowest
  const sorted = [...topDonators].sort((a, b) => b.amount - a.amount).slice(0, 5);
  res.json(sorted);
});

app.post('/api/validate-promo', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (PROMO_CODES[code]) {
    return res.json({ valid: true, code, discount: PROMO_CODES[code].discount, desc: PROMO_CODES[code].desc });
  }
  return res.json({ valid: false, error: 'Invalid or expired promo code.' });
});

// ==========================================
// 🛒 CHECKOUT ENGINE
// ==========================================
app.post('/api/checkout', (req, res) => {
  const { type, donateAmount, plan, qty, serverId, serverName, method, promoCode, donorName } = req.body;
  const isDonation = type === 'donation';
  const orderId = `ORB-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).slice(-3).toUpperCase()}`;

  let totalUsd = 0;
  let productName = '';
  
  if (isDonation) {
    totalUsd = Math.max(0.5, Math.min(100, parseFloat(donateAmount) || 1));
    productName = 'Orion Support Donation';
  } else {
    const cleanQty = Math.min(30, Math.max(2, parseInt(qty, 10) || 2));
    // Pricing Tiers
    let pricePerTwo = 0.27; // 1M
    if (plan === '3M') pricePerTwo = 0.88;
    if (plan === '12M') pricePerTwo = 2.99; // New 1 Year Plan
    
    totalUsd = (cleanQty / 2) * pricePerTwo;
    productName = `${plan} Server Boosts`;
    
    const cleanPromo = String(promoCode || '').trim().toUpperCase();
    if (PROMO_CODES[cleanPromo]) {
      totalUsd = totalUsd * (1 - PROMO_CODES[cleanPromo].discount);
    }
    totalUsd = Math.max(0.10, parseFloat(totalUsd.toFixed(2)));
  }

  // Fractional Fingerprinting
  const baseLtc = totalUsd / LTC_USD;
  let exactLtc = parseFloat((baseLtc + (Math.floor(Math.random() * 8800) + 1000) / 1e8).toFixed(8));
  let expectedLitoshis = Math.round(exactLtc * 100000000);

  // Collision Prevention
  for (const existing of orders.values()) {
    if (existing.status === 'pending' && Math.abs(existing.expectedLitoshis - expectedLitoshis) < 500) {
      expectedLitoshis += 888;
      exactLtc = parseFloat((expectedLitoshis / 100000000).toFixed(8));
    }
  }

  const toleranceLitoshis = Math.round((0.04 / LTC_USD) * 100000000);
  const minRequiredLitoshis = Math.max(1000, expectedLitoshis - toleranceLitoshis);

  const newOrder = {
    id: orderId,
    type: isDonation ? 'donation' : 'boost',
    productName: productName,
    donorName: donorName || 'Anonymous',
    usd: totalUsd,
    exactLtc,
    expectedLitoshis,
    minRequiredLitoshis,
    server: serverId || (isDonation ? 'N/A' : 'Unknown'),
    serverName: serverName || 'Unknown',
    method: method === 'manual' ? 'manual' : 'auto',
    secretKey: 'Orion-Shop-67SixSeven',
    status: 'pending',
    confirmations: 0,
    txid: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1800000,
    counted: false
  };

  orders.set(orderId, newOrder);
  addLog('ORDER', `Created ${orderId} | ${newOrder.type} | ${exactLtc} LTC ($${totalUsd})`);
  
  // Discord Alert
  sendDiscordWebhook(
    '🛒 New Checkout Generated',
    `A user initiated a checkout for **$${totalUsd.toFixed(2)} USD**.\n**Type:** ${newOrder.type}\n**Server:** ${newOrder.serverName}`,
    16742912 // Orange
  );

  res.json({ orderId, exactLtc, usd: totalUsd, ltcRate: LTC_USD, expiresAt: newOrder.expiresAt, method: newOrder.method });
});

// ==========================================
// 🔍 MANUAL VERIFICATION
// ==========================================
app.post('/api/verify-txid', async (req, res) => {
  const { orderId, txid } = req.body;
  const cleanTx = String(txid || '').trim();
  const order = orders.get(orderId);

  if (!order) return res.status(404).json({ success: false, error: 'Order session not found.' });
  if (!/^[0-9a-fA-F]{64}$/.test(cleanTx)) return res.json({ success: false, error: 'Invalid 64-character TXID.' });
  if (usedTxids.has(cleanTx) && order.txid !== cleanTx) return res.json({ success: false, error: 'TXID already claimed.' });

  try {
    const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${cleanTx}`, { timeout: 7000 });
    const data = response.data;
    const txTime = data.received ? new Date(data.received).getTime() : Date.now();
    
    if (txTime < order.createdAt - 120000) {
      return res.json({ success: false, error: 'Transaction predates this invoice session.' });
    }

    let matchedValue = 0;
    for (const output of (data.outputs || [])) {
      if (output.addresses && output.addresses.includes(RECEIVER_ADDRESS)) matchedValue += output.value;
    }

    if (matchedValue < order.minRequiredLitoshis) {
      return res.json({ success: false, error: `Underpayment detected. Minimum required is ${(order.minRequiredLitoshis / 1e8).toFixed(8)} LTC.` });
    }

    usedTxids.add(cleanTx);
    order.txid = cleanTx;
    order.confirmations = data.confirmations || 0;

    if (order.confirmations > 0) {
      order.status = 'confirmed';
      if (order.type === 'donation' && !order.counted) {
        totalDonationsUsd += order.usd;
        order.counted = true;
        topDonators.push({ name: order.donorName, amount: order.usd, time: Date.now() });
      }
      addLog('CONFIRMED', `Manual TXID verified for ${order.id}`);
    } else {
      order.status = 'detected';
      addLog('DETECTED', `Manual TXID detected (0/2 confs) for ${order.id}`);
    }

    return res.json({ success: true, status: order.status, confirmations: order.confirmations, order });
  } catch (err) {
    return res.json({ success: false, error: 'Unable to locate TXID on mainnet yet. Wait 15s and retry.' });
  }
});

// ==========================================
// 📡 BACKGROUND BLOCKCHAIN TRACKER
// ==========================================
setInterval(async () => {
  let hasActive = false;
  const now = Date.now();

  for (const [id, order] of orders.entries()) {
    if (order.status === 'pending' || order.status === 'detected') {
      if (now > order.expiresAt && order.status === 'pending') {
        order.status = 'expired';
        addLog('EXPIRED', `Order ${id} timed out.`);
      } else {
        hasActive = true;
      }
    }
  }

  if (!hasActive) return;

  try {
    blockchainScans++;
    const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/addrs/${RECEIVER_ADDRESS}`, { timeout: 8000 });
    const data = response.data;

    const allTxs = [
      ...(data.unconfirmed_txrefs || []).map(t => ({ ...t, confs: 0 })),
      ...(data.txrefs || []).map(t => ({ ...t, confs: t.confirmations || 1 }))
    ];
    const incomingTxs = allTxs.filter(t => t.tx_input_n < 0);

    for (const [id, order] of orders.entries()) {
      if (order.status !== 'pending' && order.status !== 'detected') continue;

      const match = incomingTxs.find(t => {
        const txTime = t.received ? new Date(t.received).getTime() : Date.now();
        return txTime >= (order.createdAt - 120000) && 
               (!usedTxids.has(t.tx_hash) || order.txid === t.tx_hash) && 
               t.value >= order.minRequiredLitoshis && 
               t.value <= (order.expectedLitoshis + 500000);
      });

      if (match) {
        usedTxids.add(match.tx_hash);
        order.txid = match.tx_hash;
        order.confirmations = match.confs;

        if (match.confs >= 1 && order.status !== 'confirmed') {
          order.status = 'confirmed';
          order.confirmedAt = new Date().toISOString();
          
          if (order.type === 'donation' && !order.counted) {
            totalDonationsUsd += order.usd;
            order.counted = true;
            topDonators.push({ name: order.donorName, amount: order.usd, time: Date.now() });
            addLog('DONATION', `Received $${order.usd.toFixed(2)} donation automatically!`);
            sendDiscordWebhook('💖 New Donation Received!', `**${order.donorName}** just donated **$${order.usd.toFixed(2)}**!`, 65280);
          } else {
            addLog('CONFIRMED', `[1/2 CONFIRMED] Order ${id} verified.`);
            sendDiscordWebhook('✅ Order Confirmed', `Order **${id}** is fully paid and confirmed.\n**Amount:** $${order.usd.toFixed(2)}\n**Server:** ${order.serverName}`, 65280);
          }
        } else if (match.confs === 0 && order.status === 'pending') {
          order.status = 'detected';
          addLog('DETECTED', `[0/2 DETECTED] Unconfirmed payment caught for ${id}`);
          sendDiscordWebhook('⏳ Payment Detected (0/2)', `Transaction seen in mempool for **${id}**. Awaiting 1 confirmation.`, 16776960);
        }
      }
    }
  } catch (err) {}
}, 15000);

app.get('/api/status/:id', (req, res) => {
  const cleanId = String(req.params.id || '').trim().toUpperCase();
  const order = orders.get(cleanId);
  if (!order) return res.status(404).json({ error: 'Order ID not found.' });

  res.json({
    orderId: order.id, type: order.type, status: order.status, confirmations: order.confirmations,
    usd: order.usd, exactLtc: order.exactLtc, productName: order.productName, serverName: order.serverName,
    method: order.method, txid: order.txid, secretKey: order.status === 'confirmed' ? order.secretKey : null,
    createdAt: order.createdAt
  });
});

// Telemetry Web Interface (Root)
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Orion Backend</title><style>body{background:#070709;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;} .box{background:#111;padding:40px;border-radius:20px;border:1px solid #333;text-align:center;} h1{color:#ff7a1a;}</style></head><body><div class="box"><h1>Orion API Core</h1><p>System Online. Auto-Tracker Active.</p></div></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => addLog('BOOT', `Orion Backend v5 listening on port ${PORT}`));
