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

async function createManagedOrder(payload) {
    const merchantCode = process.env.KPAY_MID;
    const privateKey = getKeyContent('KPAY_PRIVATE_KEY');
    const baseUrl = 'https://payment.kpay-group.com';
    const uri = '/v1/managed/order/add';
    const timestamp = String(Date.now());
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const bodyStr = JSON.stringify(payload);

    const signatureText = `POST\n${uri}\n${timestamp}\n${nonceStr}\n${merchantCode}\n${bodyStr}\n`;
    const signature = signWithRsaSha256(signatureText, privateKey);

    const response = await fetch(`${baseUrl}${uri}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'K-Merchant-Code': merchantCode,
            'K-Nonce-Str': nonceStr,
            'K-Timestamp': timestamp,
            'K-Signature': signature,
            'K-Language': 'zh_HK'
        },
        body: bodyStr
    });

    const kpayResponse = await response.json();
    if (String(kpayResponse.code) !== '10000') {
        throw new Error(`KPay API Error [${kpayResponse.code}]: ${kpayResponse.message || kpayResponse.msg || JSON.stringify(kpayResponse)}`);
    }
    return kpayResponse;
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

module.exports = { createManagedOrder, buildCheckoutUrl, verifyKpaySignature, getKeyContent };