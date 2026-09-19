/**
 * Mint Supabase-compatible JWTs for Kitchen KDS (HS256 + project JWT secret).
 * Set SUPABASE_JWT_SECRET in Vercel (Project Settings → API → JWT Secret).
 * Claims include store_id for future RLS: SYP | TH | TW | *
 */
const crypto = require('crypto');

function b64urlJson(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function getJwtSecret() {
    return String(process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '').trim();
}

function mintSupabaseJwt({ sub, storeId, scope, ttlSec = 60 * 60 * 12 } = {}) {
    const secret = getJwtSecret();
    if (!secret) return null;

    const now = Math.floor(Date.now() / 1000);
    const store_id = storeId || (scope === 'all_stores' ? '*' : '');
    const payload = {
        iss: 'supabase',
        aud: 'authenticated',
        role: 'authenticated',
        sub: String(sub || `kitchen:${store_id || 'master'}`),
        iat: now,
        exp: now + Math.max(300, Number(ttlSec) || 43200),
        store_id,
        app_metadata: {
            provider: 'kitchen',
            store_id,
            scope: scope === 'all_stores' ? 'all_stores' : 'single_store',
        },
        user_metadata: {},
    };

    const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
    const body = b64urlJson(payload);
    const data = `${header}.${body}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function mintKitchenSupabaseJwt(auth) {
    if (!auth) return null;
    const storeId = auth.store_id
        || (auth.scope === 'all_stores' ? '*' : '');
    return mintSupabaseJwt({
        sub: auth.scope === 'all_stores'
            ? 'kitchen:master'
            : `kitchen:${storeId || 'store'}`,
        storeId,
        scope: auth.scope,
    });
}

module.exports = {
    getJwtSecret,
    mintSupabaseJwt,
    mintKitchenSupabaseJwt,
};
