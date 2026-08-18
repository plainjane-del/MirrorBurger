const { requireKitchen } = require('./_kitchenAuth.js');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
].filter(Boolean);
const GEMINI_FETCH_TIMEOUT_MS = 3500;
const MAX_GEMINI_ATTEMPTS = 2;

const SYSTEM_INSTRUCTION = `You are an expert Cantonese restaurant cashier for Mirror Burger.
Convert spoken Cantonese into POS JSON using ONLY the provided catalog.

Hard rules:
1) Modifiers never create main items. If user speaks modifiers without a main item, put them in unattachedAddons (verbatim).
2) If an utterance doesn't clearly match the catalog, put it in unrecognizedText (verbatim). Never fuzzy-map.
3) qty: only use qty when explicitly said (1/2/etc). Otherwise qty=1.
4) Never invent ids/sizes/combo/snacks/drinks; only use catalog ids.

Output STRICT JSON only:
{"items":[{"menuId":"b1","qty":1,"size":null,"bun":null,"addonIds":["a4"],"sauceIds":[],"combo":false,"comboSnackId":null,"comboDrinkId":null,"notesEn":"","notesZh":""}],"unattachedAddons":["煎蛋"],"unrecognizedText":["大青瓜"]}
Return empty arrays when nothing matches.`;

function slimItems(items) {
    return (Array.isArray(items) ? items : []).slice(0, 80).map((item) => ({
        id: item.id,
        category: item.category || '',
        name_zh: item.name_zh || item.nameZh || '',
        name_en: item.name_en || item.nameEn || '',
        sizes: Array.isArray(item.sizes) ? item.sizes : null,
    })).filter((item) => item.id);
}

function slimModifiers(modifiers) {
    const rows = [];
    if (Array.isArray(modifiers)) {
        for (const m of modifiers) rows.push(m);
    } else if (modifiers && typeof modifiers === 'object') {
        for (const kind of Object.keys(modifiers)) {
            for (const m of modifiers[kind] || []) {
                rows.push({ ...m, kind: m.kind || kind });
            }
        }
    }
    return rows.slice(0, 120).map((m) => ({
        id: m.id,
        kind: m.kind || '',
        name_zh: m.name_zh || m.nameZh || '',
        name_en: m.name_en || m.nameEn || '',
    })).filter((m) => m.id);
}

function extractJson(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_) {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch (_) {}
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch (_) {}
    }
    return null;
}

function sanitizeTextList(value) {
    return (Array.isArray(value) ? value : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 20);
}

function speechHasExplicitMultiQty(speechText) {
    const text = String(speechText || '').trim();
    if (!text) return false;
    if (/(?:^|[^\d])([2-9]|[1-9]\d)\s*(?:份|個|客|杯|包|兜|盒)/.test(text)) return true;
    if (/(?:兩|二|兩個|兩份|兩客|兩杯|兩包|兩兜|兩盒|雙份)/.test(text)) return true;
    return false;
}

function validateParsed(parsed, items, modifiers, speechText) {
    const itemById = new Map(items.map((i) => [String(i.id), i]));
    const modById = new Map(modifiers.map((m) => [String(m.id), m]));
    const burgerCats = new Set(['beef', 'others', 'veggie']);
    const out = [];
    const list = parsed && Array.isArray(parsed.items) ? parsed.items : [];
    const allowMultiQty = speechHasExplicitMultiQty(speechText);
    for (const row of list.slice(0, 20)) {
        if (!row || typeof row !== 'object') continue;
        const menuId = String(row.menuId || row.menu_id || '').trim();
        const item = itemById.get(menuId);
        if (!item) continue;
        const qty = allowMultiQty
            ? Math.max(1, Math.min(20, Math.round(Number(row.qty) || 1)))
            : 1;
        const isBurger = burgerCats.has(item.category);
        let bun = null;
        if (isBurger) {
            bun = String(row.bun || '') === 'Lettuce Wrap' ? 'Lettuce Wrap' : 'Nissin Bun';
        }
        let size = row.size == null || row.size === '' ? null : String(row.size);
        if (size && Array.isArray(item.sizes) && item.sizes.length) {
            const ok = item.sizes.some((s) => String(s.label || s.value) === size);
            if (!ok) size = item.sizes[0].label || item.sizes[0].value || null;
        } else if (!Array.isArray(item.sizes) || !item.sizes.length) {
            size = null;
        }
        const addonIds = (Array.isArray(row.addonIds) ? row.addonIds : [])
            .map((id) => String(id))
            .filter((id) => {
                const m = modById.get(id);
                return m && (m.kind === 'addon' || !m.kind);
            })
            .slice(0, 12);
        const sauceIds = (Array.isArray(row.sauceIds) ? row.sauceIds : [])
            .map((id) => String(id))
            .filter((id) => {
                const m = modById.get(id);
                return m && (m.kind === 'sauce' || !m.kind);
            })
            .slice(0, 12);
        const combo = isBurger && !!row.combo;
        let comboSnackId = combo ? String(row.comboSnackId || '') : '';
        let comboDrinkId = combo ? String(row.comboDrinkId || '') : '';
        if (combo) {
            const snack = modById.get(comboSnackId);
            const drink = modById.get(comboDrinkId);
            if (!snack || (snack.kind && snack.kind !== 'combo_snack')) comboSnackId = '';
            if (!drink || (drink.kind && drink.kind !== 'combo_drink')) comboDrinkId = '';
        }
        if (combo && (!comboSnackId || !comboDrinkId)) continue;
        out.push({
            menuId,
            qty,
            size,
            bun,
            addonIds,
            sauceIds,
            combo,
            comboSnackId: combo ? comboSnackId : null,
            comboDrinkId: combo ? comboDrinkId : null,
            notesEn: String(row.notesEn || '').slice(0, 80),
            notesZh: String(row.notesZh || '').slice(0, 80),
        });
    }
    return {
        items: out,
        unattachedAddons: sanitizeTextList(parsed && parsed.unattachedAddons),
        unrecognizedText: sanitizeTextList(parsed && parsed.unrecognizedText),
    };
}

