const crypto = require('crypto');

function getKitchenSecret() {
    return String(process.env.KITCHEN_PASSWORD || '').trim();
}

function slugifyStore(storeName) {
    return String(storeName || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function getStoreSecret(storeName) {
    const key = slugifyStore(storeName);
    const specific = key ? String(process.env[`KITCHEN_PASSWORD_${key}`] || '').trim() : '';
    return specific || getKitchenSecret();
}

function getMasterSecret() {
    return String(process.env.KITCHEN_MASTER_PASSWORD || process.env.MASTER_PASSWORD || '').trim();
}

const KITCHEN_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // kitchen iPads stay signed in

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function base64url(input) {
    return Buffer.from(String(input)).toString('base64url');
}

function parseKitchenToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadPart, sig] = token.split('.');
    if (!payloadPart || !sig) return null;

    function signatureMatches(payloadToSign) {
        const expected = signPayload(payloadToSign, secret);
        try {
            return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
        } catch (_) {
            return false;
        }
    }

    // Legacy iPad tokens: "<expMs>.<hmac>"
    const legacyExp = Number(payloadPart);
    if (Number.isFinite(legacyExp) && Date.now() <= legacyExp && signatureMatches(payloadPart)) {
        return {
            exp: legacyExp,
            scope: 'all_stores',
            store_name: '',
            legacy: true,
        };
    }

    const payload = Buffer.from(payloadPart, 'base64url').toString('utf8');
    if (!signatureMatches(payload)) return null;
    try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Number.isFinite(Number(parsed.exp)) || Date.now() > Number(parsed.exp)) return null;
        return {
            exp: Number(parsed.exp),
            scope: parsed.scope === 'all_stores' ? 'all_stores' : 'single_store',
            store_name: parsed.store_name ? String(parsed.store_name) : '',
        };
    } catch (_) {
        return null;
    }
}

function makeKitchenToken(secret, auth = {}) {
    const exp = Date.now() + KITCHEN_TOKEN_MS;
    const payload = JSON.stringify({
        exp,
        scope: auth.scope === 'all_stores' ? 'all_stores' : 'single_store',
        store_name: auth.store_name ? String(auth.store_name) : '',
    });
    const payloadB64 = base64url(payload);
    const sig = signPayload(payload, secret);
    return `${payloadB64}.${sig}`;
}

function verifyKitchenToken(token, secret) {
    return !!parseKitchenToken(token, secret);
}

function verifyKitchenTokenAny(token) {
    const secrets = [];
    function addSecret(secret) {
        if (secret && secrets.indexOf(secret) === -1) secrets.push(secret);
    }
    const masterSecret = getMasterSecret();
    addSecret(masterSecret);
    addSecret(getKitchenSecret());
    try {
        require('./_storeSettings').KNOWN_STORES.forEach((store) => addSecret(getStoreSecret(store)));
    } catch (_) {}

    for (let i = 0; i < secrets.length; i++) {
        const secret = secrets[i];
        const parsed = parseKitchenToken(token, secret);
        if (!parsed) continue;
        if (secret === masterSecret && parsed.scope !== 'all_stores') continue;
        return Object.assign({}, parsed, { secret: secret });
    }
    return null;
}

function requireKitchen(req) {
    const secret = getKitchenSecret();
    const master = getMasterSecret();
    if (!secret && !master) {
        const err = new Error('Server missing KITCHEN_PASSWORD');
        err.status = 500;
        throw err;
    }
    const body = req.body || {};
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = body.token || bearer || '';
    const auth = verifyKitchenTokenAny(token);
    if (!auth) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
    return auth;
}

module.exports = {
    getKitchenSecret,
    getStoreSecret,
    getMasterSecret,
    makeKitchenToken,
    verifyKitchenToken,
    verifyKitchenTokenAny,
    requireKitchen,
};
