const crypto = require('crypto');

function getKitchenSecret() {
    return process.env.KITCHEN_PASSWORD || '';
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
    return (key && process.env[`KITCHEN_PASSWORD_${key}`]) || getKitchenSecret();
}

function getMasterSecret() {
    return process.env.KITCHEN_MASTER_PASSWORD || process.env.MASTER_PASSWORD || '';
}

function getTokenSecret() {
    return getKitchenSecret() || getMasterSecret() || '';
}

const KITCHEN_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // kitchen iPads stay signed in

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function base64url(input) {
    return Buffer.from(String(input)).toString('base64url');
}

function storeIdFromName(storeName) {
    const raw = String(storeName || '').trim();
    if (!raw) return '';
    if (raw === 'Sai Ying Pun') return 'SYP';
    if (raw === 'Fortress Hill') return 'TH';
    if (raw === 'Tsuen Wan (Takeaway Only)') return 'TW';
    const map = {
        'SAI_YING_PUN': 'SYP',
        'FORTRESS_HILL': 'TH',
        'TIN_HAU': 'TH',
        'TSUEN_WAN_TAKEAWAY_ONLY': 'TW',
        'TSUEN_WAN': 'TW',
        SYP: 'SYP',
        TH: 'TH',
        TW: 'TW',
    };
    const slug = slugifyStore(raw);
    return map[slug] || map[raw.toUpperCase()] || '';
}

function enrichAuthClaims(auth) {
    if (!auth || typeof auth !== 'object') return auth;
    const scope = auth.scope === 'all_stores' ? 'all_stores' : 'single_store';
    const store_name = auth.store_name ? String(auth.store_name) : '';
    const store_id = scope === 'all_stores'
        ? '*'
        : (auth.store_id || storeIdFromName(store_name) || '');
    return { ...auth, scope, store_name, store_id };
}

function parseKitchenToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadPart, sig] = token.split('.');
    if (!payloadPart || !sig) return null;

    function signatureMatches(payloadToSign) {
        const expected = signPayload(payloadToSign, secret);
        try {
            return crypto.timingSafeEqual(Buffer.from(String(sig)), Buffer.from(expected));
        } catch {
            return false;
        }
    }

    // Legacy iPad tokens: "<expMs>.<hmac>"
    const legacyExp = Number(payloadPart);
    if (Number.isFinite(legacyExp) && Date.now() <= legacyExp && signatureMatches(payloadPart)) {
        return enrichAuthClaims({
            exp: legacyExp,
            scope: 'all_stores',
            store_name: '',
            legacy: true,
        });
    }

    const payload = Buffer.from(payloadPart, 'base64url').toString('utf8');
    if (!signatureMatches(payload)) return null;
    try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Number.isFinite(Number(parsed.exp)) || Date.now() > Number(parsed.exp)) return null;
        return enrichAuthClaims({
            exp: Number(parsed.exp),
            scope: parsed.scope === 'all_stores' ? 'all_stores' : 'single_store',
            store_name: parsed.store_name ? String(parsed.store_name) : '',
            store_id: parsed.store_id ? String(parsed.store_id) : '',
        });
    } catch {
        return null;
    }
}

function makeKitchenToken(secretOrAuth, maybeAuth) {
    const auth = enrichAuthClaims(
        maybeAuth || (secretOrAuth && typeof secretOrAuth === 'object' ? secretOrAuth : {})
    );
    const secret = typeof secretOrAuth === 'string' && maybeAuth
        ? secretOrAuth
        : getTokenSecret();
    if (!secret) throw new Error('Missing kitchen token secret');
    const exp = Date.now() + KITCHEN_TOKEN_MS;
    const payload = JSON.stringify({
        exp,
        scope: auth.scope === 'all_stores' ? 'all_stores' : 'single_store',
        store_name: auth.store_name ? String(auth.store_name) : '',
        store_id: auth.store_id || (auth.scope === 'all_stores' ? '*' : ''),
    });
    const payloadB64 = base64url(payload);
    const sig = signPayload(payload, secret);
    return `${payloadB64}.${sig}`;
}

function verifyKitchenToken(token, secret) {
    return !!parseKitchenToken(token, secret);
}

function verifyKitchenTokenAny(token) {
    const secrets = [getTokenSecret(), getMasterSecret(), getKitchenSecret()].filter(Boolean);
    const seen = new Set();
    for (const secret of secrets) {
        if (seen.has(secret)) continue;
        seen.add(secret);
        const parsed = parseKitchenToken(token, secret);
        if (parsed) return { ...parsed, secret: getTokenSecret() || secret };
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
    getTokenSecret,
    makeKitchenToken,
    verifyKitchenToken,
    verifyKitchenTokenAny,
    requireKitchen,
    storeIdFromName,
    enrichAuthClaims,
};
