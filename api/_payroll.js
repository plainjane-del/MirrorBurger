const { KNOWN_STORES } = require('./_storeSettings.js');

function sb() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY/SERVICE_ROLE_KEY');
    }
    return { SUPABASE_URL, SUPABASE_KEY };
}

async function sbFetch(path, { method = 'GET', body, prefer = 'return=representation' } = {}) {
    const { SUPABASE_URL, SUPABASE_KEY } = sb();
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: prefer,
        },
        body: body != null ? JSON.stringify(body) : undefined,
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

function normalizeStoreName(storeName) {
    const name = String(storeName || '').trim();
    if (!KNOWN_STORES.includes(name)) {
        const err = new Error('Invalid store');
        err.status = 400;
        throw err;
    }
    return name;
}

function clipPin(raw) {
    const pin = String(raw || '').replace(/\D/g, '').slice(0, 4);
    return pin;
}

function defaultRules() {
    return {
        rounding_minutes: 1,
        rounding_mode: 'nearest',
        late_penalty: {
            enabled: false,
            grace_minutes: 0,
            deduct_minutes: 0,
            deduct_amount: 0,
        },
        meal_break_deduction: {
            enabled: false,
            minutes: 0,
            unpaid: true,
        },
        overtime: {
            enabled: false,
            after_hours: 8,
            multiplier: 1.5,
        },
        notes: '',
        source_text: '',
    };
}

function num(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function sanitizePayrollRules(raw, sourceText) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const late = src.late_penalty && typeof src.late_penalty === 'object' ? src.late_penalty : {};
    const meal = src.meal_break_deduction && typeof src.meal_break_deduction === 'object'
        ? src.meal_break_deduction
        : {};
    const ot = src.overtime && typeof src.overtime === 'object' ? src.overtime : {};
    const mode = String(src.rounding_mode || 'nearest').toLowerCase();
    const out = defaultRules();
    out.rounding_minutes = num(src.rounding_minutes, 1, 1, 60);
    out.rounding_mode = ['nearest', 'down', 'up'].includes(mode) ? mode : 'nearest';
    out.late_penalty.enabled = !!late.enabled;
    out.late_penalty.grace_minutes = num(late.grace_minutes, 0, 0, 180);
    out.late_penalty.deduct_minutes = num(late.deduct_minutes, 0, 0, 480);
    out.late_penalty.deduct_amount = num(late.deduct_amount, 0, 0, 5000);
    out.meal_break_deduction.enabled = !!meal.enabled;
    out.meal_break_deduction.minutes = num(meal.minutes, 0, 0, 180);
    out.meal_break_deduction.unpaid = meal.unpaid !== false;
    out.overtime.enabled = !!ot.enabled;
    out.overtime.after_hours = num(ot.after_hours, 8, 1, 16);
    out.overtime.multiplier = num(ot.multiplier, 1.5, 1, 3);
    out.notes = String(src.notes || '').slice(0, 240);
    out.source_text = String(sourceText || src.source_text || '').slice(0, 1000);
    return out;
}

function describeRules(rules) {
    const r = sanitizePayrollRules(rules);
    const modeZh = r.rounding_mode === 'down' ? '向下' : (r.rounding_mode === 'up' ? '向上' : '最接近');
    const lines = [
        `工時進位：每 ${r.rounding_minutes} 分鐘（${modeZh}）`,
    ];
    if (r.late_penalty.enabled) {
        lines.push(`遲到：寬限 ${r.late_penalty.grace_minutes} 分鐘，扣 ${r.late_penalty.deduct_minutes} 分鐘` +
            (r.late_penalty.deduct_amount ? `／HK$${r.late_penalty.deduct_amount}` : ''));
        lines.push('遲到扣錢要有更表先自動計；而家打卡仍按實際出糧時間計工時。');
    } else {
        lines.push('遲到：唔扣');
    }
    if (!r.meal_break_deduction.enabled || !r.meal_break_deduction.minutes) {
        lines.push('飯鐘：無飯鐘（唔扣工時）');
    } else {
        lines.push(`飯鐘：扣 ${r.meal_break_deduction.minutes} 分鐘${r.meal_break_deduction.unpaid ? '（唔出糧）' : ''}`);
    }
    if (r.overtime.enabled) {
        lines.push(`加班：超過 ${r.overtime.after_hours} 小時，倍率 ${r.overtime.multiplier}`);
    } else {
        lines.push('加班：無額外倍率');
    }
    if (r.notes) lines.push(r.notes);
    return lines;
}

function roundMinutes(rawMinutes, step, mode) {
    const minutes = Math.max(0, Number(rawMinutes) || 0);
    const size = Math.max(1, Number(step) || 1);
    if (size <= 1) return minutes;
    if (mode === 'down') return Math.floor(minutes / size) * size;
    if (mode === 'up') return Math.ceil(minutes / size) * size;
    return Math.round(minutes / size) * size;
}

