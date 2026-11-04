const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory database for orders
const orders = new Map();

// Your exact Litecoin address from the frontend
const RECEIVER_ADDRESS = 'ltc1qrlygyv2z8am20lgxpju3fdtky39lux7wlpwru3';
const LTC_USD = 85; // TODO: Replace with live rate API later if needed

// Health check to fix the "Cannot GET /" error on Render
app.get('/', (req, res) => {
  res.send('Orion Boosts API is live and running securely.');
});

// 1. Create order and start tracking the TXID
app.post('/api/checkout', (req, res) => {
  const { plan, qty, serverId, txid } = req.body;
  const orderId = `ORB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  // Calculate exactly how many Litoshis are expected (1 LTC = 100,000,000 Litoshis)
  const pricePerTwo = plan === '1M' ? 0.27 : 0.88;
  const totalUsd = (qty / 2) * pricePerTwo;
  const exactLtc = parseFloat((totalUsd / LTC_USD).toFixed(8));
  const expectedLitoshis = Math.round(exactLtc * 100000000);

  orders.set(orderId, {
    id: orderId,
    txid: txid,
    expectedLitoshis: expectedLitoshis,
    server: serverId,
    status: 'pending',
    createdAt: Date.now()
  });

  res.json({ orderId });
});

// 2. Background Polling: Verify TXIDs securely on the server
setInterval(async () => {
  for (const [id, order] of orders.entries()) {
    if (order.status !== 'pending') continue;

    // Expire the order if it has been pending for over 30 minutes
    if (Date.now() - order.createdAt > 1800000) {
      order.status = 'expired';
      continue;
    }

    try {
      // Look up the specific transaction on the blockchain
      const response = await axios.get(`https://api.blockcypher.com/v1/ltc/main/txs/${order.txid}`);
      const data = response.data;
      
      let paymentFound = false;
      
      // Check if the transaction sent the correct amount to your exact address
      for (const output of data.outputs) {
        if (output.addresses && output.addresses.includes(RECEIVER_ADDRESS) && output.value >= order.expectedLitoshis) {
          paymentFound = true;
          break;
        }
      }

      // Secure verification: Must be the correct amount AND have at least 1 confirmation
      if (paymentFound && data.confirmations > 0) {
        order.status = 'confirmed';
        console.log(`Payment confirmed for ${id}!`);
        console.log(`Executing Discord boosts for server: ${order.server}`);
        
        // TODO: Add your automated Discord boosting script logic right here
      }
    } catch (error) {
      // Blockcypher throws an error if the TXID is still unconfirmed or if rate-limited. 
      // We safely ignore it and try again on the next loop.
    }
  }
}, 15000); // Scans the blockchain every 15 seconds

// 3. Status endpoint for your Vercel frontend to poll safely
app.get('/api/status/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
