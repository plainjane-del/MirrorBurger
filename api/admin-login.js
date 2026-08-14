const { getAdminSecret, makeAdminToken, verifyAdminToken } = require('./_adminAuth.js');
const crypto = require('crypto');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = getAdminSecret();
    if (!secret) {
        return res.status(500).json({ error: 'Server missing ADMIN_PASSWORD (or KITCHEN_PASSWORD)' });
    }

    try {
        const body = req.body || {};
        if (body.token) {
            if (verifyAdminToken(body.token, secret)) {
                return res.status(200).json({ ok: true });
            }
            return res.status(401).json({ error: 'Session expired' });
        }

        const password = String(body.password || '');
        const a = Buffer.from(password);
        const b = Buffer.from(secret);
        const match = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!match) return res.status(401).json({ error: 'Wrong password' });

        return res.status(200).json({ ok: true, token: makeAdminToken(secret) });
    } catch (err) {
        console.error('admin-login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
};
