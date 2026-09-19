/**
 * POST /api/upload-expense
 * Body JSON: { token, store_id, image_base64, mime_type? }
 * Flow: Storage upload → OpenAI gpt-4o (or Gemini fallback) → expenses row
 */
const crypto = require('crypto');
const { requireAdmin } = require('../../api/_adminAuth.js');
const { verifyKitchenTokenAny } = require('../../api/_kitchenAuth.js');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const AI_PROMPT = `請分析這張收據，以 JSON 格式回傳 merchant_name (商戶名稱), amount (總金額, 數字), expense_date (日期 YYYY-MM-DD)。只回傳 JSON，不要其他文字。`;

const STORE_IDS = new Set(['SYP', 'TH', 'TW']);

function sb() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        const err = new Error('Missing SUPABASE_URL or service role key');
        err.status = 500;
        throw err;
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

function requireStaff(req) {
    try {
        requireAdmin(req);
        return { role: 'admin' };
    } catch (adminErr) {
        if (adminErr.status && adminErr.status !== 401) throw adminErr;
        const body = req.body || {};
        const header = req.headers.authorization || '';
        const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
        const token = body.token || bearer || '';
        const kitchen = verifyKitchenTokenAny(token);
        if (!kitchen) {
            const err = new Error('Unauthorized');
            err.status = 401;
            throw err;
        }
        return { role: 'kitchen', auth: kitchen };
    }
}

function stripDataUrl(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^data:([^;]+);base64,(.+)$/i);
    if (m) return { mime: m[1], base64: m[2] };
    return { mime: '', base64: s.replace(/\s+/g, '') };
}

function extractJson(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (_) { /* fall through */ }
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch (_) { /* fall through */ }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch (_) { /* fall through */ }
    }
    return null;
}

function normalizeParsed(parsed) {
    const merchant_name = String(parsed?.merchant_name || parsed?.merchant || '').trim() || null;
    const amountRaw = parsed?.amount ?? parsed?.total ?? null;
    const amount = amountRaw == null || amountRaw === ''
        ? null
        : Number(String(amountRaw).replace(/[^0-9.-]/g, ''));
    let expense_date = String(parsed?.expense_date || parsed?.date || '').trim() || null;
    if (expense_date && !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
        const d = new Date(expense_date);
        expense_date = Number.isFinite(d.getTime())
            ? d.toISOString().slice(0, 10)
            : null;
    }
    return {
        merchant_name,
        amount: Number.isFinite(amount) ? amount : null,
        expense_date,
    };
}

async function analyzeWithOpenAI(base64, mime) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
    const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: AI_PROMPT },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mime};base64,${base64}`,
                            },
                        },
                    ],
                },
            ],
        }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error?.message || `OpenAI ${resp.status}`);
        err.status = 502;
        throw err;
    }
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(text);
    if (!parsed) {
        const err = new Error('OpenAI returned non-JSON');
        err.status = 502;
        throw err;
    }
    return { provider: 'openai', model, ...normalizeParsed(parsed) };
}

async function analyzeWithGemini(base64, mime) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [
                    { text: AI_PROMPT },
                    { inline_data: { mime_type: mime, data: base64 } },
                ],
            }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(data?.error?.message || `Gemini ${resp.status}`);
        err.status = 502;
        throw err;
    }
    const text = data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || '';
    const parsed = extractJson(text);
    if (!parsed) {
        const err = new Error('Gemini returned non-JSON');
        err.status = 502;
        throw err;
    }
    return { provider: 'gemini', model, ...normalizeParsed(parsed) };
}

async function uploadReceipt(base64, mime, storeId) {
    const { SUPABASE_URL, SUPABASE_KEY } = sb();
    const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg');
    const path = `${storeId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length < 32) {
        const err = new Error('Image too small');
        err.status = 400;
        throw err;
    }
    if (bytes.length > 10 * 1024 * 1024) {
        const err = new Error('Image too large (max 10MB)');
        err.status = 400;
        throw err;
    }
    const resp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/receipts/${path}`,
        {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': mime,
                'x-upsert': 'true',
            },
            body: bytes,
        }
    );
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(`Storage upload failed: ${text.slice(0, 200)}`);
        err.status = 502;
        throw err;
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/receipts/${path}`;
    return { path, receipt_url: publicUrl };
}

async function insertExpense(row) {
    const { SUPABASE_URL, SUPABASE_KEY } = sb();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/expenses`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const err = new Error(typeof data === 'string' ? data : (data.message || JSON.stringify(data)));
        err.status = 502;
        throw err;
    }
    return Array.isArray(data) ? data[0] : data;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        requireStaff(req);
        const body = req.body || {};
        const store_id = String(body.store_id || body.storeId || '').trim().toUpperCase();
        if (!STORE_IDS.has(store_id)) {
            return res.status(400).json({ error: 'store_id must be SYP, TH, or TW' });
        }

        const stripped = stripDataUrl(body.image_base64 || body.image || '');
        const mime = String(body.mime_type || body.mimeType || stripped.mime || 'image/jpeg').trim() || 'image/jpeg';
        const base64 = stripped.base64;
        if (!base64) return res.status(400).json({ error: 'Missing image_base64' });

        const uploaded = await uploadReceipt(base64, mime, store_id);

        let ai = null;
        let aiError = null;
        try {
            ai = await analyzeWithOpenAI(base64, mime);
            if (!ai) ai = await analyzeWithGemini(base64, mime);
            if (!ai) {
                const err = new Error('Missing OPENAI_API_KEY or GEMINI_API_KEY');
                err.status = 500;
                throw err;
            }
        } catch (err) {
            aiError = err.message || String(err);
            console.error('expense AI failed:', err);
        }

        const expense = await insertExpense({
            store_id,
            merchant_name: ai?.merchant_name || null,
            amount: ai?.amount ?? null,
            expense_date: ai?.expense_date || new Date().toISOString().slice(0, 10),
            receipt_url: uploaded.receipt_url,
        });

        return res.status(200).json({
            ok: true,
            expense,
            ai: ai
                ? {
                    provider: ai.provider,
                    model: ai.model,
                    merchant_name: ai.merchant_name,
                    amount: ai.amount,
                    expense_date: ai.expense_date,
                }
                : null,
            ai_error: aiError,
            receipt_url: uploaded.receipt_url,
        });
    } catch (err) {
        console.error('upload-expense error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Upload failed' });
    }
};
