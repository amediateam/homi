import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeTelegram, syntheticInitData, type FakeTelegram } from "@homi/testing";
import { Linter } from "eslint";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOOT_SCRIPT, BOOT_STUBS } from "@/boot/inline.generated";
import { devFlags } from "@/lib/flags";
import { GRAPHICS_RULES, isLiteGraphics } from "@/lib/graphics";
import { TELEGRAM_SDK_URL } from "@/lib/telegram/sdk";

const dir = join(import.meta.dirname, "../../boot");
const bootSource = readFileSync(join(dir, "boot.js"), "utf8");
const stubsSource = readFileSync(join(dir, "stubs.js"), "utf8");

interface Boot {
  ok: boolean;
  watching: boolean;
  sdk: string | null;
  show: () => void;
  errors: { name: string; message: string; source: string; tg: string; platform: string }[];
}

const host = window as unknown as Record<string, unknown>;
const html = document.documentElement;
const boots: Boot[] = [];
let fake: FakeTelegram | null = null;

interface RunOptions {
  address?: string;
  bot?: string;
  colorMix?: boolean;
  importMap?: boolean | "missing";
  source?: string;
  nonce?: string;
}

/** Runs the boot script as the layout does: an inline `<script id="homi-boot" data-bot>` in the head. */
function runBoot({ address = "/ru", bot = "homi_test_bot", colorMix = true, importMap = true, source = bootSource, nonce }: RunOptions = {}): Boot {
  window.history.replaceState(null, "", address);
  document.getElementById("homi-boot")?.remove();
  const tag = document.createElement("script");
  tag.id = "homi-boot";
  tag.dataset.bot = bot;
  if (nonce) {
    tag.nonce = nonce;
  }
  document.head.append(tag);
  vi.stubGlobal("CSS", { supports: (property: string, value: string) => property === "color" && value.startsWith("color-mix(") && colorMix });
  if (importMap === "missing") {
    Reflect.deleteProperty(HTMLScriptElement, "supports");
  } else {
    Object.defineProperty(HTMLScriptElement, "supports", { value: (type: string) => type === "importmap" && importMap, configurable: true });
  }
  (0, eval)(source);
  const boot = host.__homiBoot as Boot;
  boots.push(boot);
  return boot;
}

const screen = () => document.querySelectorAll("[data-boot-screen]");
const texts = () => [...(screen()[0]?.querySelectorAll("h1, p, a, button") ?? [])].map((node) => node.textContent);

function scriptError(src: string, id?: string): void {
  const script = document.createElement("script");
  if (id) {
    script.id = id;
  }
  script.setAttribute("src", src);
  document.head.append(script);
  script.dispatchEvent(new Event("error"));
  script.remove();
}

beforeEach(() => {
  window.localStorage.clear();
  html.removeAttribute("data-theme");
  html.removeAttribute("data-scheme");
  html.className = "";
});

