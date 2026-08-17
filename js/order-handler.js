// =============================================================
// Mirror Burger — 落單 / 付款處理 (Order & Payment Handler)
// =============================================================

const KPAY_SERVER_URL = '/api/kpay-checkout';
const STRIPE_SERVER_URL = '/api/checkout'; // 保留作後備

// --- 表單驗證 + 落單掣設定 (Form Validation) ---
function validateCheckout() {
    const btn = document.getElementById('checkout-btn');
    if (btn) {
        btn.style.opacity = "1";
        btn.disabled = false;

        // 🌟 已經全面轉用 KPay 正式環境
        btn.onclick = processKPayOrder;

        btn.innerHTML = '<span class="en">Place Order Now</span><span class="zh">立即落單</span>';
    }
}

// 網頁載入即時初始化
document.addEventListener('DOMContentLoaded', validateCheckout);

// 全面預設用 KPay
function processKPayOrder() { return submitOrder('kpay'); }
function processStripeOrder() { return submitOrder('stripe'); }

async function insertPendingOrder(row) {
    const res = await fetch('/api/kpay-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create',
            store_name: row.store_name,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            pickup_time: row.pickup_time,
            items: row.items_json,
            fulfill: (typeof deliveryMode !== 'undefined' && deliveryMode !== 'pickup') ? 'dine_in' : 'takeaway',
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return { orderNo: data.orderNo, total: data.total };
}

async function submitOrder(provider) {
    const store = getActiveStore();
    const name = document.getElementById('cust-name').value.trim();

    const countrySelect = document.getElementById('cust-country-code');
    const rawPhone = document.getElementById('cust-phone').value.trim();
    let phone = countrySelect.value + " " + rawPhone;
    if (countrySelect.value === 'others') {
        const customCC = document.getElementById('cust-custom-cc').value.trim();
        phone = (customCC.startsWith('+') ? customCC : '+' + customCC) + " " + rawPhone;
    }

    const time = document.getElementById('cust-time').value;

    if (cart.length === 0) { showCustomAlert(lang('Your bag is empty.', '你的購物車是空的。')); return; }
    if (!store) { showCustomAlert(lang('Please select a store.', '請先選擇取餐分店。')); return; }
    if (!name) { showCustomAlert(lang('Please enter your name.', '請輸入你的名字。')); return; }
    if (!rawPhone) { showCustomAlert(lang('Please enter your phone number.', '請輸入電話號碼。')); return; }
    if (!time || time === '' || time === 'CLOSED') { showCustomAlert(lang('Please select a pickup time.', '請選擇取餐時間。')); return; }

    const btn = document.getElementById('checkout-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="en">Preparing Order...</span><span class="zh">準備訂單中...</span>`;
    btn.disabled = true;

    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const discount = isDiscountActive() ? Math.floor(subtotal * getDiscountRate()) : 0;
    const finalTotal = subtotal - discount;

    const isKPay = provider === 'kpay';
    const endpoint = isKPay ? KPAY_SERVER_URL : STRIPE_SERVER_URL;

    try {
        const created = await insertPendingOrder({
            store_name: store,
            customer_name: name,
            customer_phone: phone,
            pickup_time: time,
            items_json: cart,
        });
        const orderNo = created.orderNo;
        const payAmount = Number.isFinite(Number(created.total)) ? Number(created.total) : finalTotal;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: payAmount, orderNo: orderNo })
        });

        const result = await response.json();
        if (result.paymentUrl) {
            window.location.href = result.paymentUrl;
        } else {
            throw new Error((isKPay ? 'KPay' : 'Stripe') + " Error: " + (result.error || "Unknown"));
        }
    } catch (err) {
        console.error(err);
        showCustomAlert("Connection Error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}