const crypto = require('crypto');

function getAdminSecret() {
    return process.env.ADMIN_PASSWORD || process.env.KITCHEN_PASSWORD || '';
}

function makeAdminToken(secret) {
    const exp = Date.now() + 12 * 60 * 60 * 1000;
    const payload = `admin.${exp}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
}

function verifyAdminToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return false;
    const lastDot = token.lastIndexOf('.');
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    if (!payload.startsWith('admin.')) return false;
    const exp = Number(payload.slice('admin.'.length));
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
    } catch {
        return false;
    }
}

function requireAdmin(req) {
    const secret = getAdminSecret();
    if (!secret) {
        const err = new Error('Server missing ADMIN_PASSWORD (or KITCHEN_PASSWORD)');
        err.status = 500;
        throw err;
    }
    const body = req.body || {};
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = body.token || bearer || '';
    if (!verifyAdminToken(token, secret)) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
    return secret;
}

module.exports = {
    getAdminSecret,
    makeAdminToken,
    verifyAdminToken,
    requireAdmin,
};
