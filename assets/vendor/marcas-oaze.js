/* Marcas usadas apenas para identificar cartões e lançamentos; sem vínculo com elas.
   Silhuetas Shopee, Netflix e Vivo: Simple Icons (ver DISCLAIMER.md no projeto).
   Os demais nomes são selos tipográficos, não reproduções de logotipos. */
(function (global) {
  'use strict';
  const shopee = "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z\"/></svg>";
  const netflix = "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"m5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z\"/></svg>";
  const vivo = "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M19.604 14.101c-1.159 0-1.262-.95-1.262-1.24 0-.29.103-1.242 1.262-1.242h2.062c1.16 0 1.263.951 1.263 1.242 0 .29-.104 1.24-1.263 1.24m-2.062-3.527c-2.142 0-2.333 1.752-2.333 2.287 0 .535.19 2.286 2.333 2.286h2.062c2.143 0 2.334-1.751 2.334-2.286 0-.535-.19-2.287-2.334-2.287m-5.477.107c-.286 0-.345.05-.456.213-.11.164-2.022 3.082-2.022 3.082-.06.09-.126.126-.206.126-.08 0-.145-.036-.206-.126 0 0-1.912-2.918-2.022-3.082-.11-.164-.17-.213-.456-.213h-.668c-.154 0-.224.12-.127.267l2.283 3.467c.354.521.614.732 1.196.732s.842-.21 1.196-.732l2.284-3.467c.096-.146.026-.267-.128-.267m-8.876.284c0-.203.08-.284.283-.284h.505c.203 0 .283.08.283.283v3.9c0 .202-.08.283-.283.283h-.505c-.203 0-.283-.08-.283-.283zm-1.769-.285c-.287 0-.346.05-.456.213-.11.164-2.022 3.082-2.022 3.082-.061.09-.126.126-.206.126-.08 0-.145-.036-.206-.126 0 0-1.912-2.918-2.023-3.082-.11-.164-.169-.213-.455-.213H.175c-.171 0-.224.12-.127.267l2.283 3.467c.355.521.615.732 1.197.732.582 0 .842-.21 1.196-.732l2.283-3.467c.097-.146.044-.267-.127-.267m1.055-.893c-.165-.164-.165-.295 0-.46l.351-.351c.165-.165.296-.165.46 0l.352.351c.165.165.165.296 0 .46l-.352.352c-.164.165-.295.165-.46 0z\"/></svg>";
  function wordmark(name, size) {
    return '<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-size="' + size + '" font-weight="800" fill="currentColor">' + name + '</text></svg>';
  }
  const brands = [
    { key: 'shopee', re: /\bshopee\b/i, svg: shopee, bg: '#EE4D2D', fg: '#FFFFFF', kind: 'store' },
    { key: 'shein', re: /\bshein\b/i, svg: wordmark('SHEIN', 23), bg: '#111111', fg: '#FFFFFF', kind: 'store' },
    { key: 'netflix', re: /\bnetflix\b/i, svg: netflix, bg: '#E50914', fg: '#FFFFFF', kind: 'subscription' },
    { key: 'vivo', re: /\bvivo\b/i, svg: vivo, bg: '#660099', fg: '#FFFFFF', kind: 'subscription' },
    { key: 'claro', re: /\bclaro\b/i, svg: wordmark('claro', 26), bg: '#E32620', fg: '#FFFFFF', kind: 'subscription' },
    { key: 'disneyplus', re: /\bdisney(?:\s*plus|\s*\+)?/i, svg: wordmark('Disney+', 18), bg: '#16294C', fg: '#FFFFFF', kind: 'subscription' }
  ];
  const banks = global.BancosBR;
  if (banks) for (const item of brands.filter((entry) => entry.kind === 'store')) {
    banks.ICONES[item.key] = item.svg;
    banks.PRESETS[item.key] = { cor: item.fg, fundo: item.bg, formato: 'quadrado', tamanho: 64 };
  }
  global.MarcasOAZE = Object.freeze({
    forName(name) { return brands.find((item) => item.re.test(String(name || ''))) || null; }
  });
})(window);
