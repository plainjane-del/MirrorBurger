function sb() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    // Anon can SELECT menu, but UPDATE/INSERT is revoked. Same as orders: prefer service role.
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY/SERVICE_ROLE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

async function sbFetch(path, options = {}) {
    const { SUPABASE_URL, SUPABASE_KEY } = sb();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: options.prefer || 'return=representation',
            ...(options.headers || {}),
        },
    });
    const text = await resp.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!resp.ok) {
        const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
        err.status = resp.status;
        err.body = data;
        throw err;
    }
    return data;
}

function errorText(err) {
    if (err && err.body && typeof err.body === 'object' && err.body.message) {
        return String(err.body.message);
    }
    return String(err && err.message || '');
}

function isPermissionError(err) {
    return /42501|permission denied|row-level security/i.test(errorText(err) + JSON.stringify((err && err.body) || ''));
}

function stripMissingColumn(err, body) {
    const msg = errorText(err);
    const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    if (!m) return null;
    const col = m[1];
    const strip = (row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
        if (!Object.prototype.hasOwnProperty.call(row, col)) return row;
        const next = Object.assign({}, row);
        delete next[col];
        return next;
    };
    if (Array.isArray(body)) return body.map(strip);
    return strip(body);
}

async function sbWrite(path, options = {}) {
    let opts = options;
    for (let i = 0; i < 6; i++) {
        try {
            return await sbFetch(path, opts);
        } catch (err) {
            let parsed = opts.body;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch { throw err; }
            }
            const next = stripMissingColumn(err, parsed);
            if (!next || JSON.stringify(next) === JSON.stringify(parsed)) throw err;
            opts = Object.assign({}, opts, { body: JSON.stringify(next) });
        }
    }
    throw new Error('schema retry exhausted');
}

async function listMenuItems({ includeInactive = false } = {}) {
    // Prefer sort_order when column exists; fall back if schema not migrated yet
    const filters = includeInactive ? '' : '&is_active=eq.true';
    try {
        return await sbFetch(
            `menu_items?select=*${filters}&order=category.asc,sort_order.asc,id.asc`
        );
    } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('sort_order') || msg.includes('is_active')) {
            return sbFetch('menu_items?select=*&order=category.asc,id.asc');
        }
        throw err;
    }
}

async function listModifiers({ includeInactive = false } = {}) {
    const filters = includeInactive ? '' : '&is_active=eq.true';
    try {
        return await sbFetch(
            `menu_modifiers?select=*${filters}&order=kind.asc,sort_order.asc,id.asc`
        );
    } catch (err) {
        // Table may not exist until menu-full.sql is run — don't blank the whole admin
        console.warn('menu_modifiers list skipped:', err.message);
        return [];
    }
}

async function upsertMenuItem(item) {
    if (!item || !item.id) throw new Error('Missing item id');
    const row = {
        id: String(item.id).trim(),
        category: item.category,
        name_en: item.name_en,
        name_zh: item.name_zh,
        price: Number(item.price),
        desc_en: item.desc_en ?? null,
        desc_zh: item.desc_zh ?? null,
        img: item.img ?? null,
        tag_en: item.tag_en ?? null,
        tag_zh: item.tag_zh ?? null,
        dietary: item.dietary ?? [],
        sizes: item.sizes ?? null,
        is_side: !!item.is_side,
        has_temp: !!item.has_temp,
        is_sold_out: !!item.is_sold_out,
        is_active: item.is_active !== false,
        sort_order: Number(item.sort_order) || 0,
    };
    return sbWrite('menu_items?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
    });
}

async function deleteMenuItem(id) {
    return sbFetch(`menu_items?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
}

async function upsertModifier(mod) {
    if (!mod || !mod.id) throw new Error('Missing modifier id');
    const row = {
        id: String(mod.id).trim(),
        kind: mod.kind,
        name_en: mod.name_en,
        name_zh: mod.name_zh,
        price: Number(mod.price) || 0,
        is_active: mod.is_active !== false,
        sort_order: Number(mod.sort_order) || 0,
    };
    return sbWrite('menu_modifiers?on_conflict=id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify(row),
    });
}

async function deleteModifier(id) {
    return sbFetch(`menu_modifiers?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal',
    });
}

async function getSetting(key) {
    const rows = await sbFetch(`menu_settings?key=eq.${encodeURIComponent(key)}&select=value`);
    return Array.isArray(rows) && rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
    return sbFetch('menu_settings?on_conflict=key', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: JSON.stringify({
            key: String(key),
            value,
        }),
    });
}

async function listSoldOutIds(storeName) {
    const store = String(storeName || '').trim();
    if (!store) return new Set();
    try {
        const rows = await sbFetch(
            `menu_sold_out?store_name=eq.${encodeURIComponent(store)}&is_sold_out=eq.true&select=item_id`
        );
        return new Set((Array.isArray(rows) ? rows : []).map((r) => r.item_id).filter(Boolean));
    } catch (err) {
        console.warn('menu_sold_out list skipped:', err.message);
        return new Set();
    }
}

async function setMenuItemSoldOut(id, isSoldOut) {
    if (!id) throw new Error('Missing item id');
    return sbWrite(`menu_items?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: JSON.stringify({
            is_sold_out: !!isSoldOut,
        }),
    });
}

async function setStoreMenuSoldOut(storeName, itemId, isSoldOut) {
    const store = String(storeName || '').trim();
    const id = String(itemId || '').trim();
    if (!store || !id) throw new Error('Missing store or item id');
    // Live menu_sold_out has updated_at; live menu_items does not.
    const row = {
        store_name: store,
        item_id: id,
        is_sold_out: !!isSoldOut,
        updated_at: new Date().toISOString(),
    };
    const patchBody = {
        is_sold_out: !!isSoldOut,
        updated_at: row.updated_at,
    };
    try {
        const upserted = await sbWrite('menu_sold_out?on_conflict=store_name,item_id', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            body: JSON.stringify(row),
        });
        if (Array.isArray(upserted) && upserted.length) return upserted;
        if (upserted && !Array.isArray(upserted)) return upserted;
    } catch (err) {
        if (isPermissionError(err)) throw err;
    }
    const patched = await sbWrite(
        `menu_sold_out?store_name=eq.${encodeURIComponent(store)}&item_id=eq.${encodeURIComponent(id)}`,
        {
            method: 'PATCH',
            prefer: 'return=representation',
            body: JSON.stringify(patchBody),
        }
    );
    if (Array.isArray(patched) && patched.length) return patched;
    return sbWrite('menu_sold_out', {
        method: 'POST',
        body: JSON.stringify(row),
    });
}

module.exports = {
    listMenuItems,
    listModifiers,
    upsertMenuItem,
    deleteMenuItem,
    upsertModifier,
    deleteModifier,
    getSetting,
    setSetting,
    listSoldOutIds,
    setMenuItemSoldOut,
    setStoreMenuSoldOut,
    isPermissionError,
};
