/* HOMI boot script (WP-21; TMA-003, SCR-001). Hand-written ES5: it must parse on engines below the Next.js floor
   (Chrome 111, Safari 16.4). The root layout inlines it from boot/inline.generated.ts (boot/build.mjs); no bundler
   touches it. It sets the theme and the lite class before paint, tests the engine, and until BootGuard sets
   __homiBoot.ok it watches for a failed app script or an early crash, which show «Обновите Telegram». */
(function () {
  var w = window;
  var d = document;
  var html = d.documentElement;
  var tag = d.getElementById('homi-boot');
  var bot = (tag && tag.getAttribute('data-bot')) || '';
  if (!/^[A-Za-z0-9_]{4,32}$/.test(bot)) {
    bot = '';
  }
  /* devFlags.dev020OneLanguageDetector of lib/flags.ts; tests/boot/boot.test.ts keeps them equal. */
  var ONE_DETECTOR = false;
  /* GRAPHICS_RULES of lib/graphics.ts, compared by the same test. */
  var RULES = { cores: 4, memory: 3, missing: 8 };
  /* TELEGRAM_SDK_URL of lib/telegram/sdk.ts. */
  var SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
  var LOCALES = ['ru', 'uz', 'en'];
  /* Copied from the pinned legacy release (index-DY_DH7h-.js): title, paragraph, first and second button. */
  var TEXTS = {
    ru: ['Обновите Telegram', 'Приложение не запустилось: Telegram или встроенный браузер (Android System WebView) устарели. Обновите их в Google Play или App Store и откройте приложение снова. Объявления можно смотреть и в боте.', 'Вернуться в бота', 'Попробовать ещё раз'],
    uz: ['Telegramni yangilang', 'Ilova ishga tushmadi: Telegram yoki ichki brauzer (Android System WebView) eskirgan. Ularni Google Play yoki App Storeʼdan yangilab, ilovani qayta oching. Eʼlonlarni botda ham koʻrish mumkin.', 'Botga qaytish', 'Qayta urinish'],
    en: ['Update Telegram', 'The app couldn’t start: Telegram or its built-in browser (Android System WebView) is out of date. Update them in Google Play or the App Store and open the app again. You can also browse listings in the bot.', 'Back to the bot', 'Try again']
  };
  var state = 0;
  /* The texts of the screen, picked when show() decides: the app may switch the locale segment of the address
     (LocaleGuard) before DOMContentLoaded renders the screen. */
  var words = null;
  var boot = { ok: false, watching: false, sdk: null, show: show, errors: [] };
  w.__homiBoot = boot;

  function stored(key) {
    try {
      return w.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function sdk() {
    return (w.Telegram && w.Telegram.WebApp) || null;
  }

  function fragment(name) {
    var match = new RegExp('[#&]' + name + '=([^&]*)').exec(w.location.hash || '');
    if (!match) {
      return '';
    }
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return '';
    }
  }

  function launchData() {
    var app = sdk();
    return (app && app.initData) || fragment('tgWebAppData');
  }

  function telegramLanguage() {
    var app = sdk();
    var user = app && app.initDataUnsafe && app.initDataUnsafe.user;
    if (user && user.language_code) {
      return String(user.language_code);
    }
    var match = /(?:^|&)user=([^&]*)/.exec(fragment('tgWebAppData'));
    if (!match) {
      return '';
    }
    try {
      return String(JSON.parse(decodeURIComponent(match[1])).language_code || '');
    } catch (e) {
      return '';
    }
  }

  /* detectLocale of lib/telegram/language.ts (BR-APP-050, LB-APP-032). */
  function detect(code) {
    code = String(code || '').toLowerCase();
    if (code.indexOf('uz') === 0) {
      return 'uz';
    }
    if (ONE_DETECTOR && code.indexOf('en') === 0) {
      return 'en';
    }
    return 'ru';
  }

  function language() {
    var segment = w.location.pathname.split('/')[1] || '';
    for (var i = 0; i < LOCALES.length; i++) {
      if (LOCALES[i] === segment) {
        return segment;
      }
    }
    return detect(telegramLanguage());
  }

  function lowEnd() {
    var nav = w.navigator || {};
    var agent = nav.userAgent || '';
    var match = /Telegram-Android\/[^(]*\([^)]*;\s*(LOW|AVERAGE|HIGH)\s*\)/.exec(agent);
    if (match) {
      return match[1] !== 'HIGH';
    }
    if (!/Android/i.test(agent)) {
      return false;
    }
    var cores = nav.hardwareConcurrency || RULES.missing;
    var memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : RULES.missing;
    return cores <= RULES.cores || memory <= RULES.memory;
  }

  function modernEngine() {
    try {
      return !!(w.CSS && typeof w.CSS.supports === 'function' && w.CSS.supports('color', 'color-mix(in srgb, red, blue)') &&
        w.HTMLScriptElement && typeof w.HTMLScriptElement.supports === 'function' && w.HTMLScriptElement.supports('importmap'));
    } catch (e) {
      return false;
    }
  }

  function strip(url) {
    return String(url || '').replace(/[?#].*$/, '');
  }

  function report(name, message, source) {
    var app = sdk();
    var entry = {
      name: String(name || 'Error'),
      /* Telegram's own code reports the page address with #tgWebAppData (TMA-009). */
      message: String(message || '').replace(/#\S*/g, '').replace(/tgWebAppData\S*/g, '').slice(0, 300),
      source: source,
      tg: (app && app.version) || fragment('tgWebAppVersion'),
      platform: (app && app.platform) || fragment('tgWebAppPlatform')
    };
    boot.errors.push(entry);
    if (!launchData()) {
      return;
    }
    try {
      /* The route arrives with WP-32; until then the request fails silently. */
      var request = new XMLHttpRequest();
      request.open('POST', '/bff/boot-error', true);
      request.setRequestHeader('Content-Type', 'application/json');
      request.send(JSON.stringify({ error: entry }));
    } catch (e) {
      /* nothing to do */
    }
  }

  function element(name, style, text) {
    var node = d.createElement(name);
    node.style.cssText = style;
    if (text) {
      node.appendChild(d.createTextNode(text));
    }
    return node;
  }

  function render() {
    state = 2;
    var app = sdk();
    var dark = (app && app.colorScheme === 'dark') || !!(w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches);
    var pill = 'display:block;box-sizing:border-box;width:100%;max-width:320px;height:48px;margin:12px auto 0;padding:0 20px;' +
      'border:0;border-radius:999px;font:600 16px/48px inherit;text-decoration:none;cursor:pointer;-webkit-appearance:none;';
    var root = element('div', 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;' +
      'font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'background-color:' + (dark ? '#000000' : '#ffffff') + ';color:' + (dark ? '#ececee' : '#0f0f10'));
    root.setAttribute('data-boot-screen', '');
    root.appendChild(element('div', 'font-size:44px;line-height:1;margin-bottom:16px', '🔄'));
    root.appendChild(element('h1', 'font-size:22px;font-weight:700;margin:0 0 8px', words[0]));
    root.appendChild(element('p', 'max-width:320px;margin:0 0 12px;opacity:.72', words[1]));
    if (app || bot) {
      var back = element('a', pill + 'background-color:#ffd23f;color:#0b0b0b', words[2]);
      back.setAttribute('data-boot-action', 'bot');
      back.setAttribute('role', 'button');
      if (bot) {
        back.setAttribute('href', 'https://t.me/' + bot);
      }
      back.onclick = function (event) {
        var current = sdk();
        if (current && typeof current.close === 'function') {
          if (event && event.preventDefault) {
            event.preventDefault();
          }
          try {
            current.close();
          } catch (e) {
            /* the link still leads to the bot */
          }
        }
      };
      root.appendChild(back);
    }
    var retry = element('button', pill + 'background-color:' + (dark ? '#1c1c1f' : '#f0f0f3') + ';color:inherit', words[3]);
    retry.setAttribute('data-boot-action', 'retry');
    retry.setAttribute('type', 'button');
    retry.onclick = function () {
      w.location.reload();
    };
    root.appendChild(retry);
    d.body.appendChild(root);
  }

  /* SCR-001: shown once, never closed. */
  function show() {
    if (state !== 0) {
      return;
    }
    state = 1;
    words = TEXTS[language()];
    if (d.body) {
      render();
    } else {
      d.addEventListener('DOMContentLoaded', render);
    }
  }

  function onError(event) {
    var target = event && event.target;
    /* The SDK's state is kept after the hand-over too: waitForSdk reads it whenever it starts. */
    if (target && target.id === 'tg-sdk') {
      boot.sdk = 'error';
      return;
    }
    if (boot.ok) {
      return;
    }
    /* An element's error is a failed resource; anything else is an uncaught error of a script. */
    if (target && target.nodeType === 1) {
      if (target.tagName !== 'SCRIPT') {
        return;
      }
      var src = target.getAttribute('src') || '';
      if (src.indexOf('/_next/static/') !== -1) {
        report('ChunkLoadError', 'failed to load ' + strip(src), strip(src));
        show();
      }
      return;
    }
    var error = event.error;
    var message = event.message || (error && error.message) || '';
    var file = event.filename || '';
    var source = strip(file);
    if (event.lineno) {
      source += ':' + event.lineno + (event.colno ? ':' + event.colno : '');
    }
    report((error && error.name) || 'Error', message, source);
    if (message === 'Script error.' || file.indexOf('telegram.org') !== -1) {
      return;
    }
    show();
  }

  function onLoad(event) {
    var target = event && event.target;
    if (target && target.id === 'tg-sdk') {
      boot.sdk = 'ok';
    }
  }

  /* Before paint: theme (TMA-021) and lite graphics (03 §1.7). */
  var theme = stored('homi-theme');
  html.setAttribute('data-scheme', theme === 'light' || theme === 'dark' ? theme : 'light');
  if (theme === 'light' || theme === 'dark') {
    html.setAttribute('data-theme', theme);
  }
  var graphics = stored('homi-graphics');
  if (graphics === 'lite' || (graphics !== 'full' && (stored('homi-graphics-measured') === 'lite' || lowEnd()))) {
    html.className += (html.className ? ' ' : '') + 'lite';
  }

  /* The SDK tag (TMA-001) is inserted here, after the watchdog listens: React hoists an `async` <script src> of the
     layout above the inline scripts. `async` so a hanging telegram.org cannot keep the page white, `crossorigin` so
     its errors are readable. */
  function loadSdk() {
    var head = d.head || d.getElementsByTagName('head')[0];
    if (!head || d.getElementById('tg-sdk')) {
      return;
    }
    var script = d.createElement('script');
    script.id = 'tg-sdk';
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (tag && tag.nonce) {
      script.nonce = tag.nonce;
    }
    script.src = SDK_URL;
    head.appendChild(script);
  }

  w.addEventListener('error', onError, true);
  /* A load event never reaches window (DOM: the path of a load event stops at the document). */
  d.addEventListener('load', onLoad, true);
  loadSdk();
  if (!modernEngine()) {
    show();
  }
})();
