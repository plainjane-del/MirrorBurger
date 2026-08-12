const crypto = require('crypto');

function getKeyContent(envVar) {
    const val = process.env[envVar];
    if (!val) throw new Error(`Missing environment variable: ${envVar}`);
    return val;
}

// 🛡️ 原生 OpenSSL 密鑰解析器：自動清洗 Base64 並解析 PKCS#8 / PKCS#1 密鑰
function getPrivateKeyObject(rawKey) {
    if (!rawKey) throw new Error('Private key is empty.');
    let text = String(rawKey).trim();
    text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 清走所有可能殘留或不完整的標頭標尾及空格，取得純粹 Base64
    const cleanBase64 = text
        .replace(/-----BEGIN [A-Z ]+-----/g, '')
        .replace(/-----END [A-Z ]+-----/g, '')
        .replace(/\s+/g, '');

    const formattedBody = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
    const pemTypes = ['PRIVATE KEY', 'RSA PRIVATE KEY'];

    // 嘗試以 PKCS#8 及 PKCS#1 格式載入
    for (const type of pemTypes) {
        const pem = `-----BEGIN ${type}\n${formattedBody}\n-----END ${type}\n`;
        try {
            return crypto.createPrivateKey(pem);
        } catch (e) {
            // 繼續嘗試下一種格式
        }
    }

    try {
        return crypto.createPrivateKey(text);
    } catch (e) {
        throw new Error(`Failed to parse Private Key: ${e.message}`);
    }
}

function getPublicKeyObject(rawKey) {
    if (!rawKey) throw new Error('Public key is empty.');
    let text = String(rawKey).trim();
    text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const cleanBase64 = text
        .replace(/-----BEGIN [A-Z ]+-----/g, '')
        .replace(/-----END [A-Z ]+-----/g, '')
        .replace(/\s+/g, '');

    const formattedBody = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
    const pemTypes = ['PUBLIC KEY', 'RSA PUBLIC KEY'];

    for (const type of pemTypes) {
        const pem = `-----BEGIN ${type}\n${formattedBody}\n-----END ${type}\n`;
        try {
            return crypto.createPublicKey(pem);
        } catch (e) {
            // 繼續嘗試下一種格式
        }
    }

    try {
        return crypto.createPublicKey(text);
    } catch (e) {
        throw new Error(`Failed to parse Public Key: ${e.message}`);
    }
}

function signWithRsaSha256(signatureText, rawPemKey) {
    const privateKeyObject = getPrivateKeyObject(rawPemKey);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureText, 'utf8');
    sign.end();
    return sign.sign(privateKeyObject, 'base64');
}

function verifyKpaySignature(signatureB64, signatureText, rawPubKeyPem) {
    try {
        const publicKeyObject = getPublicKeyObject(rawPubKeyPem);
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(signatureText, 'utf8');
        verify.end();
        return verify.verify(publicKeyObject, signatureB64, 'base64');
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