const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const orders = new Map();
const API_BASE = 'https://api.blockcypher.com/v1/ltc/main';
const LTC_USD = 85; 

app.post('/api/checkout', async (req, res) => {
  const { plan, qty, serverId } = req.body;
  const orderId = `ORB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  // In production, generate a unique address per order using an xpub key
  const uniqueLtcAddress = `ltc1q_insert_generated_address_here`;
  
  const pricePerTwo = plan === '1M' ? 0.27 : 0.88;
  const totalUsd = (qty / 2) * pricePerTwo;
  const exactLtc = parseFloat((totalUsd / LTC_USD).toFixed(8));

  orders.set(orderId, {
    id: orderId,
    address: uniqueLtcAddress,
    amountLtc: exactLtc,
    server: serverId,
    status: 'pending',
    createdAt: Date.now()
  });

  res.json({ orderId, address: uniqueLtcAddress, amountLtc: exactLtc });
});

setInterval(async () => {
  for (const [id, order] of orders.entries()) {
    if (order.status !== 'pending') continue;

    if (Date.now() - order.createdAt > 1800000) {
      order.status = 'expired';
      continue;
    }

    try {
      const response = await axios.get(`${API_BASE}/addrs/${order.address}/balance`);
      const balanceLtc = response.data.balance / 100000000;

      if (balanceLtc >= order.amountLtc) {
        order.status = 'confirmed';
        console.log(`Payment confirmed for ${id}. Executing Discord boosts for ${order.server}...`);
        // Add your Discord boost script execution here
      }
    } catch (error) {
      // Ignored: Blockcypher rate limit or empty address
    }
  }
}, 30000);

app.get('/api/status/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
