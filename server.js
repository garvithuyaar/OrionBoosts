const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// ⚙️ CORE CONFIGURATION & STATE
// ==========================================
const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const DISCORD_WEBHOOK = ''; // Paste your webhook URL here for live order alerts

let LTC_USD = 85.00;
let totalApiRequests = 0;
let totalDonationsUsd = 0.00;
const orders = new Map();
const usedTxids = new Set();
const systemLogs = [];

const PROMO_CODES = {
  'ORION10': { discount: 0.10, desc: '10% Launch Discount' },
  'VIP20': { discount: 0.20, desc: '20% VIP Member' },
  'GARVIT': { discount: 0.25, desc: '25% Founder Discount' }
};

app.get('/1000056901.gif', (req, res) => res.sendFile(path.join(__dirname, '1000056901.gif')));

function addLog(type, msg) {
  const time = new Date().toISOString().split('T')[1].slice(0, 8);
  systemLogs.unshift({ time, type, msg });
  if (systemLogs.length > 30) systemLogs.pop();
  console.log(`[${time}] [${type}] ${msg}`);
}

async function sendWebhook(title, desc, color) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await axios.post(DISCORD_WEBHOOK, {
      embeds: [{ title, description: desc, color, timestamp: new Date().toISOString() }]
    });
  } catch (e) { addLog('WARN', 'Webhook failed.'); }
}

// Live Oracle
setInterval(async () => {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd');
    if (res.data?.litecoin?.usd) {
      LTC_USD = parseFloat(res.data.litecoin.usd);
      addLog('ORACLE', `LTC Rate Synced: $${LTC_USD}`);
    }
  } catch (e) {}
}, 180000);

