(function () {
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        var msg = form.getAttribute('data-confirm');
        if (msg && !window.confirm(msg)) {
            e.preventDefault();
        }
    }, true);

    document.addEventListener('change', function (e) {
        var el = e.target;
        if (el && el.matches && el.matches('[data-submit-on-change]')) {
            if (el.form) el.form.submit();
        }
    });
})();
