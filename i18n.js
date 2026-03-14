// ========== TipsTap i18n ==========
const LANG = localStorage.getItem('tipstap-lang') || 'en';
document.documentElement.setAttribute('lang', LANG);

function t(en, fr) {
  return LANG === 'fr' ? fr : en;
}

function toggleLang() {
  localStorage.setItem('tipstap-lang', LANG === 'en' ? 'fr' : 'en');
  location.reload();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const fr = el.getAttribute('data-i18n');
    if (LANG === 'fr' && fr) {
      if (el.placeholder !== undefined && el.getAttribute('data-i18n-attr') === 'placeholder') {
        el.placeholder = fr;
      } else {
        el.textContent = fr;
      }
    }
  });
}
