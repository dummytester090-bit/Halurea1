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

  // 🔥 CRITICAL FIX: convert \n → real new lines
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

// Helper: Convert timestamp to human-readable format like "Apr 4, 2026 8:00:00 PM"
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

// Key types (unused but kept as requested)
const KEY_TYPES = {
  basic: { validityMinutes: 10, maxUses: 1 },
  standard: { validityMinutes: 30, maxUses: 2 },
  good: { validityMinutes: 60, maxUses: 8 }
};

// ✅ Generate Key - stores data under keys/{key} with human-readable timestamps
app.post('/generatekey', async (req, res) => {
  const { validityMinutes, maxUses } = req.body;

  if (!validityMinutes || !maxUses) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const key = randomBytes(8).toString('hex');
  const now = new Date();
  const expiryDate = new Date(now.getTime() + validityMinutes * 60 * 1000);

  const createdAtReadable = formatReadableTime(now);
  const expiryReadable = formatReadableTime(expiryDate);

  try {
    const ref = db.ref('keys/' + key);
    await ref.set({
      createdAt: createdAtReadable,
      expiry: expiryReadable,
      maxUses,
      used: 0
    });

    res.json({ success: true, key });

  } catch (err) {
    console.error("DB ERROR:", err);
    res.json({ success: false, error: 'Database error' });
  }
});

// ✅ Use Key - direct access using key as Firebase path
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

    // Check expiry using readable string (parseable by Date constructor)
    if (new Date(data.expiry) < new Date()) {
      await ref.remove();
      return res.json({ success: false, error: 'Key expired' });
    }

    if (data.used >= data.maxUses) {
      await ref.remove();
      return res.json({ success: false, error: 'Key fully used' });
    }

    // Increment usage
    await ref.update({ used: data.used + 1 });

    const remainingUses = data.maxUses - (data.used + 1);
    res.json({
      success: true,
      remainingUses: remainingUses
    });

    // Auto-remove if fully used after this increment
    if (data.used + 1 >= data.maxUses) {
      await ref.remove();
    }

  } catch (err) {
    console.error("Server error:", err);
    res.json({ success: false, error: 'Server error' });
  }
});

// ✅ Auto cleanup - removes expired or fully used keys
setInterval(async () => {
  try {
    const snapshot = await db.ref('keys').once('value');
    const now = new Date();
    snapshot.forEach(child => {
      const data = child.val();
      if (!data) return;

      const isExpired = new Date(data.expiry) < now;
      const isFullyUsed = data.used >= data.maxUses;

      if (isExpired || isFullyUsed) {
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
