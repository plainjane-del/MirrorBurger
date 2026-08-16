const KNOWN_STORES = [
    'Sai Ying Pun',
    'Fortress Hill',
    'Tsuen Wan (Takeaway Only)',
];

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

async function setStoreOpen(storeName, isOpen) {
    const store = normalizeStoreName(storeName);
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
        body: JSON.stringify({
            is_open: !!isOpen,
            updated_at: new Date().toISOString(),
        }),
    });
    const text = await resp.text();
    let rows = [];
    try {
        rows = text ? JSON.parse(text) : [];
    } catch {
        rows = [];
    }
    if (!resp.ok) {
        throw new Error(`store_settings update failed (${resp.status}): ${text}`);
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
        throw new Error('Store settings row not found');
    }
    return row;
}

module.exports = {
    KNOWN_STORES,
    setStoreOpen,
};
