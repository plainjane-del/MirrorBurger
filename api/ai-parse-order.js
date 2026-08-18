const { requireKitchen } = require('./_kitchenAuth.js');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-1.5-flash',
].filter(Boolean);

const SYSTEM_INSTRUCTION = `You are an expert Cantonese restaurant cashier for Mirror Burger (Hong Kong).
Convert spoken Cantonese (and mixed English) into structured POS order lines using ONLY the provided catalog.

Rules:
- Match burgers, snacks, drinks, sauces, add-ons, combo snacks and combo drinks to catalog ids.
- Cantonese examples: 「要個經典芝士牛套餐，轉番薯條，凍檸茶走青少冰」→ classic beef burger (b1) combo, combo snack sweet potato fries (cs5), combo drink iced lemon tea (cd4), notes 走青／少冰.
- 「套餐」means combo:true and you MUST pick comboSnackId + comboDrinkId from catalog.
- 「轉」on a combo snack/drink means replace the default with that item.
- 「走青」= no onions (put in notes, do not invent addon ids). 「少冰」= less ice (notes). 「生菜包」= Lettuce Wrap. Default bun is Nissin Bun for burgers.
- 「小辣／微辣」= spice is not a catalog field; put in notesZh/notesEn unless it is clearly a menu item.
- Size: M/L/3pcs/5pcs only if that item has sizes. Otherwise null.
- qty from 一個／兩份／3個 etc. Default 1. Max 20.
- Ignore payment, table numbers, chit-chat.
- If nothing edible can be matched, return {"items":[]}.
- Never invent ids. Never include markdown.`;

function slimItems(items) {
    return (Array.isArray(items) ? items : []).slice(0, 80).map((item) => ({
        id: item.id,
        category: item.category || '',
        name_zh: item.name_zh || item.nameZh || '',
        name_en: item.name_en || item.nameEn || '',
        price: Number(item.price) || 0,
        sizes: Array.isArray(item.sizes) ? item.sizes : null,
        dietary: Array.isArray(item.dietary) ? item.dietary : [],
        has_temp: !!(item.has_temp || item.hasTemp),
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
        price: Number(m.price) || 0,
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

function validateParsed(parsed, items, modifiers) {
    const itemById = new Map(items.map((i) => [String(i.id), i]));
    const modById = new Map(modifiers.map((m) => [String(m.id), m]));
    const burgerCats = new Set(['beef', 'others', 'veggie']);
    const out = [];
    const list = parsed && Array.isArray(parsed.items) ? parsed.items : [];
    for (const row of list.slice(0, 20)) {
        if (!row || typeof row !== 'object') continue;
        const menuId = String(row.menuId || row.menu_id || '').trim();
        const item = itemById.get(menuId);
        if (!item) continue;
        const qty = Math.max(1, Math.min(20, Math.round(Number(row.qty) || 1)));
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
    return out;
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
                text: `Catalog and spoken order as JSON. Return only {"items":[...]}.\n${JSON.stringify(userPayload)}`,
            }],
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            response_mime_type: 'application/json',
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    items: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                menuId: { type: 'STRING' },
                                qty: { type: 'INTEGER' },
                                size: { type: 'STRING', nullable: true },
                                bun: { type: 'STRING', nullable: true },
                                addonIds: { type: 'ARRAY', items: { type: 'STRING' } },
                                sauceIds: { type: 'ARRAY', items: { type: 'STRING' } },
                                combo: { type: 'BOOLEAN' },
                                comboSnackId: { type: 'STRING', nullable: true },
                                comboDrinkId: { type: 'STRING', nullable: true },
                                notesEn: { type: 'STRING' },
                                notesZh: { type: 'STRING' },
                            },
                            required: ['menuId', 'qty', 'combo'],
                        },
                    },
                },
                required: ['items'],
            },
        },
    });

    let lastErr = null;
    const tried = new Set();
    for (const model of GEMINI_MODELS) {
        if (tried.has(model)) continue;
        tried.add(model);
        const resp = await fetch(
            `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const msg = (data && data.error && data.error.message) || `Gemini HTTP ${resp.status}`;
            lastErr = new Error(msg);
            lastErr.status = 502;
            if (resp.status === 404 || /no longer available|not found|not supported/i.test(msg)) {
                continue;
            }
            throw lastErr;
        }
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
            && data.candidates[0].content.parts;
        const raw = Array.isArray(parts) ? parts.map((p) => p.text || '').join('\n') : '';
        return extractJson(raw) || { items: [] };
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
            return res.status(400).json({ error: 'Missing speechText', items: [] });
        }
        const items = slimItems(body.menuItems || body.items);
        const modifiers = slimModifiers(body.modifiers || body.mods);
        if (!items.length) {
            return res.status(400).json({ error: 'Missing menuItems', items: [] });
        }

        const parsed = await callGemini({ speechText, items, modifiers });
        const safeItems = validateParsed(parsed, items, modifiers);
        return res.status(200).json({ ok: true, items: safeItems });
    } catch (err) {
        console.error('ai-parse-order error:', err);
        return res.status(err.status || 500).json({
            error: err.message || 'Parse failed',
            items: [],
        });
    }
};
