const crypto = require('crypto');

function getKitchenSecret() {
    return process.env.KITCHEN_PASSWORD || '';
}

function makeKitchenToken(secret) {
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    const payload = String(exp);
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

function verifyKitchenToken(token, secret) {
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

function requireKitchen(req) {
    const secret = getKitchenSecret();
    if (!secret) {
        const err = new Error('Server missing KITCHEN_PASSWORD');
        err.status = 500;
        throw err;
    }
    const body = req.body || {};
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = body.token || bearer || '';
    if (!verifyKitchenToken(token, secret)) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
    return secret;
}

module.exports = {
    getKitchenSecret,
    makeKitchenToken,
    verifyKitchenToken,
    requireKitchen,
};
