const { KNOWN_STORES } = require('./_storeSettings.js');
const { getSetting, setSetting } = require('./_menuDb.js');

const TABLE_COUNTS_KEY = 'table_counts';
const TABLE_MAX_PER_STORE = 40;
const DEFAULT_TABLE_COUNTS = {
    'Sai Ying Pun': 5,
    'Fortress Hill': 0,
    'Tsuen Wan (Takeaway Only)': 0,
};

const STORE_SLUGS = {
    syp: 'Sai Ying Pun',
    'sai-ying-pun': 'Sai Ying Pun',
    th: 'Fortress Hill',
    'tin-hau': 'Fortress Hill',
    'fortress-hill': 'Fortress Hill',
    tw: 'Tsuen Wan (Takeaway Only)',
    'tsuen-wan': 'Tsuen Wan (Takeaway Only)',
};

const STORE_SLUG_BY_NAME = {
    'Sai Ying Pun': 'syp',
    'Fortress Hill': 'th',
    'Tsuen Wan (Takeaway Only)': 'tw',
};

const STORE_LABEL_ZH = {
    'Sai Ying Pun': '西營盤',
    'Fortress Hill': '天后',
    'Tsuen Wan (Takeaway Only)': '荃灣',
};

function emptyCounts() {
    const out = {};
    for (const name of KNOWN_STORES) {
        out[name] = Number(DEFAULT_TABLE_COUNTS[name] || 0);
    }
    return out;
}

function clampCount(n) {
    const num = Math.round(Number(n));
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(TABLE_MAX_PER_STORE, num));
}

function parseCounts(raw) {
    const base = emptyCounts();
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return base;
    for (const name of KNOWN_STORES) {
        if (obj[name] != null) base[name] = clampCount(obj[name]);
    }
    return base;
}

async function getTableCounts() {
    try {
        return parseCounts(await getSetting(TABLE_COUNTS_KEY));
    } catch (err) {
        console.warn('table_counts read skipped:', err.message || err);
        return emptyCounts();
    }
}

async function getTableCount(storeName) {
    const counts = await getTableCounts();
    return Number(counts[storeName] || 0);
}

async function setTableCount(storeName, count) {
    if (!KNOWN_STORES.includes(storeName)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    const counts = await getTableCounts();
    counts[storeName] = clampCount(count);
    await setSetting(TABLE_COUNTS_KEY, counts);
    return counts;
}

function storeFromSlug(slug) {
    return STORE_SLUGS[String(slug || '').toLowerCase()] || '';
}

function slugForStore(storeName) {
    return STORE_SLUG_BY_NAME[storeName] || '';
}

function tablePath(storeName, tableNo) {
    const slug = slugForStore(storeName);
    return slug ? `/t/${slug}/${Number(tableNo)}` : `/t/${Number(tableNo)}`;
}

module.exports = {
    KNOWN_STORES,
    TABLE_MAX_PER_STORE,
    STORE_LABEL_ZH,
    getTableCounts,
    getTableCount,
    setTableCount,
    storeFromSlug,
    slugForStore,
    tablePath,
};
