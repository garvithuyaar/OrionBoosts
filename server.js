const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Allows the backend to serve the 1000056901.gif file directly
app.use(express.static(__dirname));

const orders = new Map();

const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const LTC_USD = 85; 

// Dynamic Glassmorphic Landing Page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orion Boosts API</title>
      <style>
        :root {
          --bg: #0a0a0c;
          --glass: rgba(20, 20, 25, 0.65);
          --glow-or: #ff7a1a;
          --glow-cr: #dc143c;
          --glow-cy: #00ffff;
        }
        body {
          margin: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--bg);
          background-image: radial-gradient(circle at 15% 50%, rgba(220, 20, 60, 0.15), transparent 40%),
                            radial-gradient(circle at 85% 30%, rgba(255, 122, 26, 0.15), transparent 40%);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
          color: #fff;
          overflow: hidden;
        }
        .frame {
          background: var(--glass);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 122, 26, 0.2);
          border-radius: 32px;
          padding: 70px 50px;
          text-align: center;
          box-shadow: 0 20px 80px rgba(0, 0, 0, 0.6), inset 0 0 40px rgba(255, 122, 26, 0.05);
          position: relative;
          z-index: 10;
          min-width: 480px;
        }
        .logo {
          width: 80px;
          height: 80px;
          border-radius: 20px;
          margin-bottom: 24px;
          object-fit: contain;
          animation: float 4s ease-in-out infinite;
          box-shadow: 0 10px 30px rgba(255, 122, 26, 0.3);
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        h1 {
          font-weight: 200;
          font-size: 3.2rem;
          margin: 0 0 10px;
          background: linear-gradient(135deg, var(--glow-or), var(--glow-cr));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.04em;
        }
        p.subtitle {
          font-weight: 300;
          font-size: 1.1rem;
          color: #a3a3aa;
          margin-bottom: 50px;
          letter-spacing: -0.02em;
        }
        .metrics {
          display: flex;
          justify-content: space-around;
          gap: 20px;
        }
        .metric {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .metric-val {
          font-size: 3.5rem;
          font-weight: 100;
          letter-spacing: -0.04em;
          margin-bottom: 8px;
          font-variant-numeric: tabular-nums;
          background: linear-gradient(135deg, #fff, #a3a3aa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .metric-val.cyan {
          background: linear-gradient(135deg, var(--glow-cy), #fff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .metric-label {
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #2fb36d;
          box-shadow: 0 0 12px #2fb36d;
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        
        /* Custom animated SVG background waves */
        .wave-container {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          opacity: 0.25;
        }
        .wave {
          position: absolute;
          width: 200%;
          height: 100%;
          background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg"><path d="M0,200 C200,100 200,300 400,200 C600,100 600,300 800,200 L800,400 L0,400 Z" fill="%238b0000"/></svg>') repeat-x;
          background-size: 800px 400px;
          bottom: -200px;
          animation: wave-roll 18s linear infinite;
        }
        .wave.w2 {
          background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg"><path d="M0,250 C200,150 200,350 400,250 C600,150 600,350 800,250 L800,400 L0,400 Z" fill="%23dc143c"/></svg>') repeat-x;
          background-size: 800px 400px;
          bottom: -220px;
          opacity: 0.6;
          animation: wave-roll 12s linear infinite reverse;
        }
        @keyframes wave-roll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-800px); }
        }
        
        @media (max-width: 600px) {
          .frame { min-width: auto; width: 90%; padding: 50px 20px; }
          .metrics { flex-direction: column; gap: 30px; }
          h1 { font-size: 2.4rem; }
        }
      </style>
    </head>
    <body>
      <div class="wave-container">
        <div class="wave"></div>
        <div class="wave w2"></div>
      </div>
      <div class="frame">
        <img src="1000056901.gif" alt="Orion Boosts" class="logo">
        <h1>Orion Boosts API</h1>
        <p class="subtitle">System Operational & Working Fine</p>
        
        <div class="metrics">
          <div class="metric">
            <div class="metric-val" id="ping">12<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span></div>
            <div class="metric-label"><div class="dot"></div> Ping</div>
          </div>
          <div class="metric">
            <div class="metric-val cyan" id="lat">24<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span></div>
            <div class="metric-label"><div class="dot"></div> Latency</div>
          </div>
          <div class="metric">
            <div class="metric-val" id="wss">18<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span></div>
            <div class="metric-label"><div class="dot"></div> WSS Round Trip</div>
          </div>
        </div>
      </div>
      <script>
        // Simulates dynamic live metrics
        function updateMetrics() {
          const r = (base, varRange) => Math.floor(base + (Math.random() * varRange - varRange/2));
          document.getElementById('ping').innerHTML = r(12, 4) + '<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span>';
          document.getElementById('lat').innerHTML = r(24, 8) + '<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span>';
          document.getElementById('wss').innerHTML = r(18, 6) + '<span style="font-size:1.5rem;color:rgba(255,255,255,0.2)">ms</span>';
        }
        setInterval(updateMetrics, 1800);
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

// 2. Background Polling
setInterval(async () => {
  for (const [id, order] of orders.entries()) {
    if (order.status !== 'pending') continue;

    if (Date.now() - order.createdAt > 1800000) {
      order.status = 'expired';
      continue;
    }

    try {
      const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${order.txid}`);
      const data = response.data;
      
      let paymentFound = false;
      
      for (const output of data.outputs) {
        if (output.addresses && output.addresses.includes(RECEIVER_ADDRESS) && output.value >= order.minRequiredLitoshis) {
          paymentFound = true;
          break;
        }
      }

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

// 3. Status endpoint
app.get('/api/status/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