function calculatePay({ clockIn, clockOut, hourlyRate, rules }) {
    const start = Date.parse(clockIn);
    const end = Date.parse(clockOut);
    const rate = Math.max(0, Number(hourlyRate) || 0);
    const safe = sanitizePayrollRules(rules);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return { raw_minutes: 0, total_hours: 0, total_pay: 0 };
    }
    const rawMinutes = (end - start) / 60000;
    let paidMinutes = roundMinutes(rawMinutes, safe.rounding_minutes, safe.rounding_mode);
    if (safe.meal_break_deduction.enabled && safe.meal_break_deduction.unpaid) {
        paidMinutes = Math.max(0, paidMinutes - safe.meal_break_deduction.minutes);
    }
    const hours = paidMinutes / 60;
    let pay = hours * rate;
    if (safe.overtime.enabled && hours > safe.overtime.after_hours) {
        const regular = safe.overtime.after_hours;
        const extra = hours - regular;
        pay = regular * rate + extra * rate * safe.overtime.multiplier;
    }
    return {
        raw_minutes: Math.round(rawMinutes * 100) / 100,
        total_hours: Math.round(hours * 100) / 100,
        total_pay: Math.round(pay * 100) / 100,
    };
}

async function getPayrollRules(storeName) {
    const store = normalizeStoreName(storeName);
    try {
        const rows = await sbFetch(
            `store_settings?store_name=eq.${encodeURIComponent(store)}&select=store_name,payroll_rules`
        );
        const row = Array.isArray(rows) ? rows[0] : rows;
        return sanitizePayrollRules(row && row.payroll_rules, row && row.payroll_rules && row.payroll_rules.source_text);
    } catch (err) {
        if (/payroll_rules/i.test(String(err.message || err.body || ''))) return defaultRules();
        throw err;
    }
}

async function savePayrollRules(storeName, rules) {
    const store = normalizeStoreName(storeName);
    const payroll_rules = sanitizePayrollRules(rules, rules && rules.source_text);
    const rows = await sbFetch(
        `store_settings?store_name=eq.${encodeURIComponent(store)}`,
        { method: 'PATCH', body: { payroll_rules, updated_at: new Date().toISOString() } }
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
        const err = new Error('Store settings row not found');
        err.status = 404;
        throw err;
    }
    return sanitizePayrollRules(row.payroll_rules, payroll_rules.source_text);
}

function publicEmployee(row) {
    if (!row) return null;
    return {
        id: row.id,
        store_name: row.store_name,
        name: row.name,
        pin_code: row.pin_code,
        hourly_rate: Number(row.hourly_rate) || 0,
    };
}

async function listEmployees(storeName) {
    const store = normalizeStoreName(storeName);
    const rows = await sbFetch(
        `employees?store_name=eq.${encodeURIComponent(store)}&select=id,store_name,name,pin_code,hourly_rate,created_at&order=name.asc`
    );
    return (Array.isArray(rows) ? rows : []).map(publicEmployee);
}

async function upsertEmployee({ id, store_name, name, pin_code, hourly_rate }) {
    const store = normalizeStoreName(store_name);
    const pin = clipPin(pin_code);
    const displayName = String(name || '').trim().slice(0, 40);
    const rate = num(hourly_rate, 0, 0, 9999);
    if (!displayName) {
        const err = new Error('Missing name');
        err.status = 400;
        throw err;
    }
    if (pin.length !== 4) {
        const err = new Error('PIN 要 4 位數字');
        err.status = 400;
        throw err;
    }
    const payload = {
        store_name: store,
        name: displayName,
        pin_code: pin,
        hourly_rate: rate,
        updated_at: new Date().toISOString(),
    };
    try {
        if (id) {
            const rows = await sbFetch(
                `employees?id=eq.${encodeURIComponent(id)}&store_name=eq.${encodeURIComponent(store)}`,
                { method: 'PATCH', body: payload }
            );
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (!row) {
                const err = new Error('Employee not found');
                err.status = 404;
                throw err;
            }
            return publicEmployee(row);
        }
        const rows = await sbFetch('employees', { method: 'POST', body: payload });
        return publicEmployee(Array.isArray(rows) ? rows[0] : rows);
    } catch (err) {
        if (/employees_store_pin_unique|duplicate|23505/i.test(String(err.message || err.body || ''))) {
            const next = new Error('呢間舖已有呢個 PIN');
            next.status = 409;
            throw next;
        }
        throw err;
    }
}

async function deleteEmployee(storeName, id) {
    const store = normalizeStoreName(storeName);
    if (!id) {
        const err = new Error('Missing id');
        err.status = 400;
        throw err;
    }
    await sbFetch(
        `employees?id=eq.${encodeURIComponent(id)}&store_name=eq.${encodeURIComponent(store)}`,
        { method: 'DELETE', prefer: 'return=minimal' }
    );
    return { ok: true };
}

async function findEmployeeByPin(storeName, pinCode) {
    const store = normalizeStoreName(storeName);
    const pin = clipPin(pinCode);
    if (pin.length !== 4) return null;
    const rows = await sbFetch(
        `employees?store_name=eq.${encodeURIComponent(store)}&pin_code=eq.${encodeURIComponent(pin)}&select=id,store_name,name,pin_code,hourly_rate&limit=1`
    );
    return publicEmployee(Array.isArray(rows) ? rows[0] : rows);
}

