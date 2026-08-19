const crypto = require('crypto');
const { getStoreSecret, getMasterSecret, getKitchenSecret } = require('./_kitchenAuth.js');

const MASTER_ID = '__master__';
const MIN_LEN = 8;

function getSupabaseConfig() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration error');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

function accountIdFor(storeName) {
    const name = String(storeName || '').trim();
    return name || MASTER_ID;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 32);
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyHash(password, stored) {
    const parts = String(stored || '').split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    try {
        const salt = Buffer.from(parts[1], 'hex');
        const expected = Buffer.from(parts[2], 'hex');
        const actual = crypto.scryptSync(String(password), salt, expected.length);
        if (actual.length !== expected.length) return false;
        return crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

function comparePlain(input, target) {
    if (!target) return false;
    const a = Buffer.from(String(input));
    const b = Buffer.from(String(target));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function isMissingTableError(status, text) {
    const msg = String(text || '');
    return status === 404
        || /schema cache|does not exist|kitchen_credentials/i.test(msg);
}

async function readHash(accountId) {
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const url = `${SUPABASE_URL}/rest/v1/kitchen_credentials?account_id=eq.${encodeURIComponent(accountId)}&select=account_id,password_hash`;
    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    const text = await resp.text();
    if (!resp.ok) {
        if (isMissingTableError(resp.status, text)) return { missingTable: true, hash: null };
        throw new Error(`kitchen_credentials read failed (${resp.status}): ${text}`);
    }
    const rows = text ? JSON.parse(text) : [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { missingTable: false, hash: row && row.password_hash ? String(row.password_hash) : null };
}

async function saveHash(accountId, password) {
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const url = `${SUPABASE_URL}/rest/v1/kitchen_credentials?on_conflict=account_id`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
            account_id: accountId,
            password_hash: hashPassword(password),
            updated_at: new Date().toISOString(),
        }),
    });
    const text = await resp.text();
    if (!resp.ok) {
        if (isMissingTableError(resp.status, text)) {
            const err = new Error('MISSING_TABLE');
            err.code = 'MISSING_TABLE';
            throw err;
        }
        throw new Error(`kitchen_credentials save failed (${resp.status}): ${text}`);
    }
}

async function envPasswordMatches(accountId, password) {
    if (accountId === MASTER_ID) {
        return comparePlain(password, getMasterSecret());
    }
    if (!accountId) {
        return comparePlain(password, getKitchenSecret());
    }
    return comparePlain(password, getStoreSecret(accountId));
}

async function passwordMatches(accountId, password) {
    const id = accountIdFor(accountId === MASTER_ID ? '' : accountId);
    const stored = await readHash(id);
    if (stored.missingTable) return envPasswordMatches(id, password);
    if (stored.hash) return verifyHash(password, stored.hash);
    return envPasswordMatches(id, password);
}

function validateNewPassword(password) {
    const next = String(password || '');
    if (next.length < MIN_LEN) {
        const err = new Error(`新密碼至少 ${MIN_LEN} 個字`);
        err.status = 400;
        throw err;
    }
    if (next.length > 72) {
        const err = new Error('新密碼太長');
        err.status = 400;
        throw err;
    }
}

module.exports = {
    MASTER_ID,
    MIN_LEN,
    accountIdFor,
    passwordMatches,
    saveHash,
    validateNewPassword,
};
