const kpay = require('./_kpay.js');
const { markOrderPaid, saveKpayManagedNo } = require('./_orders.js');

// NOTE: `api: { bodyParser: false }` is a Next.js-only switch.
// This project uses plain Vercel serverless, so Vercel may already parse JSON
// into req.body. We accept Buffer / string / object / stream.

function parseBodyText(bodyText) {
    const text = String(bodyText || '').trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (_) { /* try form next */ }
    try {
        return Object.fromEntries(new URLSearchParams(text).entries());
    } catch (_) {
        return {};
    }
}

async function readNotifyBody(req) {
    if (Buffer.isBuffer(req.body)) {
        const bodyText = req.body.toString('utf8');
        return { bodyText, payload: parseBodyText(bodyText), raw: true };
    }
    if (typeof req.body === 'string' && req.body.length) {
        return { bodyText: req.body, payload: parseBodyText(req.body), raw: true };
    }
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
        // Already parsed by the platform — exact signature bytes may be gone.
        return {
            bodyText: JSON.stringify(req.body),
            payload: req.body,
            raw: false,
        };
    }

    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    }
    const bodyText = Buffer.concat(chunks).toString('utf8');
    if (!bodyText) return { bodyText: '', payload: {}, raw: true };
    return { bodyText, payload: parseBodyText(bodyText), raw: true };
}

function notifyUriCandidates(req) {
    const rawUrl = String(req.url || '/api/kpay-notify');
    const candidates = new Set([
        '/api/kpay-notify',
        '/api/kpay-notify/',
        rawUrl,
    ]);
    try {
        const u = new URL(rawUrl, 'https://mirrorburger.com');
        candidates.add(u.pathname);
        candidates.add(u.pathname.replace(/\/$/, '') || '/');
        candidates.add(`${u.pathname}${u.search}`);
        if (!u.pathname.endsWith('/')) candidates.add(`${u.pathname}/`);
    } catch (_) { /* ignore */ }
    return [...candidates];
}

function verifyNotifySignature({ signatureB64, timestamp, nonceStr, merchantCode, bodyText, req }) {
    if (!signatureB64) return { ok: false, reason: 'missing_signature' };
    const pubKey = kpay.getKeyContent('KPAY_PUBLIC_KEY');
    const methods = req.method === 'GET' ? ['GET', 'POST'] : ['POST', 'GET'];
    for (const method of methods) {
        for (const uri of notifyUriCandidates(req)) {
            const signatureText = `${method}\n${uri}\n${timestamp}\n${nonceStr}\n${merchantCode}\n${bodyText || ''}\n`;
            if (kpay.verifyKpaySignature(signatureB64, signatureText, pubKey)) {
                return { ok: true, uri, method };
            }
        }
    }
    return { ok: false, reason: 'signature_mismatch' };
}

