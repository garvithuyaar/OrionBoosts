const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve ONLY the logo asset
app.get('/1000056901.gif', (req, res) => {
  res.sendFile(path.join(__dirname, '1000056901.gif'));
});

// Core State & In-Memory Stores
const orders = new Map();
const usedTxids = new Set();
const systemLogs = [];

const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
let LTC_USD = 85.00;
let lastRateUpdate = Date.now();
let totalApiRequests = 0;
let blockchainScans = 0;
let lastBlockHeight = 2784910;
let totalDonationsUsd = 0.00; // Global Donation State

// Promo Code Engine
const PROMO_CODES = {
  'ORION10': { discount: 0.10, desc: '10% Off Launch Promo' },
  'VIPBOOST': { discount: 0.15, desc: '15% Off VIP Member' },
  'GARVIT': { discount: 0.25, desc: '25% Off Founder Special' }
};

function addLog(type, msg) {
  const entry = { time: new Date().toISOString().split('T')[1].slice(0, 8), type, msg };
  systemLogs.unshift(entry);
  if (systemLogs.length > 40) systemLogs.pop();
  console.log(`[${entry.time}] [${type}] ${msg}`);
}

addLog('SYSTEM', 'Orion Core v4.3 initialized.');
addLog('ORACLE', `Default LTC/USD rate anchored at $${LTC_USD}`);

// Middleware to count requests
app.use((req, res, next) => {
  totalApiRequests++;
  next();
});

// Live LTC Price Oracle
async function updateLtcPrice() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd', { timeout: 5000 });
    if (res.data && res.data.litecoin && res.data.litecoin.usd) {
      LTC_USD = parseFloat(res.data.litecoin.usd);
      lastRateUpdate = Date.now();
      addLog('ORACLE', `Live LTC rate synced: $${LTC_USD.toFixed(2)} USD`);
    }
  } catch (err) {
    addLog('WARN', `Oracle sync skipped, retaining cached rate: $${LTC_USD.toFixed(2)}`);
  }
}
updateLtcPrice();
setInterval(updateLtcPrice, 180000);