// ==========================================
// 🌐 API DASHBOARD
// ==========================================
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Orion Backend Core</title>
      <style>
        body { background:#07070a; color:#fff; font-family:system-ui; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .dashboard { background:rgba(20,20,25,0.8); padding:40px; border-radius:24px; border:1px solid #333; width:100%; max-width:600px; box-shadow:0 20px 50px rgba(0,0,0,0.5); }
        .row { display:flex; justify-content:space-between; margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #222; font-size:18px; }
        .ok { color:#00e676; font-weight:bold; }
        .acc { color:#ff7a1a; font-weight:bold; }
      </style>
    </head>
    <body>
      <div class="dashboard">
        <h2 style="margin-top:0; color:#ff7a1a;">Orion Tracking Core</h2>
        <div class="row"><span>System Status</span> <span class="ok">Online & Tracking</span></div>
        <div class="row"><span>Active Invoices</span> <span class="acc">${orders.size}</span></div>
        <div class="row"><span>Current LTC Rate</span> <span>$${LTC_USD.toFixed(2)}</span></div>
        <div class="row" style="border:0"><span>Total Donations</span> <span class="ok">$${totalDonationsUsd.toFixed(2)}</span></div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/metrics', (req, res) => res.json({ ltcUsd: LTC_USD, donations: totalDonationsUsd }));

app.post('/api/validate-promo', (req, res) => {
  const code = req.body.code?.trim().toUpperCase();
  if (PROMO_CODES[code]) return res.json({ valid: true, ...PROMO_CODES[code] });
  res.json({ valid: false, error: 'Invalid Code' });
});

// ==========================================
// 🛒 CHECKOUT ENGINE
// ==========================================
app.post('/api/checkout', (req, res) => {
  const { type, donateAmount, plan, qty, serverId, serverName, method, promoCode } = req.body;
  const isDonation = type === 'donation';
  const orderId = `ORB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  let totalUsd = 0;
  if (isDonation) {
    totalUsd = Math.max(0.5, parseFloat(donateAmount) || 1);
  } else {
    const q = Math.max(2, parseInt(qty) || 2);
    let p = 0.27; if (plan === '3M') p = 0.88; if (plan === '12M') p = 2.99;
    totalUsd = (q / 2) * p;
    const pc = PROMO_CODES[promoCode?.trim().toUpperCase()];
    if (pc) totalUsd *= (1 - pc.discount);
    totalUsd = Math.max(0.10, parseFloat(totalUsd.toFixed(2)));
  }

  const baseLtc = totalUsd / LTC_USD;
  const exactLtc = parseFloat((baseLtc + (Math.floor(Math.random() * 8800) + 1000) / 1e8).toFixed(8));
  const expectedLitoshis = Math.round(exactLtc * 100000000);
  const minRequiredLitoshis = Math.max(1000, expectedLitoshis - Math.round((0.04 / LTC_USD) * 100000000));

  orders.set(orderId, {
    id: orderId, type: isDonation ? 'donation' : 'boost', usd: totalUsd,
    exactLtc, expectedLitoshis, minRequiredLitoshis,
    server: serverName || 'Unknown', method: method || 'auto',
    status: 'pending', createdAt: Date.now(), txid: null, counted: false
  });

  sendWebhook('🛒 New Checkout', `**ID:** ${orderId}\n**Amount:** $${totalUsd.toFixed(2)} USD`, 16742912);
  res.json({ orderId, exactLtc, usd: totalUsd, method: method || 'auto' });
});

// ==========================================
// 📡 AUTO-TRACKER (Every 15s)
// ==========================================
setInterval(async () => {
  let active = false;
  for (const o of orders.values()) if (o.status === 'pending' || o.status === 'detected') active = true;
  if (!active) return;

  try {
    const { data } = await axios.get(`https://api.blockcypher.com/v1/ltc/main/addrs/${RECEIVER_ADDRESS}`);
    const txs = [...(data.unconfirmed_txrefs || []).map(t => ({...t, c:0})), ...(data.txrefs || []).map(t => ({...t, c:t.confirmations}))].filter(t => t.tx_input_n < 0);

    for (const [id, order] of orders.entries()) {
      if (order.status === 'confirmed') continue;
      if (Date.now() - order.createdAt > 1800000) { order.status = 'expired'; continue; }

      const match = txs.find(t => t.value >= order.minRequiredLitoshis && t.value <= order.expectedLitoshis + 500000 && (!usedTxids.has(t.tx_hash) || order.txid === t.tx_hash));

      if (match) {
        usedTxids.add(match.tx_hash);
        order.txid = match.tx_hash;
        
        if (match.c >= 1 && order.status !== 'confirmed') {
          order.status = 'confirmed';
          if (order.type === 'donation' && !order.counted) { totalDonationsUsd += order.usd; order.counted = true; }
          sendWebhook('✅ Payment Confirmed', `**ID:** ${id}\n**Amount:** $${order.usd.toFixed(2)} USD`, 65280);
        } else if (match.c === 0 && order.status === 'pending') {
          order.status = 'detected';
        }
      }
    }
  } catch (e) {}
}, 15000);

// ==========================================
// 🔍 MANUAL VERIFICATION
// ==========================================
app.post('/api/verify-txid', async (req, res) => {
  const { orderId, txid } = req.body;
  const order = orders.get(orderId);
  if (!order || !/^[0-9a-fA-F]{64}$/.test(txid)) return res.json({ success: false, error: 'Invalid data.' });

  try {
    const { data } = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${txid}`);
    let val = 0;
    data.outputs.forEach(o => { if (o.addresses?.includes(RECEIVER_ADDRESS)) val += o.value; });

    if (val < order.minRequiredLitoshis) return res.json({ success: false, error: 'Underpayment detected.' });
    
    usedTxids.add(txid);
    order.txid = txid;
    order.status = data.confirmations > 0 ? 'confirmed' : 'detected';
    if (order.status === 'confirmed' && order.type === 'donation' && !order.counted) { totalDonationsUsd += order.usd; order.counted = true; }
    
    res.json({ success: true, status: order.status });
  } catch (e) { res.json({ success: false, error: 'TXID not found.' }); }
});

app.get('/api/status/:id', (req, res) => {
  const o = orders.get(req.params.id?.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(o);
});

app.listen(process.env.PORT || 3000, () => console.log('Backend Online'));
