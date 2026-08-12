const crypto = require('crypto');
const forge = require('node-forge');

function normalizePem(pem) {
    if (!pem) return '';
    let text = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const match = text.match(/-----BEGIN [A-Z ]+-----\n([\s\S]+?)\n-----END [A-Z ]+-----/);
    return match ? match[0] : text;
}

function getKeyContent(envVar) {
    const val = process.env[envVar];
    if (!val) throw new Error(`Missing environment variable: ${envVar}`);
    return val.replace(/\\n/g, '\n');
}

function signWithRsaSha256(signatureText, pemKey) {
    const normalizedPem = normalizePem(pemKey);
    try {
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signatureText);
        signer.end();
        return signer.sign({ key: normalizedPem, padding: crypto.constants.RSA_PKCS1_PADDING }, 'base64');
    } catch (error) {
        if (error.message.includes('DECODER routines')) {
            const privateKey = forge.pki.privateKeyFromPem(normalizedPem);
            const md = forge.md.sha256.create();
            md.update(signatureText, 'utf8');
            return forge.util.encode64(privateKey.sign(md));
        }
        throw error;
    }
}

function verifyKpaySignature(signatureB64, signatureText, pubKeyPem) {
    const normalizedPem = normalizePem(pubKeyPem);
    try {
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signatureText);
        verifier.end();
        return verifier.verify({ key: normalizedPem, padding: crypto.constants.RSA_PKCS1_PADDING }, signatureB64, 'base64');
    } catch (error) {
        const publicKey = forge.pki.publicKeyFromPem(normalizedPem);
        const md = forge.md.sha256.create();
        md.update(signatureText, 'utf8');
        return publicKey.verify(md.digest().bytes(), forge.util.decode64(signatureB64));
    }
}

async function createManagedOrder(payload) {
    const merchantCode = process.env.KPAY_MID;
    const privateKey = getKeyContent('KPAY_PRIVATE_KEY');
    const baseUrl = 'https://payment.kpay-group.com'; // 正式環境 PROD URL
    const uri = '/v1/managed/order/add';
    const timestamp = String(Date.now()); // 必須為毫秒
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
    const baseUrl = 'https://payment.kpay-group.com'; // 正式環境 PROD URL
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