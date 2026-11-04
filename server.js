const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Allows the backend to serve local static files if needed
app.use(express.static(__dirname));

const orders = new Map();

// Your exact Litecoin address from the frontend
const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const LTC_USD = 85; 

// Dynamic Glassmorphic Landing Page
app.get('/', (req, res) => {
  // Force the browser to render this as a webpage, not raw text
  res.setHeader('Content-Type', 'text/html');
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orion Boosts API</title>
      <style>
        body {
          margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
          background-color: #0a0a0c; color: #fff; 
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
          background-image: radial-gradient(circle at 15% 50%, rgba(220, 20, 60, 0.15), transparent 40%),
                            radial-gradient(circle at 85% 30%, rgba(255, 122, 26, 0.15), transparent 40%);
        }
        .frame {
          background: rgba(20, 20, 25, 0.65); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 122, 26, 0.2); border-radius: 32px; padding: 40px 50px;
          box-shadow: 0 20px 80px rgba(0, 0, 0, 0.6); min-width: 360px;
        }
        .row {
          display: flex; justify-content: space-between; align-items: center; 
          font-size: 1.6rem; font-weight: 300; padding: 18px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .row:last-child { border-bottom: none; }
        .label { color: #a3a3aa; letter-spacing: -0.02em; }
        .val { 
          font-weight: 600; font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #00ffff, #fff); 
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
        }
        .val.ok { background: linear-gradient(135deg, #2fb36d, #fff); -webkit-background-clip: text; }
        .val.acc { background: linear-gradient(135deg, #ff7a1a, #dc143c); -webkit-background-clip: text; }
        
        @media (max-width: 600px) {
          .frame { min-width: auto; width: 85%; padding: 30px; }
          .row { font-size: 1.2rem; flex-direction: column; align-items: flex-start; gap: 8px; }
        }
      </style>
    </head>
    <body>
      <div class="frame">
        <div class="row"><span class="label">Api Status:</span> <span class="val ok">Online</span></div>
        <div class="row"><span class="label">Ping:</span> <span class="val" id="ping">12ms</span></div>
        <div class="row"><span class="label">Wss Roundtrip:</span> <span class="val" id="wss">18ms</span></div>
        <div class="row"><span class="label">Latency:</span> <span class="val" id="lat">24ms</span></div>
        <div class="row"><span class="label">Overall Performance:</span> <span class="val acc">99%</span></div>
      </div>
      <script>
        // Simulates dynamic live metrics
        function r(b, v) { return Math.floor(b + (Math.random() * v - v/2)); }
        setInterval(() => {
          document.getElementById('ping').textContent = r(12, 4) + 'ms';
          document.getElementById('lat').textContent = r(24, 8) + 'ms';
          document.getElementById('wss').textContent = r(18, 6) + 'ms';
        }, 1800);
      </script>
    </body>
    </html>
  `);
});

// 1. Create order and start tracking the TXID
app.post('/api/checkout', (req, res) => {
  const { plan, qty, serverId, txid } = req.body;
  const orderId = `ORB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  const pricePerTwo = plan === '1M' ? 0.27 : 0.88;
  const totalUsd = (qty / 2) * pricePerTwo;
  
  const exactLtc = parseFloat((totalUsd / LTC_USD).toFixed(8));
  const expectedLitoshis = Math.round(exactLtc * 100000000);

  // $0.04 Tolerance Logic
  const toleranceUsd = 0.04;
  const toleranceLtc = toleranceUsd / LTC_USD;
  const toleranceLitoshis = Math.round(toleranceLtc * 100000000);
  const minRequiredLitoshis = expectedLitoshis - toleranceLitoshis;

  orders.set(orderId, {
    id: orderId,
    txid: txid,
    expectedLitoshis: expectedLitoshis,
    minRequiredLitoshis: minRequiredLitoshis, 
    server: serverId,
    status: 'pending',
    createdAt: Date.now()
  });

  res.json({ orderId });
});

// 2. Background Polling (Verifies Litecoin TXIDs securely)
setInterval(async () => {
  for (const [id, order] of orders.entries()) {
    if (order.status !== 'pending') continue;

    // Expire unpaid orders after 30 minutes
    if (Date.now() - order.createdAt > 1800000) {
      order.status = 'expired';
      continue;
    }

    try {
      const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${order.txid}`);
      const data = response.data;
      
      let paymentFound = false;
      
      // Verify destination address and exact amount against minimum tolerance
      for (const output of data.outputs) {
        if (output.addresses && output.addresses.includes(RECEIVER_ADDRESS) && output.value >= order.minRequiredLitoshis) {
          paymentFound = true;
          break;
        }
      }

      // Must find the exact payment AND have at least 1 network confirmation
      if (paymentFound && data.confirmations > 0) {
        order.status = 'confirmed';
        console.log(`Payment confirmed for ${id}!`);
        console.log(`Executing Discord boosts for server: ${order.server}`);
      }
    } catch (error) {
      // Ignore unconfirmed/rate-limited errors silently
    }
  }
}, 15000);

// 3. Status endpoint for your Vercel frontend to poll safely
app.get('/api/status/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