async function findOpenTimecard(employeeId) {
    const rows = await sbFetch(
        `timecards?employee_id=eq.${encodeURIComponent(employeeId)}&clock_out_time=is.null&select=id,store_name,employee_id,clock_in_time,clock_out_time,total_hours,total_pay&limit=1`
    );
    return Array.isArray(rows) ? rows[0] || null : rows;
}

async function clockIn(employee) {
    const rows = await sbFetch('timecards', {
        method: 'POST',
        body: {
            store_name: employee.store_name,
            employee_id: employee.id,
            clock_in_time: new Date().toISOString(),
        },
    });
    return Array.isArray(rows) ? rows[0] : rows;
}

async function clockOut(openRow, employee, rules) {
    const clock_out_time = new Date().toISOString();
    const calc = calculatePay({
        clockIn: openRow.clock_in_time,
        clockOut: clock_out_time,
        hourlyRate: employee.hourly_rate,
        rules,
    });
    const rows = await sbFetch(
        `timecards?id=eq.${encodeURIComponent(openRow.id)}`,
        {
            method: 'PATCH',
            body: {
                clock_out_time,
                total_hours: calc.total_hours,
                total_pay: calc.total_pay,
            },
        }
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { row, calc };
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
].filter(Boolean);

const PAYROLL_AI_INSTRUCTION = `You convert Hong Kong restaurant payroll policy (Cantonese or English) into JSON.

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

async function callPayrollGemini(policyText) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        const err = new Error('Server missing GEMINI_API_KEY');
        err.status = 500;
        throw err;
    }
    const body = JSON.stringify({
        system_instruction: { parts: [{ text: PAYROLL_AI_INSTRUCTION }] },
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
        label: store,
        rules,
        rules_zh: describeRules(rules),
        stores: KNOWN_STORES.map((store_name) => ({ store_name, label: store_name })),
    };
}

async function generateAndSavePayrollRules(storeName, text) {
    const store = normalizeStoreName(storeName);
    const policy = String(text || '').trim();
    if (!policy) {
        const err = new Error('請寫出糧規則');
        err.status = 400;
        throw err;
    }
    const generated = await callPayrollGemini(policy);
    const rules = sanitizePayrollRules(generated, policy);
    const saved = await savePayrollRules(store, rules);
    return rulesPayload(store, saved);
}

async function handleClockAction({ store_name, pin_code }) {
    const store = normalizeStoreName(store_name);
    const pin = clipPin(pin_code);
    if (pin.length !== 4) {
        const err = new Error('PIN 要 4 位數字');
        err.status = 400;
        throw err;
    }
    const employee = await findEmployeeByPin(store, pin);
    if (!employee) {
        const err = new Error('搵唔到呢個 PIN');
        err.status = 404;
        throw err;
    }
    const open = await findOpenTimecard(employee.id);
    if (!open) {
        const row = await clockIn(employee);
        return {
            ok: true,
            action: 'clock_in',
            employee_name: employee.name,
            store_name: store,
            clock_in_time: row && row.clock_in_time,
            message: `${employee.name} 已開工`,
        };
    }
    const rules = await getPayrollRules(store);
    const { row, calc } = await clockOut(open, employee, rules);
    return {
        ok: true,
        action: 'clock_out',
        employee_name: employee.name,
        store_name: store,
        clock_in_time: open.clock_in_time,
        clock_out_time: row && row.clock_out_time,
        total_hours: calc.total_hours,
        total_pay: calc.total_pay,
        message: `${employee.name} 收工。工時 ${calc.total_hours}，人工 HK$${calc.total_pay}`,
        _push: {
            store_name: store,
            employee_name: employee.name,
            total_hours: calc.total_hours,
            total_pay: calc.total_pay,
        },
    };
}

async function listTimecardsInRange(storeName, fromIso, toIso) {
    const store = normalizeStoreName(storeName);
    const from = String(fromIso || '').trim();
    const to = String(toIso || '').trim();
    if (!from) return [];
    let path = `timecards?store_name=eq.${encodeURIComponent(store)}`
        + `&clock_in_time=gte.${encodeURIComponent(from)}`
        + `&select=id,store_name,employee_id,clock_in_time,clock_out_time,total_hours,total_pay`
        + `&order=clock_in_time.desc&limit=2000`;
    if (to && !to.startsWith('9999')) {
        path += `&clock_in_time=lt.${encodeURIComponent(to)}`;
    }
    const rows = await sbFetch(path);
    return Array.isArray(rows) ? rows : [];
}

module.exports = {
    KNOWN_STORES,
    normalizeStoreName,
    clipPin,
    defaultRules,
    sanitizePayrollRules,
    describeRules,
    calculatePay,
    getPayrollRules,
    savePayrollRules,
    listEmployees,
    upsertEmployee,
    deleteEmployee,
    findEmployeeByPin,
    findOpenTimecard,
    clockIn,
    clockOut,
    listTimecardsInRange,
    rulesPayload,
    generateAndSavePayrollRules,
    handleClockAction,
};
