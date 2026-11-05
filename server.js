/**
 * ==============================================================================
 * ORION BOOSTS :: ENTERPRISE CORE SERVER
 * Architecture: REST API + WebSocket (WSS) Telemetry + Background Blockchain Polling
 * ==============================================================================
 */
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const crypto = require('crypto');

// --- SYSTEM CONFIGURATION ---
const CONFIG = {
  PORT: process.env.PORT || 3000,
  RECEIVER_ADDRESS: 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3',
  DISCORD_WEBHOOK: process.env.WEBHOOK_URL || '',
  ORACLE_SYNC_INTERVAL: 180000,
  BLOCKCHAIN_SCAN_INTERVAL: 15000,
  ORDER_TIMEOUT_MS: 1800000, // 30 minutes
  TOLERANCE_USD: 0.04,
  MAX_LOGS: 100
};

// --- ENTERPRISE LOGGING SYSTEM ---
class Logger {
  constructor() { this.logs = []; }
  log(level, module, message, meta = {}) {
    const time = new Date().toISOString();
    const entry = { time, level, module, message, meta };
    this.logs.unshift(entry);
    if (this.logs.length > CONFIG.MAX_LOGS) this.logs.pop();
    const color = level === 'CRIT' ? '\x1b[31m' : level === 'WARN' ? '\x1b[33m' : '\x1b[36m';
    console.log(`${color}[${time.split('T')[1].slice(0,-1)}] [${level}] [${module}] ${message}\x1b[0m`);
  }
  info(mod, msg, meta) { this.log('INFO', mod, msg, meta); }
  warn(mod, msg, meta) { this.log('WARN', mod, msg, meta); }
  crit(mod, msg, meta) { this.log('CRIT', mod, msg, meta); }
  getRecent() { return this.logs.slice(0, 20); }
}
const SysLog = new Logger();

// --- IN-MEMORY DATABASE & STATE ---
const STATE = {
  orders: new Map(),
  usedTxids: new Set(),
  topDonators: [],
  ltcUsd: 85.00,
  totalDonationsUsd: 0.00,
  apiRequests: 0,
  scansExecuted: 0,
  startTime: Date.now()
};

const PROMO_CODES = {
  'ORION10': { discount: 0.10, desc: '10% Launch Promo' },
  'VIPBOOST': { discount: 0.15, desc: '15% VIP Member' },
  'GARVIT': { discount: 0.25, desc: '25% Founder Discount' },
  'MEGA50': { discount: 0.50, desc: '50% Admin Code' }
};

// --- EXPRESS & MIDDLEWARE ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/telemetry' }); // WSS Endpoint

app.use(cors());
app.use(express.json());
app.use((req, res, next) => { STATE.apiRequests++; next(); });
app.get('/1000056901.gif', (req, res) => res.sendFile(path.join(__dirname, '1000056901.gif')));

// --- DISCORD WEBHOOK INTEGRATION ---
async function sendWebhook(title, description, color, fields = []) {
  if (!CONFIG.DISCORD_WEBHOOK) return;
  try {
    await axios.post(CONFIG.DISCORD_WEBHOOK, {
      embeds: [{ title, description, color, fields, footer: { text: 'Orion Tracking Engine' }, timestamp: new Date().toISOString() }]
    });
  } catch (err) { SysLog.warn('WEBHOOK', 'Failed to dispatch alert.'); }
}

// --- HARDWARE & WEBSOCKET TELEMETRY ENGINE ---
wss.on('connection', (ws) => {
  SysLog.info('WSS', 'New client connected to telemetry stream.');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        // Calculate live hardware stats on every ping
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const memUsage = ((totalMem - freeMem) / totalMem * 100).toFixed(1);
        const uptime = process.uptime();
        
        ws.send(JSON.stringify({
          type: 'pong',
          clientTime: data.clientTime,
          serverTime: Date.now(),
          cpu: os.loadavg()[0].toFixed(2),
          ram: `${memUsage}%`,
          uptime: Math.floor(uptime)
        }));
      }
    } catch (e) { SysLog.warn('WSS', 'Malformed message received.'); }
  });
});

// --- LIVE ORACLE SYNC ---
async function syncOracle() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd', { timeout: 6000 });
    if (res.data?.litecoin?.usd) {
      STATE.ltcUsd = parseFloat(res.data.litecoin.usd);
      SysLog.info('ORACLE', `LTC/USD Synced: $${STATE.ltcUsd}`);
    }
  } catch (e) { SysLog.warn('ORACLE', 'Sync failed. Retaining cached rate.'); }
}
syncOracle();
setInterval(syncOracle, CONFIG.ORACLE_SYNC_INTERVAL);

