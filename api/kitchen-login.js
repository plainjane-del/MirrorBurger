const crypto = require('crypto');
const {
    getKitchenSecret,
    makeKitchenToken,
    verifyKitchenToken,
} = require('./_kitchenAuth.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = getKitchenSecret();
    if (!secret) {
        return res.status(500).json({ error: 'Server missing KITCHEN_PASSWORD env' });
    }

    try {
        const body = req.body || {};

        if (body.token) {
            if (verifyKitchenToken(body.token, secret)) {
                return res.status(200).json({ ok: true });
            }
            return res.status(401).json({ error: 'Session expired' });
        }

        const password = String(body.password || '');
        const a = Buffer.from(password);
        const b = Buffer.from(secret);
        const match = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!match) {
            return res.status(401).json({ error: 'Wrong password' });
        }

        return res.status(200).json({ ok: true, token: makeKitchenToken(secret) });
    } catch (err) {
        console.error('kitchen-login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
};
