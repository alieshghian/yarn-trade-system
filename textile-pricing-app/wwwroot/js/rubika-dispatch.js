window.initializeRubikaDispatch = () => {
    const root = document.querySelector('[data-rubika-dispatch]');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = 'true';
    const dialog = document.querySelector('[data-rubika-dialog]');
    const prepare = root.querySelector('[data-rubika-prepare]');
    const confirm = dialog.querySelector('[data-rubika-confirm]');
    const status = root.querySelector('[data-rubika-status]');
    let id = null, busy = false;
    const endpoint = handler => { const url = new URL(location.href); url.searchParams.set('handler', handler); return url; };
    async function request(handler, body) {
        const response = await fetch(endpoint(handler), body ? {
            method: 'POST', headers: {'X-Requested-With': 'XMLHttpRequest', 'RequestVerificationToken': document.querySelector('[data-assignment-token] input').value},
            body: new URLSearchParams(body)
        } : {headers: {'X-Requested-With': 'XMLHttpRequest'}});
        if (response.redirected) throw new Error('نشست یا مجوز برنامه معتبر نیست؛ صفحه را تازه کنید.');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'درخواست انجام نشد.');
        return result;
    }
    const labels = {sent:'ارسال موفق',failed:'ناموفق',unknown:'نامشخص؛ بررسی در روبیکا',stopped:'متوقف',queued:'در صف',sending:'در حال ارسال'};
    async function refresh() {
        if (!root.isConnected) return;
        try {
            const result = await request('DispatchStatus');
            root.querySelector('[data-rubika-last]').textContent = result.lastSent;
            const run = result.status;
            const active = run && ['queued','running'].includes(run.status);
            if (prepare) prepare.disabled = busy || active;
            if (run) {
                status.textContent = `پیام‌ها: ${run.sent} موفق، ${run.failed} ناموفق/متوقف، ${run.remaining} باقی‌مانده`;
                const results = root.querySelector('[data-rubika-results]');
                results.replaceChildren();
                run.items.forEach(item => {
                    const p = document.createElement('p');
                    p.textContent = `${item.name} (${item.phone}): ${labels[item.status] || item.status}${item.error ? ' — ' + item.error : ''}`;
                    results.append(p);
                });
            }
            if (active) setTimeout(refresh, 3000);
        } catch (error) { status.textContent = error.message + ' برای دیدن نتیجه صفحه را تازه کنید.'; }
    }
    prepare?.addEventListener('click', async () => {
        if (document.querySelector('[data-assignment-actions]:not([hidden])')) {
            status.textContent = 'ابتدا ویرایش ارتباط‌ها را ذخیره یا لغو کنید.'; return;
        }
        busy = true; prepare.disabled = true; status.textContent = 'در حال آماده‌سازی پیش‌نمایش…';
        try {
            const result = await request('PrepareSend', {});
            id = result.id;
            dialog.querySelector('[data-rubika-summary]').textContent = `${result.customers} مشتری، ${result.messages.length} فایل PDF از ربات روبیکا با ستون‌های ردیف، کد کالا، کالا و قیمت. مشتریان بدون اتصال تأییدشده به ربات که ارسال نمی‌شوند: ${result.skipped.join('، ') || 'ندارد'}`;
            const preview = dialog.querySelector('[data-rubika-preview]'); preview.replaceChildren();
            result.messages.forEach(item => {
                const details = document.createElement('details'), title = document.createElement('summary'), text = document.createElement('pre');
                title.textContent = `${item.name} — چت ربات: ${item.chatId}`;
                text.textContent = item.text; text.style.whiteSpace = 'pre-wrap';
                const link = document.createElement('a');
                link.textContent = 'دریافت پیش‌نمایش PDF'; link.href = item.pdfUrl; link.target = '_blank'; link.rel = 'noopener';
                details.append(title, text, link); preview.append(details);
            });
            status.textContent = ''; confirm.disabled = false; dialog.showModal();
        } catch (error) { status.textContent = error.message; }
        finally { busy = false; prepare.disabled = false; }
    });
    dialog.querySelector('[data-rubika-dismiss]').addEventListener('click', () => { id = null; dialog.close(); });
    confirm.addEventListener('click', async () => {
        if (!id || busy) return;
        busy = true; confirm.disabled = true;
        try {
            await request('ConfirmSend', {id, confirmed: 'true'});
            id = null; dialog.close(); status.textContent = 'ارسال در صف قرار گرفت.';
        } catch (error) { dialog.close(); status.textContent = error.message + ' پیش از تلاش دوباره نتیجه را بررسی کنید.'; }
        finally { busy = false; await refresh(); }
    });
    refresh();
};
window.initializeRubikaDispatch();
