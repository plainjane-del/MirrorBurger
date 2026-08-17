(function () {
    const params = new URLSearchParams(location.search);
    const navLang = (navigator.language || '').toLowerCase();
    let current = params.get('lang')
        ? (params.get('lang').toLowerCase().startsWith('zh') ? 'zh' : 'en')
        : (navLang.includes('zh') ? 'zh' : 'en');

    function apply() {
        document.body.classList.toggle('lang-en', current === 'en');
        document.body.classList.toggle('lang-zh', current === 'zh');
        document.querySelectorAll('.js-lang-btn').forEach((btn) => {
            btn.textContent = current === 'en' ? '中文' : 'ENG';
        });
    }

    window.toggleLang = function () {
        current = current === 'en' ? 'zh' : 'en';
        apply();
    };

    apply();
})();
