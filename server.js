// server.js
import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';
import admin from 'firebase-admin';

// 🚨 Use service account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://halurea1.firebaseio.com"
});

const db = admin.database();

const app = express();
app.use(cors());
app.use(express.json());

// Helper: default key types
const KEY_TYPES = {
    basic: { validityMinutes: 10, maxUses: 1 },
    standard: { validityMinutes: 30, maxUses: 2 },
    good: { validityMinutes: 60, maxUses: 8 } // updated from 5 → 8
};

// ✅ Generate Key
app.post('/generatekey', async (req, res) => {
    try {
        const { keyType } = req.body;
        if (!KEY_TYPES[keyType]) return res.json({ success: false, error: 'Invalid key type' });

        const { validityMinutes, maxUses } = KEY_TYPES[keyType];
        const key = randomBytes(8).toString('hex').toUpperCase();
        const expiry = Date.now() + validityMinutes * 60 * 1000;

        await db.ref('keys').push({
            key,
            keyType,
            expiry,
            maxUses,
            used: 0,
            createdAt: Date.now()
        });

        res.json({ success: true, key, validityMinutes, maxUses });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Database error' });
    }
});

// ✅ Use / Redeem Key
app.post('/usekey', async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.json({ success: false, error: 'No key provided' });

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

        // Expired key
        if (Date.now() > found.expiry) {
            await refKey.remove();
            return res.json({ success: false, error: 'Key expired' });
        }

        // Used up
        if (found.used >= found.maxUses) {
            await refKey.remove();
            return res.json({ success: false, error: 'Key fully used' });
        }

        // ✅ Increment usage
        await refKey.update({ used: found.used + 1 });

        res.json({
            success: true,
            keyType: found.keyType,
            remainingUses: found.maxUses - (found.used + 1),
            expiry: found.expiry
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Server error' });
    }
});

// ✅ Auto cleanup expired or fully used keys every 60s
setInterval(async () => {
    try {
        const snapshot = await db.ref('keys').once('value');
        snapshot.forEach(child => {
            const data = child.val();
            if (Date.now() > data.expiry || data.used >= data.maxUses) {
                child.ref.remove();
            }
        });
        console.log("Cleanup done");
    } catch (err) {
        console.error("Cleanup error:", err);
    }
}, 60000);

// ✅ Ready
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Halurea Key Backend running on port ${PORT}`));