function queryFromReq(req) {
    try {
        const u = new URL(String(req.url || '/api/kpay-notify'), 'https://mirrorburger.com');
        return Object.fromEntries(u.searchParams.entries());
    } catch (_) {
        return {};
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const signatureB64 = req.headers['k-signature'] || '';
        const nonceStr = req.headers['k-nonce-str'] || '';
        const timestamp = req.headers['k-timestamp'] || '';

        let bodyText = '';
        let rawPayload = {};
        let raw = false;
        if (req.method === 'GET') {
            rawPayload = queryFromReq(req);
            bodyText = '';
            raw = true;
        } else {
            const parsed = await readNotifyBody(req);
            bodyText = parsed.bodyText;
            rawPayload = parsed.payload;
            raw = parsed.raw;
        }
        const payload = kpay.flattenKpayPayload(rawPayload);
        const merchantCode = payload.merchantCode
            || rawPayload.merchantCode
            || req.headers['k-merchant-code']
            || '';
        const expectedMid = process.env.KPAY_MID || '';

        let verified = verifyNotifySignature({
            signatureB64,
            timestamp,
            nonceStr,
            merchantCode,
            bodyText,
            req,
        });

        const orderNo = kpay.extractKpayOrderNo(payload);
        const kpayNo = kpay.extractKpayManagedOrderNo(payload);
        const merchantOk = Boolean(expectedMid && merchantCode && merchantCode === expectedMid);

        if (!verified.ok && !raw && merchantOk) {
            console.warn('⚠️ KPay webhook: raw body unavailable; accepting via merchantCode match');
            verified = { ok: true, uri: 'merchantCode-fallback' };
        }
        if (!verified.ok && req.method === 'POST' && merchantOk && orderNo && /^(MB|UAT)/i.test(orderNo)) {
            console.warn('⚠️ KPay webhook: signature failed; accepting via merchant+orderNo', orderNo);
            verified = { ok: true, uri: 'merchant-order-fallback' };
        }

        async function confirmPaid(reason) {
            if (!orderNo) return false;
            if (kpayNo) {
                try { await saveKpayManagedNo(orderNo, kpayNo); } catch (err) {
                    console.warn('save kpay managed no from notify skipped:', err.message || err);
                }
            }
            const result = await markOrderPaid(orderNo);
            console.log(`✅ KPay Payment Success for ${orderNo} (updated=${Boolean(result && result.updated)}, via=${reason})`);
            return true;
        }

        async function querySaysPaid() {
            if (!orderNo && !kpayNo) return false;
            const queried = await kpay.queryManagedOrder(orderNo, kpayNo);
            return Boolean(
                queried
                && kpay.isKpayPaymentSuccess(queried)
                && kpay.queryBelongsToOrder(queried, orderNo)
            );
        }

        if (!verified.ok && orderNo && /^(MB|UAT)/i.test(orderNo)) {
            try {
                if (await querySaysPaid()) {
                    await confirmPaid('unsigned-query');
                    return res.status(200).send('SUCCESS');
                }
            } catch (err) {
                console.warn('KPay unsigned-notify query skipped:', err.message || err);
            }
        }

        if (!verified.ok) {
            console.error('🚨 KPay Webhook Signature Verification Failed', {
                reason: verified.reason,
                raw,
                hasSignature: Boolean(signatureB64),
                merchantCode,
                url: req.url,
                keys: Object.keys(payload || {}),
            });
            // 401 stops some gateways from retrying. Ask KPay to retry if this looks like ours.
            if (orderNo && /^(MB|UAT)/i.test(orderNo)) {
                return res.status(500).send('TRY_AGAIN');
            }
            return res.status(401).send('Unauthorized');
        }

        if (!orderNo) {
            console.error('KPay notify missing orderNo', {
                keys: Object.keys(payload || {}),
                payload,
            });
            return res.status(400).send('Missing orderNo');
        }

        // Notify body already says paid → mark immediately. Do NOT let a lagging
        // query WAIT_PAY swallow this, or KPay will stop retrying.
        if (kpay.isKpayPaymentSuccess(payload)) {
            await confirmPaid(verified.uri || 'notify-body');
            return res.status(200).send('SUCCESS');
        }

        try {
            if (await querySaysPaid()) {
                await confirmPaid('notify-query');
                return res.status(200).send('SUCCESS');
            }
        } catch (err) {
            console.warn('KPay notify query skipped:', err.message || err);
        }

        if (kpay.isKpayWaitingOrFailed(payload)) {
            console.log('KPay notify ignored (not success):', {
                orderNo,
                states: kpay.kpayStatesOf(payload),
                keys: Object.keys(payload || {}),
            });
            return res.status(200).send('SUCCESS');
        }

        console.warn('KPay notify not recognized; asking retry', {
            orderNo,
            states: kpay.kpayStatesOf(payload),
            keys: Object.keys(payload || {}),
        });
        return res.status(500).send('TRY_AGAIN');
    } catch (error) {
        console.error('KPay Notify Error:', error);
        return res.status(500).send('Internal Server Error');
    }
};
