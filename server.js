const express = require('express');
const cors = require('cors');
const { randomBytes } = require('crypto');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 ENV FIX
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

// 🔥 Helper (display only)
function formatReadableTime(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  });
}

// ✅ Generate Key
app.post('/generatekey', async (req, res) => {
  const { validityMinutes, maxUses } = req.body;

  if (!validityMinutes || !maxUses) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const key = randomBytes(8).toString('hex');

  const now = Date.now(); // ✅ RAW
  const expiry = now + (validityMinutes * 60 * 1000); // ✅ RAW

  try {
    await db.ref('keys/' + key).set({
      // ✅ RAW (IMPORTANT FOR LOGIC + DISCORD)
      createdRaw: now,
      expiryRaw: expiry,

      // ✅ READABLE (FOR YOU ONLY)
      createdAt: formatReadableTime(new Date(now)),
      expiry: formatReadableTime(new Date(expiry)),

      maxUses,
      used: 0
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
    const ref = db.ref('keys/' + key);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return res.json({ success: false, error: 'Invalid key' });
    }

    const data = snapshot.val();
    const now = Date.now();

    // ❌ Expired
    if (now > data.expiryRaw) {
      await ref.remove();
      return res.json({ success: false, error: 'Key expired' });
    }

    // ❌ Used up
    if (data.used >= data.maxUses) {
      await ref.remove();
      return res.json({ success: false, error: 'Key fully used' });
    }

    // ✅ Increase usage
    const newUsed = data.used + 1;
    await ref.update({ used: newUsed });

    const remainingUses = data.maxUses - newUsed;

    res.json({
      success: true,
      remainingUses,
      createdRaw: data.createdRaw,
      expiryRaw: data.expiryRaw
    });

    // Auto delete if finished
    if (newUsed >= data.maxUses) {
      await ref.remove();
    }

  } catch (err) {
    console.error("Server error:", err);
    res.json({ success: false, error: 'Server error' });
  }
});

// ✅ Cleanup
setInterval(async () => {
  try {
    const snapshot = await db.ref('keys').once('value');
    const now = Date.now();

    snapshot.forEach(child => {
      const data = child.val();
      if (!data) return;

      if (now > data.expiryRaw || data.used >= data.maxUses) {
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
