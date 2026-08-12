const crypto = require('crypto');
const forge = require('node-forge');

// 🛡️ 萬能 PEM 重組器：自動修復單行、換行走樣或有空格嘅 PEM 密鑰
function normalizePem(rawPem) {
    if (!rawPem) return '';
    let text = String(rawPem).trim();
    text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const match = text.match(/-----BEGIN ([A-Z ]+)-----\s*([\s\S]+?)\s*-----END \1-----/);
    if (match) {
        const type = match[1];
        // 清走 Base64 亂碼入面所有空格與換行，然後每 64 個字元重新換行
        const body = match[2].replace(/\s+/g, '');
        const formattedBody = body.match(/.{1,64}/g)?.join('\n') || body;
        return `-----BEGIN ${type}\n${formattedBody}\n-----END ${type}\n`;
    }
    return text;
}

function getKeyContent(envVar) {
    const val = process.env[envVar];
    if (!val) throw new Error(`Missing environment variable: ${envVar}`);
    return val;
}

function validatePrivateKey(pem) {
    if (pem.includes('BEGIN PUBLIC KEY') || pem.includes('BEGIN CERTIFICATE')) {
        throw new Error('Invalid Private Key: Provided PEM is a public key/certificate.');
    }
}

function signWithRsaSha256(signatureText, rawPemKey) {
    const normalizedPem = normalizePem(rawPemKey);
    validatePrivateKey(normalizedPem);
    try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signatureText);
        signer.end();
        return signer.sign({ key: normalizedPem, padding: crypto.constants.RSA_PKCS1_PADDING }, 'base64');
    } catch (error) {
        try {
            const privateKey = forge.pki.privateKeyFromPem(normalizedPem);
            const md = forge.md.sha256.create();
            md.update(signatureText, 'utf8');
            return forge.util.encode64(privateKey.sign(md));
        } catch (forgeErr) {
            throw new Error(`PEM Parsing Error: ${forgeErr.message}`);
        }
    }
}

function verifyKpaySignature(signatureB64, signatureText, rawPubKeyPem) {
    const normalizedPem = normalizePem(rawPubKeyPem);
    try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signatureText);
        verifier.end();
        return verifier.verify({ key: normalizedPem, padding: crypto.constants.RSA_PKCS1_PADDING }, signatureB64, 'base64');
    } catch (error) {
        try {
            const publicKey = forge.pki.publicKeyFromPem(normalizedPem);
            const md = forge.md.sha256.create();
            md.update(signatureText, 'utf8');
            return publicKey.verify(md.digest().bytes(), forge.util.decode64(signatureB64));
        } catch (forgeErr) {
            return false;
        }
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
        throw new Error(`KPay API Error: ${kpayResponse.message || 'Unknown Error'}`);
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