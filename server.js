const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/1000056901.gif', (req, res) => {
  res.sendFile(path.join(__dirname, '1000056901.gif'));
});

const orders = new Map();
const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const LTC_USD = 85; 

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Orion Boosts API</title></head>
    <body style="background:#0a0a0c;color:#fff;display:grid;place-items:center;height:100vh;font-family:sans-serif;">
      <h2>Orion Boosts API: Secure Auto-Tracking Online</h2>
    </body>
    </html>
  `);
});

app.post('/api/checkout', (req, res) => {
  const { plan, qty, serverId, method } = req.body;
  const orderId = `ORB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  const pricePerTwo = plan === '1M' ? 0.27 : 0.88;
  const totalUsd = (qty / 2) * pricePerTwo;
  
  const baseLtc = totalUsd / LTC_USD;
  const exactLtc = parseFloat((baseLtc + (Math.floor(Math.random() * 9000) + 1000) / 1e8).toFixed(8));
  const expectedLitoshis = Math.round(exactLtc * 100000000);

  const toleranceLtc = 0.04 / LTC_USD;
  const toleranceLitoshis = Math.round(toleranceLtc * 100000000);
  const minRequiredLitoshis = expectedLitoshis - toleranceLitoshis;

  orders.set(orderId, {
    id: orderId,
    usd: totalUsd,
    exactLtc: exactLtc,
    expectedLitoshis: expectedLitoshis,
    minRequiredLitoshis: minRequiredLitoshis, 
    server: serverId,
    method: method || 'auto',
    status: 'pending',
    createdAt: Date.now() // Timestamp lock
  });

  res.json({ orderId, exactLtc, usd: totalUsd });
});

app.post('/api/verify-txid', async (req, res) => {
  const { orderId, txid } = req.body;
  const order = orders.get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${txid}`);
    const data = response.data;
    
    // Check timestamp safety (BlockCypher gives received time in ISO format)
    const txTime = new Date(data.received).getTime();
    if (txTime < order.createdAt) {
      return res.json({ success: false, error: 'This transaction is older than this invoice session.' });
    }

    let paymentFound = false;
    for (const output of data.outputs) {
      if (output.addresses && output.addresses.includes(RECEIVER_ADDRESS) && output.value >= order.minRequiredLitoshis) {
        paymentFound = true;
        break;
      }
    }

    if (paymentFound) {
      order.status = 'confirmed';
      res.json({ success: true, status: 'confirmed' });
    } else {
      res.json({ success: false, error: 'Transaction amount or destination address does not match.' });
    }
  } catch (e) {
    res.json({ success: false, error: 'Invalid TXID or network lookup failed.' });
  }
});

// Upgraded Background Auto-Tracker Loop with strict timestamp validation
setInterval(async () => {
  let activeOrders = false;
  for (const order of orders.values()) {
    if (order.status === 'pending' || order.status === 'detected') activeOrders = true;
  }
  if (!activeOrders) return;

  try {
    const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/addrs/${RECEIVER_ADDRESS}`);
    const data = response.data;
    
    const allTxs = [
      ...(data.unconfirmed_txrefs || []).map(t => ({ ...t, confs: 0 })),
      ...(data.txrefs || []).map(t => ({ ...t, confs: t.confirmations }))
    ];
    const incomingTxs = allTxs.filter(t => t.tx_input_n < 0);

    for (const [id, order] of orders.entries()) {
      if (order.status === 'confirmed' || order.status === 'expired') continue;

      if (Date.now() - order.createdAt > 1800000) {
        order.status = 'expired';
        continue;
      }
      
      // STRICT FILTER: Match amount AND ensure transaction happened AFTER invoice creation
      const match = incomingTxs.find(t => {
        const txTime = new Date(t.received).getTime();
        return t.value >= order.minRequiredLitoshis && txTime >= order.createdAt;
      });

      if (match) {
        if (match.confs > 0) {
          order.status = 'confirmed';
          console.log(`✅ [CONFIRMED] Valid payment matched for ${id}`);
        } else if (order.status === 'pending') {
          order.status = 'detected';
          console.log(`⏱️ [DETECTED] Valid unconfirmed payment matched for ${id}`);
        }
      }
    }
  } catch (error) {}
}, 15000);

app.get('/api/status/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status, usd: order.usd, method: order.method });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
