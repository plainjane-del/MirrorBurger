const { requireAdmin } = require('./_adminAuth.js');
const { STORE_LABEL_ZH } = require('./_tableSettings.js');
const {
    KNOWN_STORES,
    sanitizePayrollRules,
    describeRules,
    getPayrollRules,
    savePayrollRules,
    listEmployees,
    upsertEmployee,
    deleteEmployee,
} = require('./_payroll.js');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
].filter(Boolean);

const SYSTEM_INSTRUCTION = `You convert Hong Kong restaurant payroll policy (Cantonese or English) into JSON.

Return ONLY this JSON shape:
{
  "rounding_minutes": 15,
  "rounding_mode": "nearest",
  "late_penalty": { "enabled": true, "grace_minutes": 15, "deduct_minutes": 15, "deduct_amount": 0 },
  "meal_break_deduction": { "enabled": false, "minutes": 0, "unpaid": true },
  "overtime": { "enabled": false, "after_hours": 8, "multiplier": 1.5 },
  "notes": "one-line Chinese summary"
}

Rules:
- rounding_mode must be nearest, down, or up.
- 無飯鐘 / 冇飯鐘 = meal_break_deduction.enabled false, minutes 0.
- 有飯鐘 / 扣飯鐘 / 扣一小時 = meal_break_deduction.enabled true, minutes 60 unless another duration is said.
- 遲到15分鐘扣錢 = late_penalty.enabled true, grace_minutes 15, deduct_minutes 15.
- If the owner does not mention overtime, overtime.enabled false.
- Do not invent extra keys.`;

function extractJson(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_) {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try { return JSON.parse(fenced[1].trim()); } catch (_) {}
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
    }
    return null;
}

async function callGemini(policyText) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        const err = new Error('Server missing GEMINI_API_KEY');
        err.status = 500;
        throw err;
    }
    const body = JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{
            role: 'user',
            parts: [{ text: `Payroll policy:\n${policyText}` }],
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 400,
            responseMimeType: 'application/json',
        },
    });

    let lastErr = null;
    const tried = new Set();
    for (const model of GEMINI_MODELS) {
        if (tried.has(model)) continue;
        tried.add(model);
        if (tried.size > 2) break;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
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
            if (resp.status === 404 || /no longer available|not found|quota|rate limit|429|503|high demand/i.test(msg)) {
                continue;
            }
            throw lastErr;
        }
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
            && data.candidates[0].content.parts;
        const raw = Array.isArray(parts) ? parts.map((p) => p.text || '').join('\n') : '';
        const parsed = extractJson(raw);
        if (!parsed) {
            lastErr = new Error('AI 冇產出規則');
            lastErr.status = 502;
            continue;
        }
        return parsed;
    }
    throw lastErr || new Error('Gemini model unavailable');
}

function rulesPayload(store, rules) {
    return {
        ok: true,
        store_name: store,
        label: STORE_LABEL_ZH[store] || store,
        rules,
        rules_zh: describeRules(rules),
        stores: KNOWN_STORES.map((store_name) => ({
            store_name,
            label: STORE_LABEL_ZH[store_name] || store_name,
        })),
    };
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireAdmin(req);
        const body = req.body || {};
        const action = body.action || 'generate';
        const store_name = String(body.store_name || body.store_id || '').trim();
        if (!store_name) return res.status(400).json({ error: 'Missing store' });

        if (action === 'get') {
            const rules = await getPayrollRules(store_name);
            return res.status(200).json(rulesPayload(store_name, rules));
        }

        if (action === 'list_employees') {
            const employees = await listEmployees(store_name);
            return res.status(200).json({ ok: true, store_name, employees });
        }

        if (action === 'upsert_employee') {
            const employee = await upsertEmployee({
                id: body.id,
                store_name,
                name: body.name,
                pin_code: body.pin_code,
                hourly_rate: body.hourly_rate,
            });
            return res.status(200).json({ ok: true, employee });
        }

        if (action === 'delete_employee') {
            await deleteEmployee(store_name, body.id);
            return res.status(200).json({ ok: true });
        }

        const text = String(body.text || body.policy || '').trim();
        if (!text) return res.status(400).json({ error: '請寫出糧規則' });
        const generated = await callGemini(text);
        const rules = sanitizePayrollRules(generated, text);
        const saved = await savePayrollRules(store_name, rules);
        return res.status(200).json(rulesPayload(store_name, saved));
    } catch (err) {
        console.error('generate-payroll-rules error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed' });
    }
};
