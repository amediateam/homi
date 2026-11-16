import type { Locale } from "@homi/config";
import { getMessages } from "@homi/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFound from "@/app/[locale]/not-found";
import { brand } from "@/lib/brand";
import { routes } from "@/lib/navigation/routes";

/** The counted `Link` needs the App Router; a plain anchor keeps its address and whether it replaces. */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, replace, ...props }: ComponentProps<"a"> & { href: string; replace?: boolean }) => (
    <a href={href} data-replace={replace ? "" : undefined} {...props} />
  ),
}));

afterEach(cleanup);

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);

describe("the not-found screen (D-E-3)", () => {
  it.each([
    ["ru", "Такой страницы нет", "К поиску"],
    ["uz", "Bunday sahifa yoʻq", "Qidiruvga"],
    ["en", "This page doesn’t exist", "Back to search"],
  ] as const)("says the page does not exist and leads to the search in %s", (locale: Locale, title, toSearch) => {
    render(
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Tashkent">
        <NotFound />
      </NextIntlClientProvider>,
    );

    expect(document.querySelector('[data-route="not-found"]')?.tagName).toBe("MAIN");
    expect(screen.getByRole("heading", { level: 1 })).toBe(slot("empty-state-title"));
    expect(slot("empty-state-title")?.textContent).toBe(title);
    expect(slot("empty-state-image")?.getAttribute("src")).toBe(brand.assets.emptyMagnifier);
    const link = screen.getByRole("link");
    expect(link.textContent).toBe(toSearch);
    expect(link.getAttribute("href")).toBe(routes.feed());
    expect(link.hasAttribute("data-replace")).toBe(true);
    expect(link.className).toMatch(/rounded-pill bg-fill/);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
