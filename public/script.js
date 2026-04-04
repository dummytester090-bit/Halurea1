const express = require('express');
const cors = require('cors');
const { randomBytes } = require('crypto');
const admin = require('firebase-admin');

const app = express();

// ✅ MIDDLEWARE
app.use(cors());
app.use(express.json());

// 🔥 SAFE FIREBASE INIT (FIXED)
let db;

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, '\n')
        }),
        databaseURL: "https://halurea1.firebaseio.com"
    });

    db = admin.database();
    console.log("✅ Firebase connected");

} catch (err) {
    console.error("❌ Firebase init error:", err);
}

// ✅ TEST ROUTE (VERY IMPORTANT)
app.get('/', (req, res) => {
    res.send("🔥 Backend is alive!");
});

// ✅ GENERATE KEY
app.post('/generatekey', async (req, res) => {
    console.log("📩 Incoming request:", req.body);

    const { validityMinutes, maxUses } = req.body;

    if (!validityMinutes || !maxUses) {
        return res.json({ success: false, error: 'Invalid request data' });
    }

    try {
        const key = randomBytes(8).toString('hex');
        const expiry = Date.now() + (validityMinutes * 60 * 1000);

        const ref = db.ref('keys').push();

        await ref.set({
            key,
            expiry,
            maxUses,
            used: 0,
            createdAt: Date.now()
        });

        console.log("✅ Key created:", key);

        res.json({ success: true, key });

    } catch (err) {
        console.error("❌ Generate error:", err);
        res.json({ success: false, error: 'Server error' });
    }
});

// ✅ USE KEY
app.post('/usekey', async (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.json({ success: false, error: 'No key provided' });
    }

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

        if (!found) {
            return res.json({ success: false, error: 'Invalid key' });
        }

        if (Date.now() > found.expiry) {
            await refKey.remove();
            return res.json({ success: false, error: 'Expired' });
        }

        if (found.used >= found.maxUses) {
            await refKey.remove();
            return res.json({ success: false, error: 'No uses left' });
        }

        await refKey.update({
            used: found.used + 1
        });

        res.json({
            success: true,
            remaining: found.maxUses - (found.used + 1)
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, error: 'Server error' });
    }
});

// ✅ AUTO CLEANUP
setInterval(async () => {
    try {
        const snapshot = await db.ref('keys').once('value');

        snapshot.forEach(child => {
            const data = child.val();

            if (
                Date.now() > data.expiry ||
                data.used >= data.maxUses
            ) {
                child.ref.remove();
            }
        });

        console.log("🧹 Cleanup done");

    } catch (err) {
        console.error("Cleanup error:", err);
    }

}, 60000);

// ✅ START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
