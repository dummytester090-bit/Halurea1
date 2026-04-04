const express = require('express');
const cors = require('cors');
const { randomBytes } = require('crypto');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 FIX: Properly parse ENV + fix private key formatting
let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
} catch (err) {
  console.error("🔥 ENV ERROR:", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://halurea1-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

// Key types
const KEY_TYPES = {
  basic: { validityMinutes: 10, maxUses: 1 },
  standard: { validityMinutes: 30, maxUses: 2 },
  good: { validityMinutes: 60, maxUses: 8 }
};

// ✅ Generate Key
app.post('/generatekey', async (req, res) => {
  const { validityMinutes, maxUses } = req.body;

  if (!validityMinutes || !maxUses) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const key = randomBytes(8).toString('hex');
  const expiry = Date.now() + validityMinutes * 60 * 1000;

  try {
    const ref = db.ref('keys');
    await ref.push().set({
      key,
      expiry,
      maxUses,
      used: 0,
      createdAt: Date.now()
    });

    res.json({ success: true, key });
  } catch (err) {
    console.error("DB ERROR:", err);
    res.json({ success: false, error: 'Database error' });
  }
});

// ✅ Use Key
app.post('/usekey', async (req, res) => {
  const { key } = req.body;

  if (!key) return res.json({ success: false, error: 'No key provided' });

  try {
    const snapshot = await db.ref('keys').once('value');
    let found = null;
    let refKey = null;

    snapshot.forEach(child => {
      const data = child.val();
      if (data.key === key) {
        found = data;
        refKey = child.ref;
      }
    });

    if (!found) return res.json({ success: false, error: 'Invalid key' });

    if (Date.now() > found.expiry) {
      await refKey.remove();
      return res.json({ success: false, error: 'Key expired' });
    }

    if (found.used >= found.maxUses) {
      await refKey.remove();
      return res.json({ success: false, error: 'Key fully used' });
    }

    await refKey.update({ used: found.used + 1 });

    res.json({
      success: true,
      remainingUses: found.maxUses - (found.used + 1)
    });

    if (found.used + 1 >= found.maxUses) {
      await refKey.remove();
    }
  } catch (err) {
    console.error("Server error:", err);
    res.json({ success: false, error: 'Server error' });
  }
});

// ✅ Auto cleanup
setInterval(async () => {
  try {
    const snapshot = await db.ref('keys').once('value');
    snapshot.forEach(child => {
      const data = child.val();
      if (!data) return;
      if (Date.now() > data.expiry || data.used >= data.maxUses) {
        child.ref.remove();
      }
    });
    console.log("🧹 Cleanup done");
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
