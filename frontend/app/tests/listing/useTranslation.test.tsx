import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { act, cleanup, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TranslationData } from "@/features/listing/listingData";
import type { ActionResult } from "@/lib/actions/run";

const state = vi.hoisted(() => ({
  translate: vi.fn<(input: { number: number }, auth?: unknown, locale?: string) => Promise<ActionResult<TranslationData>>>(),
}));
vi.mock("@/lib/actions/listing", () => ({ getContact: vi.fn(), translate: state.translate, prepareShare: vi.fn() }));

import type { TranslationControl } from "@/features/listing/sections/controls";
import {
  EMPTY_TRANSLATION,
  readTranslation,
  resetTranslations,
  subscribeTranslations,
  translationKey,
  writeTranslation,
} from "@/features/listing/translation/translationCache";
import { useTranslation } from "@/features/listing/translation/useTranslation";

const DOWN: ActionResult<TranslationData> = {
  ok: false,
  error: "source_unavailable",
  status: 503,
  code: "source_unavailable",
  method: "POST",
  path: "listings/:number/translation",
};

function translated(text: string, locale = "uz"): ActionResult<TranslationData> {
  return { ok: true, data: { text, locale }, meta: { source: "stub" } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function intl(locale: Locale) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
        {children}
      </NextIntlClientProvider>
    );
  };
}

function translation(number = 100001, locale: Locale = "uz") {
  return renderHook((current: number) => useTranslation(current), { initialProps: number, wrapper: intl(locale) });
}

const shape = (control: TranslationControl | null) =>
  control === null ? null : { text: control.text, shown: control.shown, pending: control.pending, failed: control.failed };

async function toggle(control: TranslationControl | null): Promise<void> {
  await act(async () => {
    control!.toggle();
    await Promise.resolve();
  });
}

beforeEach(() => {
  state.translate.mockReset();
});

afterEach(() => {
  cleanup();
  resetTranslations();
});

