import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToggleGroup,
  ToggleGroupItem,
} from "../src/index";

afterEach(cleanup);

/** A Tailwind default-palette colour, `white`/`black`, or a literal colour value inside a class name. */
const HARD_CODED_COLOUR =
  /(?:^|[\s:])(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|decoration|caret|accent|divide|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b|\[#[0-9a-f]{3,8}\]|rgba?\(|hsla?\(|oklch\(/i;

function classesIn(root: ParentNode): string[] {
  return [...root.querySelectorAll("[class]")].map((element) => element.getAttribute("class") ?? "");
}

function expectTokenClassesOnly(root: ParentNode = document.body) {
  const classes = classesIn(root);
  expect(classes.length).toBeGreaterThan(0);
  expect(classes.filter((value) => HARD_CODED_COLOUR.test(value))).toEqual([]);
}

describe("base components", () => {
  it("Button renders every variant and size with tokens only", () => {
    const variants = ["primary", "secondary", "ghost", "danger", "text"] as const;
    const sizes = ["lg", "md", "sm", "icon"] as const;
    render(
      <div>
        {variants.flatMap((variant) =>
          sizes.map((size) => (
            <Button key={`${variant}-${size}`} variant={variant} size={size}>
              {variant}
            </Button>
          )),
        )}
      </div>,
    );

    expect(screen.getAllByRole("button")).toHaveLength(20);
    expect(screen.getAllByRole("button", { name: "primary" })[0].className).toMatch(/bg-accent/);
    expect(screen.getAllByRole("button", { name: "primary" })[0].className).toMatch(/h-12/);
    expect(screen.getAllByRole("button", { name: "primary" })[0]).toHaveProperty("type", "button");
    expectTokenClassesOnly();
  });

  it("a disabled primary button is at opacity 0.5, the other variants at 0.4 (`03` §3.6)", () => {
    const variants = ["primary", "secondary", "ghost", "danger", "text"] as const;
    render(
      <div>
        {variants.map((variant) => (
          <Button key={variant} variant={variant} disabled>
            {variant}
          </Button>
        ))}
      </div>,
    );

    const classes = (name: string) => screen.getByRole("button", { name }).className.split(" ");
    expect(classes("primary")).toContain("disabled:opacity-50");
    expect(classes("primary")).not.toContain("disabled:opacity-40");
    for (const variant of variants.slice(1)) {
      expect(classes(variant)).toContain("disabled:opacity-40");
      expect(classes(variant)).not.toContain("disabled:opacity-50");
    }
  });

  it("Button as a child keeps the look on a link", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/x">link</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "link" }).className).toMatch(/bg-fill/);
  });

  it("Dialog renders its title and description in a portal", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Text</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Text");
    expectTokenClassesOnly();
  });

  it("Sheet rises from the bottom with its handle", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>All filters</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(sheet.className).toMatch(/bottom-0/);
    expect(sheet.querySelector('[data-slot="sheet-handle"]')).not.toBeNull();
    expectTokenClassesOnly();
  });

  it("Switch renders off and on", () => {
    render(
      <div>
        <Switch aria-label="off" />
        <Switch aria-label="on" defaultChecked />
      </div>,
    );

    expect(screen.getByRole("switch", { name: "on" }).getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("switch", { name: "off" }).getAttribute("data-state")).toBe("unchecked");
    expectTokenClassesOnly();
  });

  it("Tabs render the active tab", () => {
    render(
      <Tabs defaultValue="favorites">
        <TabsList>
          <TabsTrigger value="favorites">Favourites</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="favorites">list</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "Favourites" }).getAttribute("data-state")).toBe("active");
    expectTokenClassesOnly();
  });

  it("ToggleGroup renders chips in both variants", () => {
    render(
      <ToggleGroup type="multiple" defaultValue={["1"]}>
        <ToggleGroupItem value="1">1</ToggleGroupItem>
        <ToggleGroupItem value="2" variant="accent" size="sm">
          2
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole("button", { name: "1" }).getAttribute("data-state")).toBe("on");
    expectTokenClassesOnly();
  });

  it("RadioGroup marks the chosen option", () => {
    render(
      <RadioGroup defaultValue="auto" aria-label="Theme">
        <RadioGroupItem value="auto">Auto</RadioGroupItem>
        <RadioGroupItem value="dark">Dark</RadioGroupItem>
      </RadioGroup>,
    );

    expect(screen.getByRole("radio", { name: "Auto" }).getAttribute("aria-checked")).toBe("true");
    expectTokenClassesOnly();
  });

  it("Skeleton and Spinner carry the hooks that lite and reduced motion stop", () => {
    render(
      <div>
        <Skeleton className="h-4" />
        <Spinner aria-label="Loading" />
      </div>,
    );

    expect(document.querySelector("[data-shimmer]")?.className).toMatch(/animate-shimmer/);
    expect(screen.getByRole("status", { name: "Loading" }).hasAttribute("data-spinner")).toBe(true);
    expectTokenClassesOnly();
  });

  it("Toast renders on the glass", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastTitle>Saved</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByText("Saved").closest('[data-slot="toast"]')?.className).toMatch(/glass/);
    expectTokenClassesOnly();
  });

  it("cn lets the later class of a group win, including the theme radii", () => {
    expect(cn("h-12 px-6", "px-0")).toBe("h-12 px-0");
    expect(cn("rounded-pill", "rounded-small")).toBe("rounded-small");
    expect(cn("bg-fill", false, "bg-accent")).toBe("bg-accent");
  });
});

describe("the package sources", () => {
  const dir = join(import.meta.dirname, "../src");
  const sources = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")] as const);

  it("contain no literal colour and no default-palette class", () => {
    const offenders = sources.filter(([, text]) => /#[0-9a-f]{3,8}\b/i.test(text) || HARD_CODED_COLOUR.test(text));
    expect(offenders.map(([name]) => name)).toEqual([]);
  });

  /** An app, Next, next-intl, the catalogues, the search model, the API client, the test kit, Telegram. */
  const FORBIDDEN_IMPORT =
    /from\s+["'](?:@\/|\.\.\/\.\.\/(?:app|landing|arm)|next\/|next["']|next-intl|@homi\/(?:testing|i18n|search|api-client))|window\.Telegram/;

  it("import nothing from an app, Next, the catalogues, search or the API, and nothing about Telegram", () => {
    const caught = [
      'from "next"',
      'from "next/navigation"',
      'from "next-intl"',
      'from "@homi/i18n/format"',
      'from "@homi/search"',
      'from "@homi/api-client"',
      'from "@homi/testing"',
      "window.Telegram",
    ];
    const allowed = ['from "react"', 'from "lucide-react"', 'from "./Button"'];
    expect(caught.filter((line) => !FORBIDDEN_IMPORT.test(line))).toEqual([]);
    expect(allowed.filter((line) => FORBIDDEN_IMPORT.test(line))).toEqual([]);

    const offenders = sources.filter(([, text]) => FORBIDDEN_IMPORT.test(text));
    expect(offenders.map(([name]) => name)).toEqual([]);
  });
});