afterEach(() => {
  for (const boot of boots.splice(0)) {
    boot.ok = true;
  }
  for (const node of document.querySelectorAll("[data-boot-screen], #homi-boot, #tg-sdk")) {
    node.remove();
  }
  fake?.uninstall();
  fake = null;
  delete host.__homiBoot;
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("the boot files", () => {
  it("parse as ES5 scripts", () => {
    const linter = new Linter();
    for (const [name, text] of [
      ["boot.js", bootSource],
      ["stubs.js", stubsSource],
    ]) {
      const fatal = linter
        .verify(text, { languageOptions: { ecmaVersion: 5, sourceType: "script" } })
        .filter((message) => message.fatal);
      expect(fatal, name).toEqual([]);
    }
    expect(linter.verify("let a = 1;", { languageOptions: { ecmaVersion: 5, sourceType: "script" } })[0]?.fatal).toBe(true);
  });

  it("the committed inline.generated.ts holds their exact text", () => {
    expect(BOOT_SCRIPT).toBe(bootSource);
    expect(BOOT_STUBS).toBe(stubsSource);
  });

  it("repeat the constants of lib/flags.ts, lib/graphics.ts and lib/telegram/sdk.ts", () => {
    expect(bootSource).toContain(`var ONE_DETECTOR = ${String(devFlags.dev020OneLanguageDetector)};`);
    expect(bootSource).toContain(`var SDK_URL = '${TELEGRAM_SDK_URL}';`);
    expect(bootSource).toContain(
      `var RULES = { cores: ${GRAPHICS_RULES.lowEndCores}, memory: ${GRAPHICS_RULES.lowEndMemoryGb}, missing: ${GRAPHICS_RULES.missingValue} };`,
    );
  });
});

describe("SDK tag (TMA-001)", () => {
  it("is inserted after the boot script: async, crossorigin, with the boot script's nonce", () => {
    runBoot({ nonce: "n0nce" });

    const scripts = [...document.head.querySelectorAll("script")];
    const sdk = document.getElementById("tg-sdk") as HTMLScriptElement;
    expect(sdk.src).toBe(TELEGRAM_SDK_URL);
    expect(sdk.async).toBe(true);
    expect(sdk.crossOrigin).toBe("anonymous");
    expect(sdk.nonce).toBe("n0nce");
    expect(scripts.indexOf(sdk)).toBeGreaterThan(scripts.findIndex((script) => script.id === "homi-boot"));
  });

  it("is inserted once", () => {
    runBoot();
    runBoot();
    expect(document.querySelectorAll("#tg-sdk")).toHaveLength(1);
  });
});

describe("stubs (TMA-002)", () => {
  it("define the native callbacks as no-ops and keep existing ones", () => {
    const existing = () => undefined;
    host.__tg__postBackgroundChange = existing;
    (0, eval)(stubsSource);

    expect(host.__tg__postBackgroundChange).toBe(existing);
    expect(typeof (host.TelegramGameProxy as { receiveEvent: unknown }).receiveEvent).toBe("function");

    delete host.__tg__postBackgroundChange;
    delete host.TelegramGameProxy;
    (0, eval)(stubsSource);
    expect(() => (host.__tg__postBackgroundChange as () => void)()).not.toThrow();
  });
});

describe("engine test (SCR-001)", () => {
  it("a modern engine sees no screen", () => {
    runBoot();
    expect(screen()).toHaveLength(0);
  });

  it("an engine without color-mix, without import maps or without HTMLScriptElement.supports sees the screen", () => {
    for (const options of [{ colorMix: false }, { importMap: false }, { importMap: "missing" as const }]) {
      runBoot(options);
      expect(screen(), JSON.stringify(options)).toHaveLength(1);
      boots.at(-1)!.ok = true;
      screen()[0].remove();
    }
  });

  it("show() is idempotent and the screen never closes", () => {
    const boot = runBoot();
    boot.show();
    boot.show();
    expect(screen()).toHaveLength(1);
  });
});

describe("update screen", () => {
  const ru = ["Обновите Telegram", expect.stringContaining("Приложение не запустилось"), "Вернуться в бота", "Попробовать ещё раз"];
  const uz = ["Telegramni yangilang", expect.stringContaining("Ilova ishga tushmadi"), "Botga qaytish", "Qayta urinish"];
  const en = ["Update Telegram", expect.stringContaining("The app couldn’t start"), "Back to the bot", "Try again"];

  it("speaks the language of the address segment", () => {
    for (const [address, expected] of [
      ["/ru/map", ru],
      ["/uz", uz],
      ["/en/listing/5", en],
    ] as const) {
      runBoot({ address }).show();
      expect(texts(), address).toEqual(expected);
      screen()[0].remove();
      boots.at(-1)!.ok = true;
    }
  });

  it("keeps the language of the address when it decided, though the app switches the segment before the body is there", () => {
    // The head script decides before <body> exists and renders at DOMContentLoaded; meanwhile LocaleGuard may replace
    // /uz by the Telegram language (e2e boot-failure.spec.ts).
    const body = vi.spyOn(document, "body", "get").mockReturnValue(null as unknown as HTMLElement);
    runBoot({ address: "/uz", colorMix: false });
    expect(screen()).toHaveLength(0);

    window.history.replaceState(null, "", "/ru");
    body.mockRestore();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(texts()).toEqual(uz);
  });

  it("else the Telegram language: uz* → uz, anything else → ru while the one-detector flag is off", () => {
    const cases: [string, unknown[]][] = [
      ["uz-UZ", uz],
      ["uz-Cyrl", uz],
      ["en", ru],
      ["kk", ru],
      ["", ru],
    ];
    for (const [language, expected] of cases) {
      const launch = syntheticInitData({ language_code: language });
      runBoot({ address: `/x#tgWebAppData=${encodeURIComponent(launch)}` }).show();
      expect(texts(), language).toEqual(expected);
      screen()[0].remove();
      boots.at(-1)!.ok = true;
    }
  });

  it("with the one-detector flag on, en* → en (LB-APP-032)", () => {
    const source = bootSource.replace("var ONE_DETECTOR = false;", "var ONE_DETECTOR = true;");
    const launch = syntheticInitData({ language_code: "en-GB" });
    runBoot({ address: `/x#tgWebAppData=${encodeURIComponent(launch)}`, source }).show();
    expect(texts()).toEqual(en);
  });

  it("reads the language from the SDK when it is there", () => {
    fake = fakeTelegram({ initData: syntheticInitData({ language_code: "uz" }) });
    runBoot({ address: "/x" }).show();
    expect(texts()).toEqual(uz);
  });

  it("the first button closes the Mini App through the SDK", () => {
    fake = fakeTelegram();
    runBoot().show();

    (screen()[0].querySelector("[data-boot-action=bot]") as HTMLElement).click();

    expect(fake.closed).toBe(true);
  });

  it("without the SDK the first button is a link to the bot, and it is absent without a bot name", () => {
    runBoot().show();
    expect(screen()[0].querySelector("[data-boot-action=bot]")?.getAttribute("href")).toBe("https://t.me/homi_test_bot");
    screen()[0].remove();
    boots.at(-1)!.ok = true;

    runBoot({ bot: "" }).show();
    expect(screen()[0].querySelector("[data-boot-action=bot]")).toBeNull();
    expect(screen()[0].querySelector("[data-boot-action=retry]")).not.toBeNull();
  });

  it("is dark when the SDK says so or the system prefers dark", () => {
    const secondBackground = () => (screen()[0].querySelector("[data-boot-action=retry]") as HTMLElement).style.backgroundColor;
    runBoot().show();
    expect(secondBackground()).toBe("rgb(240, 240, 243)");
    screen()[0].remove();
    boots.at(-1)!.ok = true;

    fake = fakeTelegram({ colorScheme: "dark" });
    runBoot().show();
    expect(secondBackground()).toBe("rgb(28, 28, 31)");
    screen()[0].remove();
    boots.at(-1)!.ok = true;
    fake.uninstall();
    fake = null;

    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" }));
    runBoot().show();
    expect(secondBackground()).toBe("rgb(28, 28, 31)");
  });
});

describe("watchdog (TMA-003)", () => {
  it("a failed app script shows the screen and is recorded", () => {
    const boot = runBoot();
    scriptError("/_next/static/chunks/app-1.js?dpl=abc");

    expect(screen()).toHaveLength(1);
    expect(boot.errors[0]).toMatchObject({ source: expect.stringContaining("/_next/static/chunks/app-1.js") });
    expect(boot.errors[0].source).not.toContain("?");
  });

  it("a failed SDK tag only marks sdk = error; its load marks ok", () => {
    const boot = runBoot();
    scriptError("https://telegram.org/js/telegram-web-app.js", "tg-sdk");
    expect(boot.sdk).toBe("error");
    expect(screen()).toHaveLength(0);
    expect(boot.errors).toEqual([]);

    const tag = document.createElement("script");
    tag.id = "tg-sdk";
    document.head.append(tag);
    tag.dispatchEvent(new Event("load"));
    tag.remove();
    expect(boot.sdk).toBe("ok");
  });

  it("an uncaught error shows the screen; «Script error.» and SDK errors are recorded only", () => {
    const boot = runBoot();
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    window.dispatchEvent(new ErrorEvent("error", { message: "x is undefined", filename: "https://telegram.org/js/telegram-web-app.js" }));
    expect(screen()).toHaveLength(0);
    expect(boot.errors).toHaveLength(2);

    window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "https://app.homi.loc/_next/static/chunks/a.js", error: new TypeError("boom") }));
    expect(screen()).toHaveLength(1);
    expect(boot.errors[2]).toMatchObject({ name: "TypeError", message: "boom" });
  });

  it("strips the query and the fragment of the source and keeps :line:col", () => {
    const boot = runBoot();
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "boom",
        filename: "https://app.homi.loc/_next/static/chunks/a.js?v=3#tgWebAppData=query_id%3D1",
        lineno: 12,
        colno: 5,
      }),
    );
    expect(boot.errors[0].source).toBe("https://app.homi.loc/_next/static/chunks/a.js:12:5");
  });

  it("caps the message at 300 characters and drops launch data from it", () => {
    const boot = runBoot();
    const launch = encodeURIComponent(syntheticInitData());
    window.dispatchEvent(new ErrorEvent("error", { message: `bad https://app.homi.loc/ru#tgWebAppData=${launch} ${"x".repeat(400)}` }));

    expect(boot.errors[0].message.length).toBeLessThanOrEqual(300);
    expect(boot.errors[0].message).not.toMatch(/tgWebAppData|query_id|hash=/);
  });

  it("records the Telegram version and platform", () => {
    fake = fakeTelegram({ version: "7.10", platform: "android" });
    const boot = runBoot();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(boot.errors[0]).toMatchObject({ tg: "7.10", platform: "android" });
  });

  it("posts nothing without launch data, and one report with it", () => {
    const open = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => undefined);
    const send = vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => undefined);
    vi.spyOn(XMLHttpRequest.prototype, "setRequestHeader").mockImplementation(() => undefined);

    runBoot();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(open).not.toHaveBeenCalled();
    boots.at(-1)!.ok = true;
    screen()[0]?.remove();

    const launch = syntheticInitData();
    runBoot({ address: `/ru#tgWebAppData=${encodeURIComponent(launch)}` });
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    expect(open).toHaveBeenCalledWith("POST", "/bff/boot-error", true);
    expect(String(send.mock.calls[0][0])).not.toContain("query_id");
  });

  it("still marks a late SDK failure after BootGuard set ok", () => {
    const boot = runBoot();
    boot.ok = true;
    scriptError("https://telegram.org/js/telegram-web-app.js", "tg-sdk");
    expect(boot.sdk).toBe("error");
  });

  it("stops once BootGuard set ok", () => {
    const boot = runBoot();
    boot.ok = true;
    scriptError("/_next/static/chunks/late.js");
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

    expect(screen()).toHaveLength(0);
    expect(boot.errors).toEqual([]);
  });
});