// --- REST ENDPOINTS ---
app.get('/api/metrics', (req, res) => {
  let pending = 0;
  for (const o of STATE.orders.values()) if (o.status === 'pending' || o.status === 'detected') pending++;
  res.json({
    status: 'online',
    ltcUsd: STATE.ltcUsd,
    donations: STATE.totalDonationsUsd,
    totalOrders: STATE.orders.size,
    activeOrders: pending,
    scans: STATE.scansExecuted,
    reqs: STATE.apiRequests,
    uptime: process.uptime(),
    logs: SysLog.getRecent()
  });
});

app.post('/api/validate-promo', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (PROMO_CODES[code]) return res.json({ valid: true, ...PROMO_CODES[code] });
  res.json({ valid: false, error: 'Invalid or expired code.' });
});

// --- CORE CHECKOUT ENGINE (Boosts & Donations) ---
app.post('/api/checkout', (req, res) => {
  const { type, donateAmount, plan, qty, serverId, serverName, method, promoCode, donorName } = req.body;
  const isDonation = type === 'donation';
  const orderId = `ORB-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${Date.now().toString(36).slice(-3).toUpperCase()}`;

  let totalUsd = 0;
  let productName = '';
  
  if (isDonation) {
    totalUsd = Math.max(0.5, Math.min(1000, parseFloat(donateAmount) || 1));
    productName = 'Orion Support Donation';
  } else {
    const cleanQty = Math.max(2, parseInt(qty, 10) || 2);
    let pricePerTwo = plan === '12M' ? 2.99 : plan === '3M' ? 0.88 : 0.27;
    totalUsd = (cleanQty / 2) * pricePerTwo;
    productName = `${plan} Server Boosts`;
    
    const pc = PROMO_CODES[String(promoCode || '').trim().toUpperCase()];
    if (pc) totalUsd *= (1 - pc.discount);
    totalUsd = Math.max(0.10, parseFloat(totalUsd.toFixed(2)));
  }

  // Fractional Fingerprinting (Zero Collision Guarantee)
  const baseLtc = totalUsd / STATE.ltcUsd;
  let exactLtc = parseFloat((baseLtc + (Math.floor(Math.random() * 8800) + 1000) / 1e8).toFixed(8));
  let expectedLitoshis = Math.round(exactLtc * 100000000);

  for (const o of STATE.orders.values()) {
    if (o.status === 'pending' && Math.abs(o.expectedLitoshis - expectedLitoshis) < 500) {
      expectedLitoshis += 999;
      exactLtc = parseFloat((expectedLitoshis / 100000000).toFixed(8));
    }
  }

  const toleranceLitoshis = Math.round((CONFIG.TOLERANCE_USD / STATE.ltcUsd) * 100000000);
  const minRequiredLitoshis = Math.max(1000, expectedLitoshis - toleranceLitoshis);

  const newOrder = {
    id: orderId, type: isDonation ? 'donation' : 'boost', productName, donorName: donorName || 'Anonymous',
    usd: totalUsd, exactLtc, expectedLitoshis, minRequiredLitoshis,
    server: serverId || 'N/A', serverName: serverName || 'Unknown', method: method || 'auto',
    secretKey: 'Orion-Shop-67SixSeven', status: 'pending', confirmations: 0, txid: null,
    createdAt: Date.now(), expiresAt: Date.now() + CONFIG.ORDER_TIMEOUT_MS, counted: false
  };

  STATE.orders.set(orderId, newOrder);
  SysLog.info('ORDER', `Created ${orderId} | ${exactLtc} LTC ($${totalUsd})`);
  sendWebhook('🛒 New Checkout', `**ID:** ${orderId}\n**Type:** ${newOrder.type}\n**Amount:** $${totalUsd.toFixed(2)} USD`, 16742912);

  res.json({ orderId, exactLtc, usd: totalUsd, ltcRate: STATE.ltcUsd, method: newOrder.method });
});

