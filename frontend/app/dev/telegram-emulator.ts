/**
 * Development-only Telegram emulator (WP-21, TMA-045). `dev/build.mjs` turns it, with the double of `@homi/testing`,
 * into `public/__dev/telegram-emulator.js` (git-ignored) before `next dev`; the root layout loads that file only in
 * development, before the boot script, and `prebuild` deletes it. In a desktop browser it installs the same
 * `window.Telegram.WebApp` double as the tests, with either the launch data of the developer's own dev bot or a
 * fake user for the stub sign-in, plus a dev bar for Back, Settings, version, platform and theme. Inside a real
 * Telegram it does nothing.
 */
import { installFakeTelegram, resolveFakeTelegramConfig, type FakeTelegram, type TelegramColorScheme, type TelegramPlatform } from "@homi/testing";

const CHOICE_KEY = "homi-dev-initData";
const SETTINGS_KEY = "homi-dev-telegram";
const VERSIONS = ["6.0", "6.1", "6.2", "6.9", "7.0", "7.7", "7.10", "8.0", "9.0", "9.1"];
const PLATFORMS: TelegramPlatform[] = ["ios", "android", "android_x", "tdesktop", "macos", "weba", "webk"];

interface Settings {
  version: string;
  platform: TelegramPlatform;
  colorScheme: TelegramColorScheme;
}

const defaults: Settings = { version: "9.0", platform: "ios", colorScheme: "light" };

function insideRealTelegram(): boolean {
  const globals = window as unknown as { TelegramWebviewProxy?: unknown; external?: { notify?: unknown } };
  return (
    globals.TelegramWebviewProxy !== undefined ||
    typeof globals.external?.notify === "function" ||
    window.parent !== window ||
    /[#&]tgWebAppData=/.test(window.location.hash)
  );
}

function readSettings(): Settings {
  try {
    return { ...defaults, ...(JSON.parse(window.sessionStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return defaults;
  }
}

function saveAndReload(change: Partial<Settings>): void {
  window.sessionStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...change }));
  window.location.reload();
}

function whenBody(run: () => void): void {
  if (document.body) {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run);
  }
}

function element<K extends keyof HTMLElementTagNameMap>(name: K, style: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.style.cssText = style;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

const panel = "position:fixed;z-index:2147483646;font:12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(20,20,24,.92);";
const control = "margin:2px;padding:3px 6px;font:inherit;color:inherit;background:#33333a;border:1px solid #55555c;border-radius:6px;";

/** The double outlives the real SDK, which assigns `window.Telegram.WebApp` when it loads. */
function keepAgainstSdk(fake: FakeTelegram): void {
  const telegram = (window as unknown as { Telegram: Record<string, unknown> }).Telegram;
  Object.defineProperty(telegram, "WebApp", { configurable: true, get: () => fake.webApp, set: () => undefined });
  Object.defineProperty(window, "Telegram", { configurable: true, get: () => telegram, set: () => undefined });
}

/** Links open a tab and confirms ask the browser, so the flows can be followed on a desktop. */
function bridgeToBrowser(fake: FakeTelegram): void {
  const app = fake.webApp as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const member of ["openLink", "openTelegramLink"]) {
    const original = app[member];
    app[member] = (url: unknown, ...rest: unknown[]) => {
      original(url, ...rest);
      window.open(String(url), "_blank", "noopener");
    };
  }
  const showConfirm = app.showConfirm;
  app.showConfirm = (message: unknown, ...rest: unknown[]) => {
    fake.answers.confirm = window.confirm(String(message));
    return showConfirm(message, ...rest);
  };
}

/** A red bar when the sign-in is refused: launch data of another bot, or too old. */
function watchSignIn(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/bff/session") && response.status === 401 && !document.querySelector("[data-dev-emulator=refused]")) {
      const bar = element("div", `${panel}left:0;right:0;bottom:0;padding:8px;background:#b00020;`, "Sign-in refused (401): the launch data is too old or not signed by this environment's bot.");
      bar.dataset.devEmulator = "refused";
      document.body.append(bar);
    }
    return response;
  };
}