describe("before paint", () => {
  it("applies an explicit theme to both attributes, anything else as auto light", () => {
    window.localStorage.setItem("homi-theme", "dark");
    runBoot();
    expect([html.dataset.scheme, html.dataset.theme]).toEqual(["dark", "dark"]);

    html.removeAttribute("data-theme");
    window.localStorage.setItem("homi-theme", "sepia");
    runBoot();
    expect([html.dataset.scheme, html.hasAttribute("data-theme")]).toEqual(["light", false]);
  });

  it("sets html.lite with the same answers as lib/graphics.ts", () => {
    const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
    const profiles = [
      { userAgent: `${android} Telegram-Android/11.2.3 (Pixel; Android 14; SDK 34; LOW)`, cores: 8, memory: 8 },
      { userAgent: `${android} Telegram-Android/11.2.3 (Pixel; Android 14; SDK 34; HIGH)`, cores: 2, memory: 1 },
      { userAgent: android, cores: 4, memory: 8 },
      { userAgent: android, cores: 8, memory: undefined },
      { userAgent: android, cores: undefined, memory: 2 },
      { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", cores: 2, memory: 1 },
    ];
    const stored: [string | null, string | null][] = [
      [null, null],
      ["full", null],
      ["lite", null],
      [null, "lite"],
    ];
    for (const profile of profiles) {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(profile.userAgent);
      vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(profile.cores ?? 0);
      Object.defineProperty(navigator, "deviceMemory", { value: profile.memory, configurable: true });
      for (const [graphics, measured] of stored) {
        window.localStorage.clear();
        if (graphics) {
          window.localStorage.setItem("homi-graphics", graphics);
        }
        if (measured) {
          window.localStorage.setItem("homi-graphics-measured", measured);
        }
        html.className = "";
        runBoot();
        expect(html.classList.contains("lite"), `${profile.userAgent} ${graphics} ${measured}`).toBe(isLiteGraphics(profile));
      }
    }
    Reflect.deleteProperty(navigator, "deviceMemory");
  });
});
