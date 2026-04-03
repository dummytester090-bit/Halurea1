// server.js
import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

// Landing page for browser check
app.get('/', (req, res) => {
  res.send('Halurea Key Backend is running!');
});

// Key generation endpoint
app.post('/generateKey', (req, res) => {
  const { validityMinutes, maxUses } = req.body;

  if (!validityMinutes || !maxUses) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const key = randomBytes(8).toString('hex'); // Generate random key
  res.json({ success: true, key });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
