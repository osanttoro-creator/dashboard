(function (global) {
  'use strict';
  const actions = document.querySelector('.v3-top-actions');
  if (actions && !actions.querySelector('.v3-pro-shortcut')) {
    actions.insertAdjacentHTML('afterbegin', '<button class="v3-pro-shortcut" type="button" data-go="plan" aria-label="Conhecer o OAZE Pro">Seja Pro</button>');
  }
  document.addEventListener('change', (event) => {
    const select = event.target.closest?.('[data-oaze-language]');
    if (!select) return;
    if (!['pt', 'en', 'fr', 'es'].includes(select.value)) return;
    global.I18n?.escolher(select.value);
  });
})(window);
