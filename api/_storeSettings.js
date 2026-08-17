const KNOWN_STORES = [
    'Sai Ying Pun',
    'Fortress Hill',
    'Tsuen Wan (Takeaway Only)',
];
const { effectiveIsOpen, overrideUntilFor, isScheduledOpen } = require('../js/store-hours.js');

function getSupabaseConfig() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration error: Missing SUPABASE_URL or SUPABASE_KEY/SERVICE_ROLE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

function normalizeStoreName(storeName) {
    const name = String(storeName || '').trim();
    if (!KNOWN_STORES.includes(name)) {
        throw new Error('Invalid store');
    }
    return name;
}

async function patchStoreSettings(store, body) {
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const url = `${SUPABASE_URL}/rest/v1/store_settings?store_name=eq.${encodeURIComponent(store)}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let rows = [];
    try {
        rows = text ? JSON.parse(text) : [];
    } catch {
        rows = [];
    }
    if (!resp.ok) {
        const err = new Error(`store_settings update failed (${resp.status}): ${text}`);
        err.status = resp.status;
        err.body = text;
        throw err;
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
        throw new Error('Store settings row not found');
    }
    return row;
}

async function getStoreRow(storeName) {
    const store = normalizeStoreName(storeName);
    const { SUPABASE_URL, SUPABASE_KEY } = getSupabaseConfig();
    const url = `${SUPABASE_URL}/rest/v1/store_settings?store_name=eq.${encodeURIComponent(store)}&select=store_name,is_open,override_until,updated_at`;
    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    const text = await resp.text();
    if (!resp.ok) {
        throw new Error(`store_settings read failed (${resp.status}): ${text}`);
    }
    let rows = [];
    try {
        rows = text ? JSON.parse(text) : [];
    } catch {
        rows = [];
    }
    return Array.isArray(rows) ? (rows[0] || null) : rows;
}

async function setStoreOpen(storeName, isOpen, opts = {}) {
    const store = normalizeStoreName(storeName);
    const nowIso = new Date().toISOString();
    let overrideUntil = null;
    if (opts.auto) {
        overrideUntil = null;
    } else if (Object.prototype.hasOwnProperty.call(opts, 'overrideUntil')) {
        overrideUntil = opts.overrideUntil;
    } else {
        const until = overrideUntilFor(store, !!isOpen);
        overrideUntil = until ? until.toISOString() : null;
    }
    const payload = {
        is_open: !!isOpen,
        updated_at: nowIso,
        override_until: overrideUntil,
    };
    try {
        return await patchStoreSettings(store, payload);
    } catch (err) {
        if (!/override_until/i.test(String(err.body || err.message || ''))) throw err;
        return patchStoreSettings(store, {
            is_open: !!isOpen,
            updated_at: nowIso,
        });
    }
}

async function syncStoreToSchedule(storeName) {
    const store = normalizeStoreName(storeName);
    const row = await getStoreRow(store);
    const scheduled = isScheduledOpen(store);
    const effective = effectiveIsOpen(store, row || {});
    if (effective !== scheduled) {
        return row;
    }
    if (row && !!row.is_open === scheduled && !row.override_until) {
        return row;
    }
    return setStoreOpen(store, scheduled, { auto: true });
}

function storeIsAcceptingOrders(storeName, row) {
    return effectiveIsOpen(normalizeStoreName(storeName), row || {});
}

module.exports = {
    KNOWN_STORES,
    setStoreOpen,
    getStoreRow,
    syncStoreToSchedule,
    storeIsAcceptingOrders,
};
