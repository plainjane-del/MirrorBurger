const crypto = require('crypto');

function getSecret() {
    return process.env.KITCHEN_PASSWORD || '';
}

function makeToken(secret) {
    const exp = Date.now() + 12 * 60 * 60 * 1000; // 12 小時
    const payload = String(exp);
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

function verifyToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return false;
    const [payload, sig] = token.split('.');
    const exp = Number(payload);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
    } catch {
        return false;
    }
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const secret = getSecret();
    if (!secret) {
        return res.status(500).json({ error: 'Server missing KITCHEN_PASSWORD env' });
    }

    try {
        const body = req.body || {};

        // 驗證現有 session token
        if (body.token) {
            if (verifyToken(body.token, secret)) {
                return res.status(200).json({ ok: true });
            }
            return res.status(401).json({ error: 'Session expired' });
        }

        // 密碼登入
        const password = String(body.password || '');
        const a = Buffer.from(password);
        const b = Buffer.from(secret);
        const match = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!match) {
            return res.status(401).json({ error: 'Wrong password' });
        }

        return res.status(200).json({ ok: true, token: makeToken(secret) });
    } catch (err) {
        console.error('kitchen-login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
};