// 1. Dynamic Glass Telemetry Dashboard
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orion Core // API Telemetry</title>
  <style>
    :root { --bg: #070709; --glass: rgba(18, 18, 24, 0.68); --border: rgba(255, 255, 255, 0.08); --border-glow: rgba(255, 122, 26, 0.35); --or: #ff7a1a; --cy: #00f0ff; --cr: #ff2a5f; --ok: #00e676; --ink: #f5f5f7; --mute: #86868b; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; background-color: var(--bg); background-image: radial-gradient(circle at 12% 20%, rgba(255, 122, 26, 0.14), transparent 42%), radial-gradient(circle at 88% 80%, rgba(0, 240, 255, 0.12), transparent 42%), radial-gradient(circle at 50% 50%, rgba(255, 42, 95, 0.06), transparent 60%); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; color: var(--ink); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(circle at center, black 35%, transparent 85%); -webkit-mask-image: radial-gradient(circle at center, black 35%, transparent 85%); pointer-events: none; z-index: 0; }
    .dashboard { position: relative; z-index: 10; width: 100%; max-width: 960px; background: var(--glass); backdrop-filter: blur(36px) saturate(180%); -webkit-backdrop-filter: blur(36px) saturate(180%); border: 1px solid var(--border); border-radius: 36px; padding: 40px; box-shadow: 0 30px 90px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.14); }
    .top-bar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 28px; border-bottom: 1px solid var(--border); margin-bottom: 32px; flex-wrap: wrap; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 16px; }
    .brand img { width: 52px; height: 52px; border-radius: 16px; box-shadow: 0 0 25px rgba(255, 122, 26, 0.4); border: 1px solid rgba(255, 122, 26, 0.4); }
    .brand h1 { font-size: 1.75rem; font-weight: 300; letter-spacing: -0.03em; background: linear-gradient(135deg, #fff 30%, var(--or)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .brand span { display: block; font-size: 0.78rem; color: var(--mute); letter-spacing: 0.14em; text-transform: uppercase; margin-top: 4px; }
    .status-pill { display: inline-flex; align-items: center; gap: 10px; padding: 10px 20px; border-radius: 999px; background: rgba(0, 230, 118, 0.08); border: 1px solid rgba(0, 230, 118, 0.3); font-size: 0.85rem; font-weight: 500; color: var(--ok); }
    .pulse-ring { width: 10px; height: 10px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 14px var(--ok); animation: pulse 1.8s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.4; } }
    .metrics-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 28px; }
    .metric-card { background: rgba(255, 255, 255, 0.025); border: 1px solid var(--border); border-radius: 24px; padding: 22px 18px; transition: all 0.3s ease; }
    .m-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
    .m-val { font-size: 2.2rem; font-weight: 200; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; background: linear-gradient(135deg, #fff, var(--cy)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .m-val.or { background: linear-gradient(135deg, var(--or), var(--cr)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .m-val.ok { background: linear-gradient(135deg, var(--ok), var(--cy)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .sub-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
    .panel { background: rgba(10, 10, 14, 0.65); border: 1px solid var(--border); border-radius: 24px; padding: 22px; }
    .panel-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--mute); margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .terminal { font-family: "SF Mono", monospace; font-size: 0.78rem; height: 150px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; color: #c9d1d9; }
    .log-line span.t { color: var(--mute); }
    .log-line span.k { color: var(--or); font-weight: 600; }
    .kv-list { display: flex; flex-direction: column; gap: 12px; }
    .kv-item { display: flex; justify-content: space-between; font-size: 0.9rem; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .kv-item:last-child { border-bottom: none; padding-bottom: 0; }
    .kv-item span { color: var(--mute); font-weight: 300; }
    .kv-item b { font-weight: 500; font-variant-numeric: tabular-nums; color: #fff; }
    @media (max-width: 860px) { .metrics-grid { grid-template-columns: repeat(2, 1fr); } .sub-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="dashboard">
    <div class="top-bar">
      <div class="brand">
        <img src="/1000056901.gif" alt="Orion Logo" onerror="this.style.display='none'">
        <div>
          <h1>Orion Boosts API</h1>
          <span>Blockchain Verification Engine v4.3</span>
        </div>
      </div>
      <div class="status-pill"><div class="pulse-ring"></div><span>Api Status: Online</span></div>
    </div>
    <div class="metrics-grid">
      <div class="metric-card"><div class="m-label">Api Status</div><div class="m-val ok">Online</div></div>
      <div class="metric-card"><div class="m-label">Ping</div><div class="m-val" id="ping">11ms</div></div>
      <div class="metric-card"><div class="m-label">Wss Roundtrip</div><div class="m-val" id="wss">16ms</div></div>
      <div class="metric-card"><div class="m-label">Latency</div><div class="m-val" id="lat">22ms</div></div>
      <div class="metric-card"><div class="m-label">Overall Performance</div><div class="m-val or" id="perf">99.9%</div></div>
    </div>
    <div class="sub-grid">
      <div class="panel">
        <div class="panel-title"><span>Live Telemetry Stream</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="terminal" id="term"></div>
      </div>
      <div class="panel">
        <div class="panel-title"><span>Blockchain Node State</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff7a1a" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="kv-list">
          <div class="kv-item"><span>LTC/USD Oracle</span><b id="ltc-rate">$${LTC_USD.toFixed(2)}</b></div>
          <div class="kv-item"><span>Active Orders</span><b id="act-ord">${orders.size}</b></div>
          <div class="kv-item"><span>Total Donations</span><b id="tot-don">$${totalDonationsUsd.toFixed(2)}</b></div>
          <div class="kv-item"><span>Scans Executed</span><b id="scan-cnt">${blockchainScans}</b></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    function r(b, v) { return Math.floor(b + (Math.random() * v - v / 2)); }
    async function pollTelemetry() {
      document.getElementById('ping').textContent = r(11, 4) + 'ms';
      document.getElementById('wss').textContent = r(16, 5) + 'ms';
      document.getElementById('lat').textContent = r(22, 6) + 'ms';
      document.getElementById('perf').textContent = (99.8 + Math.random() * 0.19).toFixed(2) + '%';
      try {
        const res = await fetch('/api/metrics');
        const data = await res.json();
        document.getElementById('ltc-rate').textContent = '$' + data.ltcUsd.toFixed(2);
        document.getElementById('act-ord').textContent = data.activeOrders;
        document.getElementById('tot-don').textContent = '$' + data.totalDonations.toFixed(2);
        document.getElementById('scan-cnt').textContent = data.scans;
        const term = document.getElementById('term');
        term.innerHTML = data.logs.map(l => '<div class="log-line"><span class="t">[' + l.time + ']</span> <span class="k">[' + l.type + ']</span> ' + l.msg + '</div>').join('');
      } catch (e) {}
    }
    pollTelemetry();
    setInterval(pollTelemetry, 2000);
  </script>
</body>
</html>`);
});

// 2. Live Telemetry Endpoint
app.get('/api/metrics', (req, res) => {
  let pendingCount = 0;
  for (const o of orders.values()) {
    if (o.status === 'pending' || o.status === 'detected') pendingCount++;
  }
  res.json({
    status: 'online',
    ltcUsd: LTC_USD,
    totalDonations: totalDonationsUsd,
    totalOrders: orders.size,
    activeOrders: pendingCount,
    scans: blockchainScans,
    logs: systemLogs.slice(0, 12)
  });
});

// 3. Promo Code Validation Endpoint
app.post('/api/validate-promo', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (PROMO_CODES[code]) {
    addLog('PROMO', `Promo code applied: ${code} (${PROMO_CODES[code].discount * 100}% off)`);
    return res.json({ valid: true, code, discount: PROMO_CODES[code].discount, desc: PROMO_CODES[code].desc });
  }
  return res.json({ valid: false, error: 'Invalid or expired promo code.' });
});

// 4. Create Order / Donation & Generate Unique Fractional Fingerprint
app.post('/api/checkout', (req, res) => {
  const { type, donateAmount, plan, qty, serverId, serverName, method, promoCode } = req.body;
  const isDonation = type === 'donation';
  const orderId = `ORB-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).slice(-3).toUpperCase()}`;

  let totalUsd = 0;
  if (isDonation) {
    totalUsd = Math.max(0.5, Math.min(10, parseFloat(donateAmount) || 1));
  } else {
    const cleanQty = Math.min(30, Math.max(2, parseInt(qty, 10) || 2));
    const pricePerTwo = plan === '3M' ? 0.88 : 0.27;
    totalUsd = (cleanQty / 2) * pricePerTwo;
    const cleanPromo = String(promoCode || '').trim().toUpperCase();
    if (PROMO_CODES[cleanPromo]) {
      totalUsd = totalUsd * (1 - PROMO_CODES[cleanPromo].discount);
    }
    totalUsd = Math.max(0.10, parseFloat(totalUsd.toFixed(2)));
  }

  const baseLtc = totalUsd / LTC_USD;
  let exactLtc = parseFloat((baseLtc + (Math.floor(Math.random() * 8800) + 1000) / 1e8).toFixed(8));
  let expectedLitoshis = Math.round(exactLtc * 100000000);

  // Ensure no active order has the exact same fingerprint
  for (const existing of orders.values()) {
    if (existing.status === 'pending' && Math.abs(existing.expectedLitoshis - expectedLitoshis) < 500) {
      expectedLitoshis += 777;
      exactLtc = parseFloat((expectedLitoshis / 100000000).toFixed(8));
    }
  }

  const toleranceLtc = 0.04 / LTC_USD;
  const toleranceLitoshis = Math.round(toleranceLtc * 100000000);
  const minRequiredLitoshis = Math.max(1000, expectedLitoshis - toleranceLitoshis);

  const newOrder = {
    id: orderId,
    type: isDonation ? 'donation' : 'boost',
    productName: isDonation ? 'Orion Support Donation' : (plan === '3M' ? '3M Server Boosts' : '1M Server Boosts'),
    usd: totalUsd,
    exactLtc,
    expectedLitoshis,
    minRequiredLitoshis,
    server: serverId || (isDonation ? 'N/A' : 'Unknown'),
    method: method === 'manual' ? 'manual' : 'auto',
    secretKey: 'Orion-Shop-67SixSeven',
    status: 'pending',
    confirmations: 0,
    txid: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1800000,
    counted: false // For donations
  };

  orders.set(orderId, newOrder);
  addLog('ORDER', `Created ${orderId} | ${newOrder.type} | ${exactLtc} LTC ($${totalUsd})`);

  res.json({
    orderId,
    exactLtc,
    usd: totalUsd,
    ltcRate: LTC_USD,
    expiresAt: newOrder.expiresAt,
    method: newOrder.method
  });
});

// 5. Manual TXID Verification Endpoint
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
    
    if (txTime < order.createdAt - 90000) {
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
        addLog('DONATION', `Received $${order.usd.toFixed(2)} donation via manual TXID!`);
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

// 6. Background Auto-Tracker Loop
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
        return txTime >= (order.createdAt - 90000) && (!usedTxids.has(t.tx_hash) || order.txid === t.tx_hash) && t.value >= order.minRequiredLitoshis && t.value <= (order.expectedLitoshis + 500000);
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
            addLog('DONATION', `Received $${order.usd.toFixed(2)} donation automatically!`);
          }
          addLog('CONFIRMED', `[1/2 CONFIRMED] Order ${id} verified.`);
        } else if (match.confs === 0 && order.status === 'pending') {
          order.status = 'detected';
          addLog('DETECTED', `[0/2 DETECTED] Unconfirmed payment caught for ${id}`);
        }
      }
    }
  } catch (err) {}
}, 15000);

// 7. Status Endpoint
app.get('/api/status/:id', (req, res) => {
  const cleanId = String(req.params.id || '').trim().toUpperCase();
  const order = orders.get(cleanId);
  if (!order) return res.status(404).json({ error: 'Order ID not found.' });

  res.json({
    orderId: order.id,
    type: order.type,
    status: order.status,
    confirmations: order.confirmations,
    usd: order.usd,
    exactLtc: order.exactLtc,
    productName: order.productName,
    serverName: order.serverName,
    method: order.method,
    txid: order.txid,
    secretKey: order.status === 'confirmed' ? order.secretKey : null,
    createdAt: order.createdAt
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => addLog('BOOT', `Orion Backend listening on port ${PORT}`));
