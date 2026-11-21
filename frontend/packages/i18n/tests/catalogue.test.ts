import { describe, expect, it } from "vitest";

import { locales } from "@homi/config";

import brandWords from "../brand-words.json";
import legacyEn from "../messages/legacy/en.json";
import keyList from "../messages/legacy/keys.json";
import leafAndPrefix from "../messages/legacy/leaf-and-prefix.json";
import legacyRu from "../messages/legacy/ru.json";
import legacyUz from "../messages/legacy/uz.json";
import { getMessages } from "../src/index";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string" ? [[`${prefix}${key}`, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

/** The legacy name of a catalogue path: `sheet.market._` → `sheet.market`. */
const legacyName = (path: string) => path.replace(/\._$/, "");

const PLURALS = [
  "listings",
  "listing.rooms",
  "details.daysOnMarket",
  "details.publications",
  "details.channels",
  "details.views",
  "actions.blockCount",
  "map.missing",
  "market.info.agoMin",
  "market.info.agoHour",
  "market.info.agoDay",
  "market.v3.found",
  "market.v3.district",
  "market.v3.city",
  "back.new",
  "app.freshShow",
  // The owner dictionary (WP-81).
  "own.panel.waiting",
  "own.v.newRequests",
  "own.days",
];

describe("the merged catalogues", () => {
  const merged = Object.fromEntries(locales.map((locale) => [locale, flatten(getMessages(locale) as Tree)]));

  it("have identical key sets in ru, uz and en", () => {
    const ru = Object.keys(merged.ru).sort();
    expect(Object.keys(merged.uz).sort()).toEqual(ru);
    expect(Object.keys(merged.en).sort()).toEqual(ru);
  });

  it("hold the 19 plural keys as ICU plurals on n with the forms of each locale", () => {
    for (const locale of locales) {
      const plurals = Object.entries(merged[locale])
        .filter(([, value]) => value.startsWith("{n, plural,"))
        .map(([key]) => key);
      expect(plurals.sort()).toEqual([...PLURALS].sort());
    }
    expect(merged.ru["listing.rooms"]).toMatch(/one \{.*\} few \{.*\} many \{.*\} other \{.*\}/);
    expect(merged.ru["map.missing"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
    expect(merged.uz["listing.rooms"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
    expect(merged.en["back.new"]).toMatch(/^\{n, plural, one \{.*\} other \{.*\}\}$/);
  });

  it("contain no legacy brand word in any locale", () => {
    const patterns = brandWords.patterns.map((pattern) => new RegExp(pattern, "iu"));
    const hits = locales.flatMap((locale) =>
      Object.entries(merged[locale])
        .filter(([, value]) => patterns.some((pattern) => pattern.test(value)))
        .map(([key]) => `${locale}:${key}`),
    );
    expect(hits).toEqual([]);
  });

  it("carry the three keys this package adds", () => {
    expect([merged.ru["demo.label"], merged.uz["demo.label"], merged.en["demo.label"]]).toEqual([
      "Демо-данные",
      "Demo maʼlumotlar",
      "Demo data",
    ]);
    expect(merged.en["demo.hint"]).toBe("This section still runs on test data");
    expect([merged.ru["fallback.other"], merged.uz["fallback.other"], merged.en["fallback.other"]]).toEqual([
      "Другое",
      "Boshqa",
      "Other",
    ]);
  });

  it("carry the four keys of WP-23 next to the legacy keys of their namespaces", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("error.notFound")).toEqual(["Такой страницы нет", "Bunday sahifa yoʻq", "This page doesn’t exist"]);
    expect(values("error.toSearch")).toEqual(["К поиску", "Qidiruvga", "Back to search"]);
    expect(values("error.sessionExpired")[0]).toBe("Сессия устарела — закройте и откройте приложение снова");
    for (const locale of locales) {
      expect(merged[locale]["city.countsDaily"].match(/\{\w+\}/g)).toEqual(["{rent}", "{daily}", "{sale}"]);
    }
    expect(merged.ru["error.retry"]).toBe("Повторить");
    expect(merged.ru["city.counts"]).toBe("{rent} аренда · {sale} продажа");
  });

  it("carry the key of WP-24 next to the legacy feed keys: the list's status for screen readers", () => {
    expect(locales.map((locale) => merged[locale]["feed.loading"])).toEqual(["Загрузка…", "Yuklanmoqda…", "Loading…"]);
    expect(merged.ru["feed.retry"]).toBe("{error} — повторить");
  });

  it("carry the four keys of WP-26 next to the legacy keys of their namespaces; WP-34 removed `toast.reportedAgentReview`", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("listing.showPhone")).toEqual(["Показать номер", "Raqamni koʻrsatish", "Show number"]);
    expect(values("market.v3.rooms0")).toEqual(["тоже студии", "ham studiya", "also studios"]);
    expect(values("market.v3.roomsN")).toEqual(["тоже {n}-комн.", "ham {n} xonali", "also {n}-room"]);
    expect(values("report.agentHintReview")).toEqual([
      "Проверим номер — если это риелтор, отметим его",
      "Raqamni tekshiramiz — rieltor boʻlsa, belgilaymiz",
      "We’ll check the number and mark it if it’s an agent",
    ]);
    expect(values("toast.reportedAgentReview")).toEqual([undefined, undefined, undefined]);
    expect(merged.ru["listing.call"]).toBe(legacyRu.listing.call);
    expect(merged.ru["market.v3.rooms1"]).toBe(legacyRu.market.v3.rooms1);
    expect(merged.ru["report.agentHint"]).toBe("Отметим номер как риелторский");
    expect(merged.ru["toast.reportedAgent"]).toBe("Отметили номер как риелторский");
  });

  it("carry the two keys of WP-27 next to the legacy map keys; WP-28 removed `map.unavailable`", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("map.empty")).toEqual(["Ничего не найдено в этой области", "Bu hududda hech narsa topilmadi", "Nothing found in this area"]);
    expect(values("map.loading")).toEqual(["Загружаем объявления…", "Eʼlonlar yuklanmoqda…", "Loading listings…"]);
    expect(values("map.unavailable")).toEqual([undefined, undefined, undefined]);
    expect(merged.uz["map.loading"]).toContain("ʼ");
    expect(merged.ru["map.stackOf"]).toBe(legacyRu.map.stackOf);
    expect(merged.ru["map.note"]).toBe("На карте {shown} из {total} · {missing} известен только район");
  });

  it("carry the three keys of WP-30 next to the legacy radar and toast keys", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("radar.soon.title")).toEqual(["Радар скоро заработает", "Radar tez orada ishga tushadi", "Radar is coming soon"]);
    expect(values("radar.soon.body")).toEqual([
      "Мы включим уведомления о новых объявлениях в ближайшее время.",
      "Yangi eʼlonlar haqidagi bildirishnomalarni yaqin orada yoqamiz.",
      "We’ll turn on alerts about new listings shortly.",
    ]);
    expect(values("toast.subDeleted")).toEqual(["Радар удалён", "Radar oʻchirildi", "Radar deleted"]);
    // The legacy keys of the two namespaces stay beside them.
    expect(merged.ru["radar.delete"]).toBe(legacyRu.radar.delete);
    expect(merged.ru["toast.subLimit"]).toBe(legacyRu.toast.subLimit);
  });

  it("override the four texts of `index-CBlEKxdL.js` that carry the legacy brand, and follow its en wording", () => {
    const values = (key: string) => locales.map((locale) => merged[locale][key]);
    expect(values("noAccess.text.private")).toEqual([
      "Приложение сейчас доступно только команде HOMI.",
      "Ilova hozir faqat HOMI jamoasi uchun ochiq.",
      "The app is available only to the HOMI team for now.",
    ]);
    // The three owner texts name no product: the same sentence is true of a legacy listing and of a HOMI one.
    expect(values("owner.info.self")).toEqual(["Разместил квартиру сам.", "Kvartirani oʻzi joylagan.", "Listed the flat themselves."]);
    expect(values("owner.info.verified")).toEqual([
      "Хозяин сам подтвердил номер из этого объявления.",
      "Uy egasi bu eʼlondagi raqamni oʻzi tasdiqlagan.",
      "The owner confirmed the number from this listing themselves.",
    ]);
    expect(values("details.historySelf")).toEqual([
      "Хозяин разместил квартиру {date}. Изменений цены пока не было.",
      "Uy egasi {date} joyladi. Narx hali oʻzgarmagan.",
      "The owner listed it on {date}. No price changes yet.",
    ]);
    expect(merged.en["found.shareText"]).toContain("owners vs. agents");
    expect(merged.en["found.where.agent"]).toBe("Through an agent");
    // The other keys of the three namespaces stay legacy's.
    expect(merged.ru["noAccess.title.private"]).toBe(legacyRu.noAccess.title.private);
    expect(merged.ru["owner.info.phone"]).toBe(legacyRu.owner.info.phone);
    expect(merged.ru["card.ownerVerified"]).toBe("Проверенный хозяин");
  });
});