describe("translationCache", () => {
  it("keys by number and locale and keeps one object per key until it is written", () => {
    const key = translationKey(100001, "uz");
    expect(key).not.toBe(translationKey(100001, "en"));
    expect(key).not.toBe(translationKey(100002, "uz"));
    expect(readTranslation(key)).toBe(EMPTY_TRANSLATION);
    expect(readTranslation(key)).toBe(readTranslation(key));

    const listener = vi.fn();
    const unsubscribe = subscribeTranslations(listener);
    writeTranslation(key, { pending: true });
    const written = readTranslation(key);
    expect(written).toEqual({ text: null, shown: false, pending: true, failed: false });
    expect(readTranslation(key)).toBe(written);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readTranslation(translationKey(100001, "en"))).toBe(EMPTY_TRANSLATION);

    unsubscribe();
    writeTranslation(key, { pending: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(EMPTY_TRANSLATION).toEqual({ text: null, shown: false, pending: false, failed: false });
  });
});

describe("useTranslation (BR-APP-034)", () => {
  it("is not offered in ru", () => {
    const { result } = translation(100001, "ru");
    expect(result.current).toBeNull();
    expect(state.translate).not.toHaveBeenCalled();
  });

  it("fetches on the first tap, then toggles without a request", async () => {
    const answer = deferred<ActionResult<TranslationData>>();
    state.translate.mockReturnValueOnce(answer.promise);
    const { result } = translation();
    expect(shape(result.current)).toEqual({ text: null, shown: false, pending: false, failed: false });

    await toggle(result.current);
    expect(shape(result.current)).toEqual({ text: null, shown: false, pending: true, failed: false });
    expect(state.translate.mock.calls).toEqual([[{ number: 100001 }, undefined, "uz"]]);

    await act(async () => answer.resolve(translated("Kvartira ijaraga beriladi")));
    expect(shape(result.current)).toEqual({ text: "Kvartira ijaraga beriladi", shown: true, pending: false, failed: false });

    await toggle(result.current);
    expect(shape(result.current)).toMatchObject({ text: "Kvartira ijaraga beriladi", shown: false });
    await toggle(result.current);
    expect(shape(result.current)).toMatchObject({ shown: true });
    expect(state.translate).toHaveBeenCalledTimes(1);
  });

  it("taps while the request runs are ignored", async () => {
    const answer = deferred<ActionResult<TranslationData>>();
    state.translate.mockReturnValueOnce(answer.promise);
    const { result } = translation();

    await toggle(result.current);
    await toggle(result.current);
    await toggle(result.current);
    expect(state.translate).toHaveBeenCalledTimes(1);

    await act(async () => answer.resolve(translated("Matn")));
    expect(shape(result.current)).toMatchObject({ text: "Matn", shown: true, pending: false });
  });

  it.each([
    ["an error answer", () => Promise.resolve(DOWN)],
    ["a rejected action", () => Promise.reject(new Error("offline"))],
    ["an empty text", () => Promise.resolve(translated(""))],
    ["a blank text", () => Promise.resolve(translated("  \n "))],
  ])("%s is a failure, and the next tap asks again", async (_name, failure) => {
    state.translate.mockImplementationOnce(failure);
    const { result } = translation(100001, "en");

    await toggle(result.current);
    await act(async () => {
      await Promise.resolve();
    });
    expect(shape(result.current)).toEqual({ text: null, shown: false, pending: false, failed: true });

    const retry = deferred<ActionResult<TranslationData>>();
    state.translate.mockReturnValueOnce(retry.promise);
    await toggle(result.current);
    expect(shape(result.current)).toEqual({ text: null, shown: false, pending: true, failed: false });

    await act(async () => retry.resolve(translated("A flat for rent", "en")));
    expect(shape(result.current)).toEqual({ text: "A flat for rent", shown: true, pending: false, failed: false });
    expect(state.translate.mock.calls).toEqual([
      [{ number: 100001 }, undefined, "en"],
      [{ number: 100001 }, undefined, "en"],
    ]);
  });

  it("is kept per number: another listing starts untranslated, and the first one shows its own again", async () => {
    state.translate.mockResolvedValueOnce(translated("Birinchi"));
    const { result, rerender } = translation(100001);
    await toggle(result.current);
    expect(shape(result.current)).toMatchObject({ text: "Birinchi", shown: true });

    rerender(100002);
    expect(shape(result.current)).toEqual({ text: null, shown: false, pending: false, failed: false });

    rerender(100001);
    expect(shape(result.current)).toMatchObject({ text: "Birinchi", shown: true });
    expect(state.translate).toHaveBeenCalledTimes(1);
  });

  it("is kept per locale: the same listing in another language starts untranslated", async () => {
    state.translate.mockResolvedValueOnce(translated("Oʻzbekcha"));
    const uz = translation(100001, "uz");
    await toggle(uz.result.current);
    uz.unmount();

    const en = translation(100001, "en");
    expect(shape(en.result.current)).toEqual({ text: null, shown: false, pending: false, failed: false });
    en.unmount();

    const again = translation(100001, "uz");
    expect(shape(again.result.current)).toMatchObject({ text: "Oʻzbekcha", shown: true });
  });

  it("an answer that comes after the screen closed is there when it opens again", async () => {
    const answer = deferred<ActionResult<TranslationData>>();
    state.translate.mockReturnValueOnce(answer.promise);
    const first = translation();
    await toggle(first.result.current);
    first.unmount();

    await act(async () => answer.resolve(translated("Keyin keldi")));

    const reopened = translation();
    expect(shape(reopened.result.current)).toEqual({ text: "Keyin keldi", shown: true, pending: false, failed: false });
  });

  it("the server renders the untranslated state whatever the launch holds", () => {
    writeTranslation(translationKey(100001, "uz"), { text: "Matn", shown: true });
    let rendered: ReturnType<typeof shape> | undefined;
    function Probe() {
      rendered = shape(useTranslation(100001));
      return null;
    }

    const Wrapper = intl("uz");
    renderToString(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );

    expect(rendered).toEqual({ text: null, shown: false, pending: false, failed: false });
  });
});
