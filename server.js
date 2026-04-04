// server.js
const express = require('express');
const cors = require('cors');
const { randomBytes } = require('crypto');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Initialize Firebase Admin from ENV
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://halurea1.firebaseio.com"
});

const db = admin.database();

// ✅ Generate Key
app.post('/generatekey', async (req, res) => {
  const { validityMinutes, maxUses } = req.body;

  if (!validityMinutes || !maxUses) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const key = randomBytes(8).toString('hex'); // 16-char hex
  const now = new Date();
  const expiryDate = new Date(now.getTime() + validityMinutes * 60 * 1000);

  try {
    await db.ref('keys/' + key).set({
      maxUses,
      used: 0,
      created: now.toLocaleString(),    // human-readable
      expiry: expiryDate.toLocaleString() // human-readable
    });

    res.json({ success: true, key });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Database error' });
  }
});

// ✅ Validate / Use Key
app.post('/usekey', async (req, res) => {
  const { key } = req.body;

  if (!key) return res.json({ success: false, error: 'No key provided' });

  try {
    const ref = db.ref('keys/' + key);
    const snapshot = await ref.once('value');
    const found = snapshot.val();

    if (!found) return res.json({ success: false, error: 'Invalid key' });

    const now = new Date();
    const expiryDate = new Date(found.expiry);

    // ❌ Expired
    if (now > expiryDate) {
      await ref.remove();
      return res.json({ success: false, error: 'Key expired' });
    }

    // ❌ Used up
    if (found.used >= found.maxUses) {
      await ref.remove();
      return res.json({ success: false, error: 'Key fully used' });
    }

    // ✅ Increase usage
    await ref.update({ used: found.used + 1 });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Server error' });
  }
});

// ✅ Auto cleanup expired/used keys
setInterval(async () => {
  const snapshot = await db.ref('keys').once('value');

  snapshot.forEach(child => {
    const data = child.val();
    const now = new Date();
    const expiryDate = new Date(data.expiry);

    if (now > expiryDate || data.used >= data.maxUses) {
      child.ref.remove();
    }
  });

  console.log("Cleanup done");
}, 60000); // every 60 seconds

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