function renderForm(): void {
  const form = element("div", `${panel}left:8px;right:8px;bottom:8px;padding:10px;border-radius:10px;`);
  form.dataset.devEmulator = "form";
  form.append(element("div", "margin-bottom:6px", "Telegram emulator (development only)"));
  const input = element("textarea", `${control}display:block;width:100%;box-sizing:border-box;height:60px;`);
  input.placeholder = "Launch data (initData) of your own dev bot";
  form.append(input);
  const choose = (choice: string): void => {
    window.sessionStorage.setItem(CHOICE_KEY, choice);
    window.location.reload();
  };
  const buttons: [string, () => void][] = [
    ["Use launch data", () => input.value.trim() !== "" && choose(input.value.trim())],
    ["Fake user (stub sign-in)", () => choose("fake")],
    ["Stay outside Telegram", () => choose("outside")],
  ];
  for (const [label, action] of buttons) {
    const button = element("button", control, label);
    button.type = "button";
    button.onclick = action;
    form.append(button);
  }
  document.body.append(form);
}

function select(values: string[], current: string, onChange: (value: string) => void): HTMLSelectElement {
  const node = element("select", control);
  for (const value of values) {
    const option = element("option", "", value);
    option.value = value;
    option.selected = value === current;
    node.append(option);
  }
  node.onchange = () => onChange(node.value);
  return node;
}

function renderBar(fake: FakeTelegram | null): void {
  const bar = element("div", `${panel}top:0;right:0;padding:4px;border-bottom-left-radius:10px;`);
  bar.dataset.devEmulator = "bar";
  if (fake !== null) {
    const settings = readSettings();
    const back = element("button", control, "◀ Back");
    back.type = "button";
    back.dataset.devEmulator = "back";
    back.onclick = () => fake.webApp.BackButton.isVisible && fake.emit("backButtonClicked");
    const gear = element("button", control, "⚙ Settings");
    gear.type = "button";
    gear.dataset.devEmulator = "settings";
    gear.onclick = () => fake.webApp.SettingsButton.isVisible && fake.emit("settingsButtonClicked");
    const theme = element("button", control, "◐");
    theme.type = "button";
    theme.title = "Telegram theme";
    theme.onclick = () => fake.setColorScheme(fake.webApp.colorScheme === "dark" ? "light" : "dark");
    // Dimmed while Telegram would hide the button; a click then does nothing.
    const sync = (): void => {
      back.style.opacity = fake.webApp.BackButton.isVisible ? "1" : "0.35";
      gear.style.opacity = fake.webApp.SettingsButton.isVisible ? "1" : "0.35";
    };
    sync();
    window.setInterval(sync, 250);
    bar.append(
      back,
      gear,
      select(VERSIONS, settings.version, (version) => saveAndReload({ version })),
      select(PLATFORMS, settings.platform, (platform) => saveAndReload({ platform: platform as TelegramPlatform })),
      theme,
    );
  } else {
    bar.append(element("span", "padding:0 6px", "outside Telegram"));
  }
  const reset = element("button", control, "✕");
  reset.type = "button";
  reset.title = "Choose again";
  reset.onclick = () => {
    window.sessionStorage.removeItem(CHOICE_KEY);
    window.location.reload();
  };
  bar.append(reset);
  document.body.append(bar);
}

function start(): void {
  if (insideRealTelegram()) {
    return;
  }
  const choice = window.sessionStorage.getItem(CHOICE_KEY);
  if (choice === null) {
    whenBody(renderForm);
    return;
  }
  if (choice === "outside") {
    whenBody(() => renderBar(null));
    return;
  }
  const settings = readSettings();
  const fake = installFakeTelegram(
    resolveFakeTelegramConfig({
      version: settings.version,
      platform: settings.platform,
      colorScheme: settings.colorScheme,
      ...(choice === "fake" ? {} : { initData: choice }),
    }),
  );
  keepAgainstSdk(fake);
  bridgeToBrowser(fake);
  watchSignIn();
  whenBody(() => renderBar(fake));
}

start();