async function callGemini({ speechText, items, modifiers }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        const err = new Error('Server missing GEMINI_API_KEY');
        err.status = 500;
        throw err;
    }
    const userPayload = {
        speechText,
        menuItems: items,
        modifiers,
    };
    const body = JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{
            role: 'user',
            parts: [{
                text: `Catalog and spoken order as JSON. Return only {"items":[...],"unattachedAddons":[...],"unrecognizedText":[...]}.\n${JSON.stringify(userPayload)}`,
            }],
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
        },
    });

    let lastErr = null;
    const tried = new Set();
    for (const model of GEMINI_MODELS) {
        if (tried.has(model)) continue;
        tried.add(model);
        if (tried.size > MAX_GEMINI_ATTEMPTS) break;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), GEMINI_FETCH_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(
                `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal }
            );
        } catch (err) {
            clearTimeout(timer);
            lastErr = err;
            if (err && err.name === 'AbortError') continue;
            throw err;
        }
        clearTimeout(timer);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const msg = (data && data.error && data.error.message) || `Gemini HTTP ${resp.status}`;
            lastErr = new Error(msg);
            lastErr.status = 502;
            const isModelRetired = resp.status === 404 || /no longer available|not found|not supported/i.test(msg);
            const isQuotaExceeded = /quota|exceeded your current quota|free_tier_requests|please retry in/i.test(msg);
            const isRateOrDemand = /high demand|rate limit|too many requests|429|503|busy/i.test(msg);
            if (isModelRetired) continue;
            // Rate-limit / high-demand / quota: try next model (up to MAX_GEMINI_ATTEMPTS),
            // because another model may still have capacity.
            if (isRateOrDemand || isQuotaExceeded) continue;
            throw lastErr;
        }
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
            && data.candidates[0].content.parts;
        const raw = Array.isArray(parts) ? parts.map((p) => p.text || '').join('\n') : '';
        return extractJson(raw) || { items: [], unattachedAddons: [], unrecognizedText: [] };
    }
    throw lastErr || new Error('Gemini model unavailable');
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireKitchen(req);
        const body = req.body || {};
        const speechText = String(body.speechText || body.text || '').trim();
        if (!speechText) {
            return res.status(400).json({ error: 'Missing speechText', items: [], unattachedAddons: [], unrecognizedText: [] });
        }
        const items = slimItems(body.menuItems || body.items);
        const modifiers = slimModifiers(body.modifiers || body.mods);
        if (!items.length) {
            return res.status(400).json({ error: 'Missing menuItems', items: [], unattachedAddons: [], unrecognizedText: [] });
        }

        const parsed = await callGemini({ speechText, items, modifiers });
        const safe = validateParsed(parsed, items, modifiers, speechText);
        return res.status(200).json({ ok: true, ...safe });
    } catch (err) {
        console.error('ai-parse-order error:', err);
        return res.status(err.status || 500).json({
            error: err.message || 'Parse failed',
            items: [],
            unattachedAddons: [],
            unrecognizedText: [],
        });
    }
};
