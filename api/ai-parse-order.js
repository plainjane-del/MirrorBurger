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

STRICT F&B VALIDATION RULES:
- Separate MAIN ITEMS from MODIFIERS. Main items are menuItems. Modifiers are add-ons, sauces, combo snacks, and combo drinks.
- A standalone modifier MUST NOT create or imply a main item. Example: if the user only says 「要一隻煎蛋」 and no burger/main item is specified, do NOT add any burger.
- If the user says only a modifier without a target main item, return it in unattachedAddons as spoken text, e.g. {"unattachedAddons":["煎蛋"]}.
- If the spoken text does not clearly match a catalog item with high confidence, do NOT fuzzy-force it to a similar-sounding item. Example: 「大青瓜」 must NOT become any mushroom burger or other item. Put it in unrecognizedText exactly as spoken.
- Never hallucinate ids, names, sizes, drinks, snacks, sauces, buns, or combo choices.

ORDER RULES:
- Match burgers, snacks, drinks, sauces, add-ons, combo snacks and combo drinks only when clearly present in the catalog.
- Cantonese example: 「要個經典芝士牛套餐，轉番薯條，凍檸茶走青少冰」→ classic beef burger combo, combo snack sweet potato fries, combo drink iced lemon tea, notes 走青／少冰.
- 「套餐」means combo:true and you MUST pick comboSnackId + comboDrinkId from catalog.
- 「轉」on a combo snack/drink means replace the default with that item.
- 「走青」= no onions (put in notes, do not invent addon ids). 「少冰」= less ice (notes). 「生菜包」= Lettuce Wrap. Default bun is Nissin Bun for burgers.
- 「小辣／微辣」= spice is not a catalog field; put in notesZh/notesEn unless it is clearly a menu item.
- Size: M/L/3pcs/5pcs only if that item has sizes. Otherwise null.
- Quantity must be explicit: 「一份」/「一個」= 1, 「兩份」/「兩個」= 2, numeric counts follow the speech. Never default to 2. Default qty is 1 only when a valid item is clearly ordered without a quantity.
- Ignore payment, table numbers, chit-chat.

RESPONSE FORMAT:
- Return strict JSON only, no markdown, no prose.
- Use exactly this shape:
{"items":[{"menuId":"b1","qty":1,"size":"M","bun":"Nissin Bun","addonIds":[],"sauceIds":[],"combo":true,"comboSnackId":"cs5","comboDrinkId":"cd4","notesEn":"","notesZh":""}],"unattachedAddons":["煎蛋"],"unrecognizedText":["大青瓜"]}
- items must contain only high-confidence valid menu matches.
- unattachedAddons must contain spoken modifier text that lacks a target main item.
- unrecognizedText must contain spoken text that does not clearly exist in the catalog.
- If nothing valid is matched, return {"items":[],"unattachedAddons":[],"unrecognizedText":[]}.`;

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

function sanitizeTextList(value) {
    return (Array.isArray(value) ? value : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 20);
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
                    unattachedAddons: {
                        type: 'ARRAY',
                        items: { type: 'STRING' },
                    },
                    unrecognizedText: {
                        type: 'ARRAY',
                        items: { type: 'STRING' },
                    },
                },
                required: ['items', 'unattachedAddons', 'unrecognizedText'],
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
        const safe = validateParsed(parsed, items, modifiers);
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