// --- MANUAL TXID FALLBACK ---
app.post('/api/verify-txid', async (req, res) => {
  const { orderId, txid } = req.body;
  const cleanTx = String(txid || '').trim();
  const order = STATE.orders.get(orderId);

  if (!order || !/^[0-9a-fA-F]{64}$/.test(cleanTx)) return res.json({ success: false, error: 'Invalid data.' });
  if (STATE.usedTxids.has(cleanTx) && order.txid !== cleanTx) return res.json({ success: false, error: 'TXID already claimed.' });

  try {
    const { data } = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${cleanTx}`, { timeout: 7000 });
    const txTime = data.received ? new Date(data.received).getTime() : Date.now();
    
    if (txTime < order.createdAt - 120000) return res.json({ success: false, error: 'Transaction too old.' });

    let matchedValue = 0;
    for (const output of (data.outputs || [])) {
      if (output.addresses?.includes(CONFIG.RECEIVER_ADDRESS)) matchedValue += output.value;
    }

    if (matchedValue < order.minRequiredLitoshis) return res.json({ success: false, error: 'Underpayment.' });

    STATE.usedTxids.add(cleanTx);
    order.txid = cleanTx;
    order.confirmations = data.confirmations || 0;

    if (order.confirmations > 0) {
      order.status = 'confirmed';
      if (order.type === 'donation' && !order.counted) { STATE.totalDonationsUsd += order.usd; order.counted = true; }
      SysLog.info('CONFIRMED', `Manual TXID verified for ${order.id}`);
    } else {
      order.status = 'detected';
    }
    return res.json({ success: true, status: order.status, confirmations: order.confirmations });
  } catch (err) { return res.json({ success: false, error: 'TXID not found on mainnet yet.' }); }
});

// --- BACKGROUND BLOCKCHAIN RADAR ---
setInterval(async () => {
  let hasActive = false;
  const now = Date.now();

  for (const [id, order] of STATE.orders.entries()) {
    if (order.status === 'pending' || order.status === 'detected') {
      if (now > order.expiresAt && order.status === 'pending') {
        order.status = 'expired';
        SysLog.info('EXPIRED', `Order ${id} timed out.`);
      } else hasActive = true;
    }
  }

  if (!hasActive) return;

  try {
    STATE.scansExecuted++;
    const { data } = await axios.get(`https://api.blockcypher.com/v1/ltc/main/addrs/${CONFIG.RECEIVER_ADDRESS}`, { timeout: 8000 });
    const incomingTxs = [...(data.unconfirmed_txrefs || []).map(t => ({...t, c:0})), ...(data.txrefs || []).map(t => ({...t, c:t.confirmations || 1}))].filter(t => t.tx_input_n < 0);

    for (const [id, order] of STATE.orders.entries()) {
      if (order.status !== 'pending' && order.status !== 'detected') continue;

      const match = incomingTxs.find(t => {
        const txTime = t.received ? new Date(t.received).getTime() : Date.now();
        return txTime >= (order.createdAt - 120000) && (!STATE.usedTxids.has(t.tx_hash) || order.txid === t.tx_hash) && t.value >= order.minRequiredLitoshis && t.value <= (order.expectedLitoshis + 500000);
      });

      if (match) {
        STATE.usedTxids.add(match.tx_hash);
        order.txid = match.tx_hash;
        order.confirmations = match.c;

        if (match.c >= 1 && order.status !== 'confirmed') {
          order.status = 'confirmed';
          if (order.type === 'donation' && !order.counted) {
            STATE.totalDonationsUsd += order.usd;
            order.counted = true;
            STATE.topDonators.push({ name: order.donorName, amount: order.usd, time: Date.now() });
            SysLog.info('DONATION', `Received $${order.usd.toFixed(2)}`);
          } else {
            SysLog.info('CONFIRMED', `Order ${id} verified.`);
            sendWebhook('✅ Order Confirmed', `**ID:** ${id}\n**Amount:** $${order.usd.toFixed(2)}\n**Server:** ${order.serverName}`, 65280);
          }
        } else if (match.c === 0 && order.status === 'pending') {
          order.status = 'detected';
          SysLog.info('DETECTED', `0/2 mempool match for ${id}`);
          sendWebhook('⏳ Payment Detected', `Mempool broadcast caught for **${id}**. Awaiting 1/2.`, 16776960);
        }
      }
    }
  } catch (err) {}
}, CONFIG.BLOCKCHAIN_SCAN_INTERVAL);

// --- READ STATUS ---
app.get('/api/status/:id', (req, res) => {
  const o = STATE.orders.get(req.params.id?.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  res.json(o);
});

server.listen(CONFIG.PORT, () => SysLog.info('BOOT', `Enterprise Backend + WSS on port ${CONFIG.PORT}`));
