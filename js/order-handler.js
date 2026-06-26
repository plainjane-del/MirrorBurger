// =============================================================
//  Mirror Burger — 落單 / 付款處理 (Order & Payment Handler)
//  由 index.html 抽出嚟，等主檔乾淨、一目了然。
//
//  付款智能分流 (Smart Routing)：
//    • ?test=1            → KPay 測試模式，打去 DigitalOcean 伺服器
//    • 正常客人 (冇 test)  → 正式 Stripe，打去本地 Vercel 同源相對路徑 /api/checkout
//
//  依賴 index.html 主腳本提供嘅全域變數 / 函式：
//    cart, getActiveStore, isDiscountActive, getDiscountRate,
//    supabaseClient, lang, showCustomAlert
// =============================================================

// KPay 測試模式：精準指向 DigitalOcean 伺服器（固定 IP，已過 KPay 白名單）
const KPAY_SERVER_URL = 'https://api.mirrorburger.com/api/checkout';
// Stripe 正式收錢：本地 Vercel 同源相對路徑，唔經 DigitalOcean、唔需要 provider 欄位
const STRIPE_SERVER_URL = '/api/checkout';

// --- 表單驗證 + 落單掣設定 (Form Validation) ---
function validateCheckout() {
    // 🔍 智能分流：?test=1 → KPay 測試 (DigitalOcean)；否則 → 正式 Stripe (本地 /api/checkout)
    const isTestMode = window.location.search.includes('test=1');

    const btn = document.getElementById('checkout-btn');
    if (btn) {
        btn.style.opacity = "1";
        // 🚨 落單掣永遠可以點擊：唔再因為某個欄位未填好而鎖死。
        // 缺漏嘅資料會喺撳掣嗰陣即時提示，確保粒掣一定有反應。
        btn.disabled = false;

        // 🔀 KPay / Stripe 分流
        btn.onclick = isTestMode ? processKPayOrder : processStripeOrder;

        if (isTestMode) {
            btn.innerHTML = '<span class="en">Place Order (KPay Test)</span><span class="zh">立即落單 (KPay 測試)</span>';
        } else {
            btn.innerHTML = '<span class="en">Place Order Now</span><span class="zh">立即落單</span>';
        }
    }
}

// ?test=1 → KPay 測試模式 (DigitalOcean)
function processKPayOrder() { return submitOrder('kpay'); }
// 冇 ?test=1 → 正式 Stripe (本地 Vercel /api/checkout)
function processStripeOrder() { return submitOrder('stripe'); }

async function submitOrder(provider) {
    // 🚨 用返 getActiveStore()：經「立即點餐」流程揀分店時，cust-store 個揀單係收埋兼空白，
    // 真正揀咗嘅分店其實存喺 flowSelectedStore。直接讀 cust-store.value 就會誤判「未揀舖」。
    const store = getActiveStore();
    const name = document.getElementById('cust-name').value.trim();

    // 🌍 智能解析國碼：揀「其他」就用客手打嘅內容；港陸就自動拼接。
    const countrySelect = document.getElementById('cust-country-code');
    const rawPhone = document.getElementById('cust-phone').value.trim();
    let phone = countrySelect.value + " " + rawPhone;
    if (countrySelect.value === 'others') {
        const customCC = document.getElementById('cust-custom-cc').value.trim();
        phone = (customCC.startsWith('+') ? customCC : '+' + customCC) + " " + rawPhone;
    }

    const time = document.getElementById('cust-time').value;

    // 🚨 撳掣即時檢查（姓名 / 電話 / 分店 / 時間 驗證）：缺漏邊樣就提示邊樣。
    if (cart.length === 0) { showCustomAlert(lang('Your bag is empty.', '你的購物車是空的。')); return; }
    if (!store) { showCustomAlert(lang('Please select a store.', '請先選擇取餐分店。')); return; }
    if (!name) { showCustomAlert(lang('Please enter your name.', '請輸入你的名字。')); return; }
    if (!rawPhone) { showCustomAlert(lang('Please enter your phone number.', '請輸入電話號碼。')); return; }
    if (!time || time === '' || time === 'CLOSED') { showCustomAlert(lang('Please select a pickup time.', '請選擇取餐時間。')); return; }

    const btn = document.getElementById('checkout-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="en">Preparing Order...</span><span class="zh">準備訂單中...</span>`;
    btn.disabled = true;

    const orderNo = "UAT" + Date.now().toString().slice(-6);
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const discount = isDiscountActive() ? Math.floor(subtotal * getDiscountRate()) : 0;
    const finalTotal = subtotal - discount;

    // 🔀 KPay(測試) → DigitalOcean；Stripe(正式) → 本地 /api/checkout
    const isKPay = provider === 'kpay';
    const endpoint = isKPay ? KPAY_SERVER_URL : STRIPE_SERVER_URL;

    try {
        // 💡 先喺 Supabase 留底，狀態 PENDING
        await supabaseClient.from('orders').insert([{
            order_no: orderNo,
            store_name: store,
            customer_name: name,
            customer_phone: phone,
            pickup_time: time,
            items_json: cart,
            total_amount: finalTotal,
            payment_status: 'PENDING'
        }]);

        // 去付款伺服器攞支付 Link
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: finalTotal, orderNo: orderNo })
        });

        const result = await response.json();
        if (result.paymentUrl) {
            window.location.href = result.paymentUrl;
        } else {
            throw new Error((isKPay ? 'KPay' : 'Stripe') + " Error");
        }
    } catch (err) {
        console.error(err);
        showCustomAlert("Connection Error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