describe("the legacy layer", () => {
  const layers = { ru: legacyRu, uz: legacyUz, en: legacyEn } as Record<string, Tree>;

  it("matches the key list of the pinned release, which keeps the legacy names", () => {
    expect(keyList.release).toBe("index-YX9bFVws.js");
    // 591 keys of the main dictionary and the 207 of the owner dictionary (WP-81), which keep their legacy names.
    expect(keyList.keys).toHaveLength(798);
    expect(keyList.owner?.keys).toHaveLength(207);
    expect(keyList.owner?.keys.every((key) => key.startsWith("own.") && keyList.keys.includes(key))).toBe(true);
    for (const layer of Object.values(layers)) {
      expect(Object.keys(flatten(layer)).map(legacyName).sort()).toEqual([...keyList.keys].sort());
    }
  });

  it("moves exactly the listed leaf-and-prefix keys to <key>._ and renames nothing else", () => {
    expect(leafAndPrefix).toEqual([
      "contact.who",
      "settings.cards",
      "settings.graphics",
      "settings.theme",
      "sheet.market",
      "sheet.posted",
    ]);
    const moved = Object.keys(flatten(layers.ru))
      .filter((path) => path.endsWith("._"))
      .map(legacyName)
      .sort();
    expect(moved).toEqual([...leafAndPrefix].sort());
  });

  it("drops the six dead keys", () => {
    expect([...keyList.dropped].sort()).toEqual(
      ["feed.historyHint", "subs.count", "subs.delete", "subs.edit", "subs.inFeed", "subs.modeAria"].sort(),
    );
    for (const dead of keyList.dropped) {
      expect(flatten(layers.ru)[dead]).toBeUndefined();
    }
  });
});
