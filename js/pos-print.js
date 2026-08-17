/* Sunmi JS USDK → localhost printer. Fallback: browser 58mm print. */
(function (global) {
    const STORE_ZH = {
        'Sai Ying Pun': '西營盤',
        'Fortress Hill': '天后',
        'Tsuen Wan (Takeaway Only)': '荃灣',
    };
    const PAY_ZH = { cash: '現金', fps: '轉數快', payme: 'PayMe' };

    let sdk = null;
    let ready = false;
    let lastJob = null;

    function isAndroid() {
        return /android/i.test(navigator.userAgent || '');
    }
    function setStatus(label, ok) {
        const el = document.getElementById('print-status');
        if (!el) return;
        el.textContent = label;
        el.classList.toggle('is-on', !!ok);
    }
    function waitConnected(ms) {
        return new Promise((resolve) => {
            const t0 = Date.now();
            (function tick() {
                if (sdk && sdk.socketManager && sdk.socketManager.connected) return resolve(true);
                if (Date.now() - t0 > ms) return resolve(false);
                setTimeout(tick, 200);
            })();
        });
    }
    async function connectSunmi() {
        if (typeof SUNMI !== 'function') {
            setStatus('無打印 SDK', false);
            return false;
        }
        if (!sdk) sdk = new SUNMI();
        if (sdk.socketManager && sdk.socketManager.connected) {
            ready = true;
            setStatus('出單機已駁', true);
            return true;
        }
        if (!isAndroid()) {
            setStatus('瀏覽器打印', false);
            return false;
        }
        setStatus('駁緊出單機…', false);
        try {
            sdk.init();
        } catch (_) {}
        if (await waitConnected(800)) {
            ready = true;
            setStatus('出單機已駁', true);
            return true;
        }
        try {
            await sdk.launchPrinterService();
            sdk.init();
        } catch (_) {}
        ready = await waitConnected(5000);
        setStatus(ready ? '出單機已駁' : '出單機未駁', ready);
        return ready;
    }

    function ticketLines(data, items) {
        const store = STORE_ZH[data.store_name || global.currentStore] || (data.store_name || global.currentStore || '');
        const pay = PAY_ZH[data.pay_method] || data.pay_method || '';
        const when = new Date().toLocaleString('zh-HK', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const guest = data.customer_name || '';
        const lines = [];
        (items || []).forEach((it) => {
            const name = it.nameZh || it.nameEn || it.menuId || '';
            lines.push({ kind: 'item', text: `${it.qty || 1}× ${name}` });
            if (it.detailsZh) lines.push({ kind: 'detail', text: String(it.detailsZh) });
        });
        return {
            store,
            orderNo: String(data.orderNo || ''),
            fulfill: data.pickup_time || '',
            pay,
            total: data.total,
            guest,
            when,
            lines,
        };
    }

    async function printSunmi(job, openDrawer) {
        const { Align } = sdk.ENUM;
        const { BaseStyle, TextStyle } = sdk.class;
        const line = sdk.printer.lineApi;
        const center = () => TextStyle.getStyle().setAlign(Align.CENTER).setEnableBold(true);
        const left = () => TextStyle.getStyle().setAlign(Align.LEFT);
        const big = () => TextStyle.getStyle().setAlign(Align.CENTER).setEnableBold(true).setTextSize(48).setTextHeightRatio(1).setTextWidthRatio(1);

        await line.initLine(BaseStyle.getStyle().setAlign(Align.CENTER));
        await line.printText('MIRROR BURGER', center().setTextSize(28));
        if (job.store) await line.printText(job.store, center());
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        await line.printText('#' + job.orderNo, big());
        if (job.fulfill) await line.printText(job.fulfill, center().setTextSize(28));
        if (job.pay) await line.printText(job.pay, center());
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        await line.initLine(BaseStyle.getStyle().setAlign(Align.LEFT));
        for (const row of job.lines) {
            if (row.kind === 'item') {
                await line.printText(row.text, left().setEnableBold(true).setTextSize(28));
            } else {
                await line.printText('  ' + row.text, left().setTextSize(22));
            }
        }
        await line.printDividingLine(sdk.ENUM.DividingLine.DOTTED, 2);
        if (job.guest) await line.printText('客人 ' + job.guest, left());
        await line.printText('實收 $' + job.total, center().setTextSize(32).setEnableBold(true));
        await line.printText(job.when, center().setTextSize(20));
        await line.printText('多謝惠顧', center());
        await line.autoOut();

        if (openDrawer) {
            try {
                const pulse = [0x1b, 0x70, 0x00, 0x3c, 0x78].map((b) => b.toString(16).padStart(2, '0'));
                await sdk.printer.commandApi.sendEscCommand(pulse);
            } catch (_) {}
        }
    }

    function printBrowser(job) {
        const rows = job.lines.map((row) =>
            row.kind === 'item'
                ? `<div class="item">${escapeHtml(row.text)}</div>`
                : `<div class="detail">${escapeHtml(row.text)}</div>`
        ).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page { size: 58mm auto; margin: 2mm; }
body { width: 54mm; margin: 0; color: #000; font-family: "PingFang HK","Noto Sans TC",sans-serif; font-weight: 800; }
h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
.no { font-size: 28px; text-align: center; margin: 6px 0; letter-spacing: -0.04em; }
.center { text-align: center; }
.item { font-size: 14px; margin-top: 6px; }
.detail { font-size: 12px; padding-left: 8px; font-weight: 700; }
hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>
<h1>MIRROR BURGER</h1>
<div class="center">${escapeHtml(job.store)}</div>
<hr>
<div class="no">#${escapeHtml(job.orderNo)}</div>
<div class="center">${escapeHtml(job.fulfill)}</div>
<div class="center">${escapeHtml(job.pay)}</div>
<hr>
${rows}
<hr>
${job.guest ? `<div>客人 ${escapeHtml(job.guest)}</div>` : ''}
<div class="no">$${escapeHtml(job.total)}</div>
<div class="center">${escapeHtml(job.when)}</div>
</body></html>`;
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (_) {}
            setTimeout(() => iframe.remove(), 2500);
        }, 250);
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function printTicket(data, items, opts) {
        const job = ticketLines(data, items);
        lastJob = { data, items, pay: data.pay_method };
        const openDrawer = !!(opts && opts.openDrawer);
        if (!ready) await connectSunmi();
        if (ready) {
            try {
                await printSunmi(job, openDrawer);
                if (typeof global.showToast === 'function') global.showToast('已出廚房單 #' + job.orderNo);
                return true;
            } catch (err) {
                ready = false;
                setStatus('出單失敗', false);
                console.warn('Sunmi print failed:', err);
            }
        }
        if (opts && opts.forceBrowser) {
            printBrowser(job);
            return true;
        }
        if (typeof global.showToast === 'function') {
            global.showToast('單已入廚房。出單機未駁，可撳「重印」。');
        }
        return false;
    }

    async function reprint() {
        if (!lastJob) return;
        const printed = await printTicket(lastJob.data, lastJob.items, {
            openDrawer: lastJob.pay === 'cash',
            forceBrowser: true,
        });
        if (!printed) printBrowser(ticketLines(lastJob.data, lastJob.items));
    }

    global.PosPrint = {
        connect: connectSunmi,
        printTicket,
        reprint,
        isReady: () => ready,
    };
})(window);
