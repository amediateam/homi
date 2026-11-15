/* Native callbacks that some Telegram clients call before the SDK exists (TMA-002): Android 12.10+ on return from
   background, old iOS clients at start. ES5; the root layout inlines it as the first script (WP-21). */
window.__tg__postBackgroundChange = window.__tg__postBackgroundChange || function () {};
window.TelegramGameProxy = window.TelegramGameProxy || { receiveEvent: function () {} };
