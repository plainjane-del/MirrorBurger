const crypto = require('crypto');

function getKeyContent(envVar) {
    const val = process.env[envVar];
    if (!val) throw new Error(`Missing environment variable: ${envVar}`);
    return val;
}

// 🛡️ Bulletproof Key Parser: Automatically handles DER binary buffers & PEM formats
function getPrivateKeyObject(rawKey) {
    if (!rawKey) throw new Error('KPAY_PRIVATE_KEY is missing or empty.');
    
    let text = String(rawKey).trim();
    text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Extract pure Base64 content
    const cleanBase64 = text
        .replace(/-----BEGIN [A-Z ]+-----/g, '')
        .replace(/-----END [A-Z ]+-----/g, '')
        .replace(/\s+/g, '');

    const keyBuffer = Buffer.from(cleanBase64, 'base64');

    // 1. Try DER PKCS#8 Binary (Primary for KPay raw Base64 keys)
    try {
        return crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8' });
    } catch (e) {}

    // 2. Try DER PKCS#1 Binary
    try {
        return crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs1' });
    } catch (e) {}

    // 3. Try Formatted PEM (PKCS#8)
    const formattedBody = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
    try {
        return crypto.createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----\n`);
    } catch (e) {}

    // 4. Try Formatted PEM (PKCS#1)
    try {
        return crypto.createPrivateKey(`-----BEGIN RSA PRIVATE KEY-----\n${formattedBody}\n-----END RSA PRIVATE KEY-----\n`);
    } catch (e) {}

    // 5. Try direct raw string
    try {
        return crypto.createPrivateKey(text);
    } catch (e) {}

    throw new Error('Failed to parse KPAY_PRIVATE_KEY in all DER/PEM formats.');
}

function getPublicKeyObject(rawKey) {
    if (!rawKey) throw new Error('KPAY_PUBLIC_KEY is missing or empty.');

    let text = String(rawKey).trim();
    text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const cleanBase64 = text
        .replace(/-----BEGIN [A-Z ]+-----/g, '')
        .replace(/-----END [A-Z ]+-----/g, '')
        .replace(/\s+/g, '');

    const keyBuffer = Buffer.from(cleanBase64, 'base64');

    // 1. Try DER SPKI (SubjectPublicKeyInfo)
    try {
        return crypto.createPublicKey({ key: keyBuffer, format: 'der', type: 'spki' });
    } catch (e) {}

    // 2. Try DER PKCS#1
    try {
        return crypto.createPublicKey({ key: keyBuffer, format: 'der', type: 'pkcs1' });
    } catch (e) {}

    // 3. Try Formatted PEM
    const formattedBody = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
    try {
        return crypto.createPublicKey(`-----BEGIN PUBLIC KEY-----\n${formattedBody}\n-----END PUBLIC KEY-----\n`);
    } catch (e) {}

    try {
        return crypto.createPublicKey(`-----BEGIN RSA PUBLIC KEY-----\n${formattedBody}\n-----END RSA PUBLIC KEY-----\n`);
    } catch (e) {}

    try {
        return crypto.createPublicKey(text);
    } catch (e) {}

    throw new Error('Failed to parse KPAY_PUBLIC_KEY in all DER/PEM formats.');
}

function signWithRsaSha256(signatureText, rawPemKey) {
    const privateKeyObject = getPrivateKeyObject(rawPemKey);
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureText, 'utf8');
    signer.end();
    return signer.sign(privateKeyObject, 'base64');
}

function verifyKpaySignature(signatureB64, signatureText, rawPubKeyPem) {
    try {
        const publicKeyObject = getPublicKeyObject(rawPubKeyPem);
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signatureText, 'utf8');
        verifier.end();
        return verifier.verify(publicKeyObject, signatureB64, 'base64');
    } catch (error) {
        console.error('KPay signature verification error:', error);
        return false;
    }
}

const KPAY_SUCCESS_STATES = new Set([
    'SUCCESS',
    'SUCCESSFUL',
    'SUCCEEDED',
    'PAID',
    'COMPLETED',
    'COMPLETE',
    'TRADE_SUCCESS',
    'TRADE_FINISHED',
    'PAY_SUCCESS',
    'PAY_SUCC',
    'PAID_SUCCESS',
    'PAY_OK',
    'PAY_FINISHED',
    'FINISH',
    'FINISHED',
    'SETTLED',
    'CAPTURED',
    '01',
    '00',
    '0000',
    '1',
    'S',
    'P',
    'PAYED',
    'PAYMENT_SUCCESS',
    'TRADE_PAY_SUCCESS',
]);

const KPAY_FAILED_STATES = new Set([
    'FAIL', 'FAILED', 'FAILURE', 'CLOSED', 'CLOSE',
    'CANCEL', 'CANCELLED', 'CANCELED', 'EXPIRED', 'EXPIRE',
    'REFUND', 'REFUNDED', 'NOTPAY',
]);

const KPAY_WAITING_STATES = new Set([
    'WAIT_PAY', 'WAIT_BUYER_PAY', 'WAITING', 'PENDING', 'INIT', 'CREATED',
    'PROCESSING', 'PAYING', 'USERPAYING', 'WAIT',
]);

const KPAY_STATE_FIELDS = [
    'transactionState',
    'transaction_state',
    'tradeState',
    'trade_state',
    'payState',
    'pay_state',
    'payStatus',
    'pay_status',
    'orderState',
    'order_state',
    'orderStatus',
    'order_status',
    'transStatus',
    'trans_status',
    'txnStatus',
    'txn_status',
    'payResult',
    'pay_result',
    'tradeStatus',
    'trade_status',
    'resultStatus',
    'result_status',
    'resultCode',
    'result_code',
    'notifyType',
    'notify_type',
    'eventType',
    'event_type',
    'bizType',
    'biz_type',
    'status',
];

function addCamelAliases(obj) {
    const extra = {};
    for (const [key, val] of Object.entries(obj || {})) {
        if (!key.includes('_')) continue;
        const camel = key.replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
        if (!(camel in obj)) extra[camel] = val;
    }
    return { ...obj, ...extra };
}

function flattenKpayPayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    let current = { ...payload };
    const nestKeys = ['data', 'bizContent', 'biz_content', 'result', 'order', 'record', 'payment'];
    for (const key of nestKeys) {
        const nested = current[key];
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            current = { ...current, ...nested };
        } else if (Array.isArray(nested) && nested[0] && typeof nested[0] === 'object') {
            current = { ...current, ...nested[0] };
        }
    }
    if (Array.isArray(current.list) && current.list[0] && typeof current.list[0] === 'object') {
        current = { ...current, ...current.list[0] };
    }
    return addCamelAliases(current);
}

function extractKpayOrderNo(payload) {
    const flat = flattenKpayPayload(payload);
    const candidates = [
        flat.managedOutTradeNo,
        flat.outTradeNo,
        flat.managed_out_trade_no,
        flat.out_trade_no,
        flat.merchantOrderNo,
        flat.merchant_order_no,
        flat.orderNo,
        flat.order_no,
    ]
        .filter((v) => v != null && String(v).trim() !== '')
        .map((v) => String(v).trim());
    const ours = candidates.find((c) => /^(MB|UAT)[A-Z0-9]+/i.test(c));
    if (ours) return ours;
    try {
        const blob = JSON.stringify(flat);
        const m = blob.match(/\b((?:MB|UAT)[A-Z0-9]{6,})\b/i);
        if (m) return m[1];
    } catch (_) { /* ignore */ }
    return candidates[0] || null;
}

function extractKpayManagedOrderNo(payload) {
    const flat = flattenKpayPayload(payload);
    const v = flat.managedOrderNo || flat.managed_order_no;
    return v != null && String(v).trim() ? String(v).trim() : null;
}

function kpayStatesOf(payload) {
    const flat = flattenKpayPayload(payload);
    const seen = new Set();
    const states = [];
    const add = (val) => {
        const s = String(val == null ? '' : val).toUpperCase().trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        states.push(s);
    };
    for (const key of KPAY_STATE_FIELDS) add(flat[key]);
    for (const [key, val] of Object.entries(flat)) {
        if (typeof val === 'object') continue;
        if (!/(state|status|result)/i.test(key)) continue;
        if (/^(code|subCode|sub_code|message|msg)$/i.test(key)) continue;
        add(val);
    }
    return states;
}

function kpayStateOf(payload) {
    return kpayStatesOf(payload)[0] || '';
}

function hasKpayPayEvidence(payload) {
    const flat = flattenKpayPayload(payload);
    const evidence = [
        flat.payTime,
        flat.pay_time,
        flat.paidTime,
        flat.paid_time,
        flat.successTime,
        flat.success_time,
        flat.gmtPayment,
        flat.gmt_payment,
        flat.transactionNo,
        flat.transaction_no,
        flat.tradeNo,
        flat.trade_no,
        flat.kpayTransNo,
        flat.kpay_trans_no,
        flat.transNo,
        flat.trans_no,
        flat.channelTransNo,
        flat.channel_trans_no,
        flat.channelTransactionNo,
        flat.payTransNo,
        flat.pay_trans_no,
    ].some((v) => v != null && String(v).trim() !== '');
    if (evidence) return true;
    const amount = Number(flat.receiptAmount || flat.paidAmount || flat.realAmount);
    return Number.isFinite(amount) && amount > 0;
}

function isKpayPaymentSuccess(payload) {
    const flat = flattenKpayPayload(payload);
    const states = kpayStatesOf(flat);
    if (states.some((s) => KPAY_SUCCESS_STATES.has(s))) return true;
    if (flat.success === true || flat.success === 'true' || String(flat.success) === '1') return true;
    if (states.some((s) => KPAY_FAILED_STATES.has(s))) return false;
    // Query `code=10000` only means the API call worked, not that money was taken.
    if (hasKpayPayEvidence(flat)) return true;
    return false;
}

function kpayWaitingOrFailedState(state) {
    const s = String(state || '').toUpperCase().trim();
    return KPAY_WAITING_STATES.has(s) || KPAY_FAILED_STATES.has(s);
}

function isKpayWaitingOrFailed(payload) {
    if (isKpayPaymentSuccess(payload)) return false;
    const states = kpayStatesOf(payload);
    if (!states.length) return false;
    return states.every((s) => kpayWaitingOrFailedState(s));
}

async function signedKpayRequest(method, uri, payload = null, { timeoutMs = 5000 } = {}) {
    const merchantCode = process.env.KPAY_MID;
    const privateKey = getKeyContent('KPAY_PRIVATE_KEY');
    const baseUrl = 'https://payment.kpay-group.com';
    const timestamp = String(Date.now());
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const bodyStr = payload == null ? '' : JSON.stringify(payload);
    const signatureText = `${method}\n${uri}\n${timestamp}\n${nonceStr}\n${merchantCode}\n${bodyStr}\n`;
    const signature = signWithRsaSha256(signatureText, privateKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${baseUrl}${uri}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'K-Merchant-Code': merchantCode,
                'K-Nonce-Str': nonceStr,
                'K-Timestamp': timestamp,
                'K-Signature': signature,
                'K-Language': 'zh_HK',
            },
            body: method === 'GET' ? undefined : bodyStr,
            signal: controller.signal,
        });
        const text = await response.text();
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
        return { ok: response.ok, status: response.status, json };
    } finally {
        clearTimeout(timer);
    }
}

async function createManagedOrder(payload) {
    const kpayResponse = (await signedKpayRequest('POST', '/v1/managed/order/add', payload, { timeoutMs: 12000 })).json;
    if (String(kpayResponse.code) !== '10000') {
        throw new Error(`KPay API Error [${kpayResponse.code}]: ${kpayResponse.message || kpayResponse.msg || JSON.stringify(kpayResponse)}`);
    }
    return kpayResponse;
}

function isKpayQueryOk(json) {
    const code = String((json && (json.code ?? json.subCode)) || '');
    return code === '10000' || code === '0' || code === '200';
}

function queryBelongsToOrder(payload, orderNo) {
    const expected = String(orderNo || '').trim().toUpperCase();
    if (!expected) return true;
    const echoed = extractKpayOrderNo(payload);
    if (!echoed) return true;
    return String(echoed).trim().toUpperCase() === expected;
}

async function queryManagedOrder(managedOutTradeNo, managedOrderNo = '') {
    const orderNo = String(managedOutTradeNo || '').trim();
    const kpayNo = String(managedOrderNo || '').trim();
    if (!orderNo && !kpayNo) return null;

    const postBodies = [];
    if (kpayNo) postBodies.push({ managedOrderNo: kpayNo });
    if (orderNo) {
        postBodies.push({ managedOutTradeNo: orderNo });
        postBodies.push({ outTradeNo: orderNo });
    }

    const attempts = [
        ...postBodies.map((body) => ['POST', '/v1/managed/order/query', body]),
        ...(orderNo ? [['POST', '/v1/managed/order/detail', { managedOutTradeNo: orderNo }]] : []),
        ...(orderNo ? [['POST', '/v1/managed/order/get', { managedOutTradeNo: orderNo }]] : []),
        ...(kpayNo ? [['POST', '/v1/managed/order/detail', { managedOrderNo: kpayNo }]] : []),
    ];

    let lastErr = '';
    let bestWaiting = null;
    const deadline = Date.now() + 9000;
    for (const [method, uri, body] of attempts) {
        if (Date.now() > deadline) break;
        try {
            const result = await signedKpayRequest(method, uri, body, { timeoutMs: 3000 });
            const json = result.json || {};
            if (!isKpayQueryOk(json)) {
                lastErr = `${method} ${uri} ${result.status} ${json.code || ''} ${json.message || json.msg || ''}`.trim();
                continue;
            }
            const flat = flattenKpayPayload(json);
            if (!queryBelongsToOrder(flat, orderNo)) {
                lastErr = `${method} ${uri} order mismatch ${extractKpayOrderNo(flat)}`;
                continue;
            }
            console.log('KPay query ok:', orderNo || kpayNo, {
                states: kpayStatesOf(flat),
                success: isKpayPaymentSuccess(flat),
                keys: Object.keys(flat || {}).slice(0, 24),
            });
            if (isKpayPaymentSuccess(flat)) return flat;
            if (!bestWaiting) bestWaiting = flat;
        } catch (err) {
            lastErr = String(err.message || err);
        }
    }
    if (bestWaiting) return bestWaiting;
    if (lastErr) console.warn('KPay query failed:', orderNo || kpayNo, lastErr);
    return null;
}

function buildCheckoutUrl(managedOrderNo, type = 'web') {
    const merchantCode = process.env.KPAY_MID;
    const privateKey = getKeyContent('KPAY_PRIVATE_KEY');
    const baseUrl = 'https://payment.kpay-group.com';
    const endpointPath = `/v1/${type}/managed/order`;

    const timestamp = String(Date.now());
    const nonceStr = crypto.randomBytes(16).toString('hex');

    const queryParams = new URLSearchParams();
    queryParams.append('managedOrderNo', managedOrderNo);
    queryParams.append('language', 'zh_HK');
    queryParams.append('K-Merchant-Code', merchantCode);
    queryParams.append('K-Nonce-Str', nonceStr);
    queryParams.append('K-Timestamp', timestamp);

    const uriWithQuery = `${endpointPath}?${queryParams.toString()}`;
    const signatureText = `GET\n${uriWithQuery}\n${timestamp}\n${nonceStr}\n${merchantCode}\n\n`;

    const signature = signWithRsaSha256(signatureText, privateKey);
    queryParams.append('K-Signature', signature);

    return `${baseUrl}${endpointPath}?${queryParams.toString()}`;
}

module.exports = {
    createManagedOrder,
    queryManagedOrder,
    buildCheckoutUrl,
    verifyKpaySignature,
    getKeyContent,
    flattenKpayPayload,
    extractKpayOrderNo,
    extractKpayManagedOrderNo,
    isKpayPaymentSuccess,
    isKpayWaitingOrFailed,
    kpayStatesOf,
    hasKpayPayEvidence,
    queryBelongsToOrder,
};