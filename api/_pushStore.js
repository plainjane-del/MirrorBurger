/**
 * Push subscription storage.
 * Prefer public.push_subscriptions table; if missing, fall back to
 * private Supabase Storage bucket (works without running SQL).
 */
const BUCKET = 'mb-kitchen-push';

function sbConfig() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing Supabase env');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

function isMissingTable(status, text) {
    return status === 404 || /PGRST205|push_subscriptions|schema cache/i.test(String(text || ''));
}

function endpointKey(endpoint) {
    // Stable filename-safe key from endpoint URL
    let hash = 0;
    const s = String(endpoint);
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    return `sub_${Math.abs(hash).toString(36)}_${s.length}`;
}

async function storageHeaders(extra = {}) {
    const { SUPABASE_KEY } = sbConfig();
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...extra,
    };
}

async function ensurePushBucket() {
    const { SUPABASE_URL } = sbConfig();
    const headers = await storageHeaders({ 'Content-Type': 'application/json' });
    const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            id: BUCKET,
            name: BUCKET,
            public: false,
            file_size_limit: 102400,
        }),
    });
    // 200/201 created, 409 already exists — both fine
    if (!create.ok && create.status !== 409) {
        const text = await create.text();
        // Ignore duplicate / already exists style errors
        if (!/already exists|duplicate|Bucket already exists/i.test(text)) {
            console.warn('ensurePushBucket:', create.status, text);
        }
    }
}

async function upsertViaTable(row) {
    const { SUPABASE_URL, SUPABASE_KEY } = sbConfig();
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`,
        {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(row),
        }
    );
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(`table upsert failed (${resp.status}): ${text}`);
        err.status = resp.status;
        err.body = text;
        throw err;
    }
    return { ok: true, via: 'table' };
}

async function upsertViaStorage(row) {
    await ensurePushBucket();
    const { SUPABASE_URL } = sbConfig();
    const key = `${endpointKey(row.endpoint)}.json`;
    const headers = await storageHeaders({
        'Content-Type': 'application/json',
        'x-upsert': 'true',
    });
    const resp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                endpoint: row.endpoint,
                p256dh: row.p256dh,
                auth: row.auth,
                store_name: row.store_name,
                updated_at: new Date().toISOString(),
            }),
        }
    );
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`storage upsert failed (${resp.status}): ${text}`);
    }
    return { ok: true, via: 'storage' };
}

async function upsertPushSubscription(row) {
    try {
        return await upsertViaTable(row);
    } catch (err) {
        if (isMissingTable(err.status, err.body || err.message)) {
            console.warn('push_subscriptions table missing — using Storage fallback');
            return upsertViaStorage(row);
        }
        throw err;
    }
}

async function listViaTable(storeName) {
    const { SUPABASE_URL, SUPABASE_KEY } = sbConfig();
    const url =
        `${SUPABASE_URL}/rest/v1/push_subscriptions` +
        `?or=(store_name.eq.${encodeURIComponent(storeName)},store_name.eq.all)` +
        `&select=id,endpoint,p256dh,auth,store_name`;
    const resp = await fetch(url, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(text);
        err.status = resp.status;
        err.body = text;
        throw err;
    }
    return text ? JSON.parse(text) : [];
}

async function listViaStorage(storeName) {
    await ensurePushBucket();
    const { SUPABASE_URL } = sbConfig();
    const headers = await storageHeaders({ 'Content-Type': 'application/json' });
    const listResp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prefix: '', limit: 1000 }),
    });
    if (!listResp.ok) {
        console.warn('storage list failed:', await listResp.text());
        return [];
    }
    const files = await listResp.json();
    if (!Array.isArray(files) || !files.length) return [];

    const rows = [];
    for (const f of files) {
        const name = f?.name;
        if (!name || !name.endsWith('.json')) continue;
        // Prefer authenticated object download
        const getResp = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`,
            { headers: await storageHeaders() }
        );
        if (!getResp.ok) continue;
        try {
            const row = await getResp.json();
            if (!row?.endpoint || !row?.p256dh || !row?.auth) continue;
            const store = row.store_name || 'all';
            if (store === 'all' || store === storeName) rows.push(row);
        } catch {
            /* skip bad file */
        }
    }
    return rows;
}

async function listPushSubscriptions(storeName) {
    try {
        return await listViaTable(storeName || '');
    } catch (err) {
        if (isMissingTable(err.status, err.body || err.message)) {
            return listViaStorage(storeName || '');
        }
        console.warn('Push list failed:', err.message);
        return [];
    }
}

async function deleteViaTable(endpoint) {
    const { SUPABASE_URL, SUPABASE_KEY } = sbConfig();
    const url = `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`;
    await fetch(url, {
        method: 'DELETE',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
        },
    });
}

async function deleteViaStorage(endpoint) {
    const { SUPABASE_URL } = sbConfig();
    const key = `${endpointKey(endpoint)}.json`;
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
        method: 'DELETE',
        headers: await storageHeaders(),
    });
}

async function deletePushSubscription(endpoint) {
    if (!endpoint) return;
    try {
        await deleteViaTable(endpoint);
    } catch {
        /* ignore */
    }
    try {
        await deleteViaStorage(endpoint);
    } catch {
        /* ignore */
    }
}

module.exports = {
    upsertPushSubscription,
    listPushSubscriptions,
    deletePushSubscription,
};
