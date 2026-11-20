import { getMessages } from "@homi/i18n";
import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("@/lib/navigation/useBack", () => ({ useBack: () => ({ canGoBack: true, back: state.back }) }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
/** The address the route reads is the document's; paging changes it with `replaceState`. */
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { listingKey } from "@/features/listing/listingData";
import { ListingLayerContext } from "@/features/listing/useListing";
import { PhotoViewer, type PhotoViewerProps } from "@/features/listing/viewer/PhotoViewer";
import { PhotoViewerRoute } from "@/features/listing/viewer/PhotoViewerRoute";
import { ZoomableImage, type ZoomableImageProps } from "@/features/listing/viewer/ZoomableImage";
import { resetPreviews, setPreview } from "@/lib/data/previewCache";
import { resetResources, seedResource } from "@/lib/data/useResource";
import { depth, resetDepth, stack } from "@/lib/navigation/history";

import { detailsOf } from "../helpers/details";
import { previewOf } from "../helpers/listing";

const PHOTOS = detailsOf().photos.items;
const WIDTH = 390;
const HEIGHT = 800;

let fake: FakeTelegram | null = null;
const haptics = () =>
  (fake?.calls ?? []).filter((entry) => entry.member.startsWith("HapticFeedback")).map((entry) => `${entry.member}(${String(entry.args[0])})`);

beforeEach(() => {
  state.back.mockReset();
  fake = fakeTelegram({ version: "8.0" });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(WIDTH);
  // Every element is a 390 × 800 slide at the page's origin, so a tap's offset from the centre (195, 400) is known.
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(HEIGHT);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    right: WIDTH,
    bottom: HEIGHT,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
  window.history.replaceState(null, "", "/ru/listing/100001/photos?i=2");
  resetDepth("/ru/listing/100001/photos?i=2");
});

afterEach(() => {
  cleanup();
  resetResources();
  resetPreviews();
  fake?.uninstall();
  fake = null;
  document.body.className = "";
});

function intl(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="ru" messages={getMessages("ru")} timeZone="Asia/Tashkent">
      {children}
    </NextIntlClientProvider>
  );
}

function viewer(props: Partial<PhotoViewerProps> = {}) {
  return <PhotoViewer photos={PHOTOS} index={2} onIndexChange={vi.fn()} onClose={vi.fn()} {...props} />;
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][data-route="listing/photos"]');
const strip = () => document.querySelector<HTMLElement>("[data-viewer-strip]")!;
const counter = () => document.querySelector("[data-viewer-counter]")?.textContent ?? null;
/** The zoomable box of slide `index` (it holds the touch listeners) and its transformed layer. */
const box = (index: number) => document.querySelector<HTMLElement>(`[data-viewer-slide="${index}"] [data-zoom]`)!;
const layer = (index: number) => document.querySelector<HTMLElement>(`[data-viewer-slide="${index}"] [data-zoom-layer]`)!;

type Point = { x: number; y: number };
type TouchType = "touchstart" | "touchmove" | "touchend" | "touchcancel";

/**
 * A touch event with `points` down and `changed` the fingers that moved or lifted; jsdom has no `Touch` constructor.
 * The listeners are native, so the state they set is flushed with `act`.
 */
function touch(target: Element, type: TouchType, points: Point[], changed: Point[] = points): void {
  const list = (from: Point[]) =>
    from.map((point, identifier) => ({ identifier, target, clientX: point.x, clientY: point.y }) as unknown as Touch);
  act(() => {
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list(points), changedTouches: list(changed) }));
  });
}

function tap(target: Element, point: Point = { x: 100, y: 200 }): void {
  touch(target, "touchstart", [point]);
  touch(target, "touchend", [], [point]);
}

/** One finger from (200, 300) to (200 + dx, 300 + dy), through a first move past the 8 px slop, then lifted. */
function drag(target: Element, dx: number, dy: number, { release = true }: { release?: boolean } = {}): void {
  touch(target, "touchstart", [{ x: 200, y: 300 }]);
  touch(target, "touchmove", [{ x: 200 + Math.sign(dx) * 12, y: 300 + Math.sign(dy) * 12 }]);
  touch(target, "touchmove", [{ x: 200 + dx, y: 300 + dy }]);
  if (release) {
    touch(target, "touchend", [], [{ x: 200 + dx, y: 300 + dy }]);
  }
}

const scaleOf = (element: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(element.style.transform)?.[1] ?? "1");
/** The horizontal offset of `translate(x[, y])`. */
const offsetX = (element: HTMLElement) => Number(/translate\((-?[\d.]+)px/.exec(element.style.transform)?.[1] ?? "0");
/** The vertical offset of `translate(x[, y])`; jsdom writes `translate(0px, 0px)` back as `translate(0px)`. */
const offsetY = (element: HTMLElement) => Number(/translate\([^,)]+(?:,\s*(-?[\d.]+)px)?\)/.exec(element.style.transform)?.[1] ?? "0");
const dragVar = () => dialog()?.style.getPropertyValue("--drag") ?? "";

describe("PhotoViewer (WP-26, SCR-020)", () => {
  it("opens as a dialog «Фото» in a portal at the end of body, at the start index, with the counter", () => {
    const { container } = render(intl(viewer()));

    expect(dialog()).not.toBeNull();
    expect(container.contains(dialog())).toBe(false);
    expect(dialog()?.parentElement).toBe(document.body);
    expect(screen.getByRole("dialog", { name: "Фото" }).getAttribute("aria-modal")).toBe("true");
    expect(strip().scrollLeft).toBe(2 * WIDTH);
    expect(counter()).toBe("3 / 8");
    expect(document.querySelectorAll("[data-viewer-slide]")).toHaveLength(8);
    expect(document.activeElement).toBe(dialog());
  });

  it("holds an image only in the shown slide and its neighbours, full size and without a referrer", () => {
    render(intl(viewer()));

    const images = [...document.querySelectorAll<HTMLImageElement>("[data-viewer-slide] img")];
    expect(images.map((image) => image.closest("[data-viewer-slide]")?.getAttribute("data-viewer-slide"))).toEqual(["1", "2", "3"]);
    expect(images[1].getAttribute("src")).toBe(PHOTOS[2]);
    expect(images[1].hasAttribute("srcset")).toBe(false);
    expect(images[1].getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(images[1].getAttribute("draggable")).toBe("false");
    expect(images[1].className).toContain("object-contain");
  });

  it("one photo: no counter; no photos: the dialog with an empty strip and the ×", () => {
    const { rerender } = render(intl(viewer({ photos: PHOTOS.slice(0, 1), index: 0 })));
    expect(counter()).toBeNull();
    expect(document.querySelectorAll("[data-viewer-slide]")).toHaveLength(1);

    rerender(intl(viewer({ photos: [], index: 0 })));
    expect(dialog()).not.toBeNull();
    expect(document.querySelectorAll("[data-viewer-slide]")).toHaveLength(0);
    expect(counter()).toBeNull();
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeTruthy();
  });

  it("body carries `locked` while open", () => {
    const { unmount } = render(intl(viewer()));
    expect(document.body.classList.contains("locked")).toBe(true);

    unmount();
    expect(document.body.classList.contains("locked")).toBe(false);
  });

  it("× and Escape close", () => {
    const onClose = vi.fn();
    render(intl(viewer({ onClose })));

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.keyDown(dialog()!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("paging reports the new photo and moves the counter; the image window follows", () => {
    const onIndexChange = vi.fn();
    render(intl(viewer({ onIndexChange })));

    strip().scrollLeft = 3 * WIDTH;
    fireEvent.scroll(strip());
    expect(onIndexChange).toHaveBeenCalledWith(3);
    expect(counter()).toBe("4 / 8");
    const shown = [...document.querySelectorAll("[data-viewer-slide] img")].map((image) => image.closest("[data-viewer-slide]")?.getAttribute("data-viewer-slide"));
    expect(shown).toEqual(["2", "3", "4"]);

    // A scroll that stays on the same photo reports nothing.
    fireEvent.scroll(strip());
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });

  it("a set that grows while open (preview → full) still opens at the asked photo; after a page the scroll is the user's", () => {
    const { rerender } = render(intl(viewer({ photos: PHOTOS.slice(0, 3), index: 2 })));
    expect(counter()).toBe("3 / 3");

    rerender(intl(viewer({ photos: PHOTOS, index: 5 })));
    expect(strip().scrollLeft).toBe(5 * WIDTH);
    expect(counter()).toBe("6 / 8");

    strip().scrollLeft = 4 * WIDTH;
    fireEvent.scroll(strip());
    rerender(intl(viewer({ photos: PHOTOS, index: 1 })));
    expect(strip().scrollLeft).toBe(4 * WIDTH);
    expect(counter()).toBe("5 / 8");
  });

  it("a swipe down past 110 px fades through --drag, plays the light haptic and closes", () => {
    const onClose = vi.fn();
    render(intl(viewer({ onClose })));

    drag(box(2), 0, 137.5, { release: false });
    expect(dragVar()).toBe("0.5");
    expect(offsetY(layer(2))).toBe(137.5);
    expect(onClose).not.toHaveBeenCalled();

    touch(box(2), "touchend", [], [{ x: 200, y: 437.5 }]);
    expect(haptics()).toEqual(["HapticFeedback.impactOccurred(light)"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a swipe down of 110 px or less springs back: no haptic, no close, --drag back to 0", () => {
    const onClose = vi.fn();
    render(intl(viewer({ onClose })));

    drag(box(2), 0, 110);
    expect(onClose).not.toHaveBeenCalled();
    expect(haptics()).toEqual([]);
    expect(dragVar()).toBe("0");
    expect(offsetY(layer(2))).toBe(0);
  });

  it("a sideways or upward drag at 1× is not a close", () => {
    const onClose = vi.fn();
    render(intl(viewer({ onClose })));

    drag(box(2), 160, 40);
    drag(box(2), 0, -200);
    expect(onClose).not.toHaveBeenCalled();
    expect(dragVar()).toBe("");
  });

  it("LB-APP-004: an onClose passed after mount is the one the swipe calls", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(intl(viewer({ onClose: first })));
    rerender(intl(viewer({ onClose: second })));

    drag(box(2), 0, 200);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a double tap zooms to 2.5× and locks the strip; another double tap goes back to 1× and unlocks it", () => {
    render(intl(viewer()));

    tap(box(2));
    tap(box(2));
    expect(scaleOf(layer(2))).toBe(2.5);
    expect(strip().className).toContain("overflow-x-hidden");

    tap(box(2));
    tap(box(2));
    expect(scaleOf(layer(2))).toBe(1);
    expect(strip().className).toContain("overflow-x-auto");
  });

  it("a double tap zooms around the tapped point, not the centre of the slide", () => {
    render(intl(viewer()));

    // 100 px right of the centre: that point stays under the finger, 100 − 100 × 2.5 = −150.
    tap(box(2), { x: 295, y: 400 });
    tap(box(2), { x: 295, y: 400 });
    expect(scaleOf(layer(2))).toBe(2.5);
    expect(offsetX(layer(2))).toBe(-150);
    expect(offsetY(layer(2))).toBe(0);
  });

  it("a zoomed photo pans with the finger only as far as its edges", () => {
    render(intl(viewer()));
    tap(box(2), { x: 195, y: 400 });
    tap(box(2), { x: 195, y: 400 });
    expect(offsetX(layer(2))).toBe(0);

    // At 2.5× the photo overhangs the slide by 390 × 1.5 / 2 sideways and 800 × 1.5 / 2 up and down.
    drag(box(2), 1000, 0);
    expect(offsetX(layer(2))).toBe(292.5);
    expect(offsetY(layer(2))).toBe(0);

    drag(box(2), 0, 1000);
    expect(offsetX(layer(2))).toBe(292.5);
    expect(offsetY(layer(2))).toBe(600);
    expect(scaleOf(layer(2))).toBe(2.5);
  });

  it("two taps 300 ms apart, or 30 px apart, are not a double tap; a swipe down while zoomed does not close", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const onClose = vi.fn();
      render(intl(viewer({ onClose })));

      tap(box(2));
      vi.advanceTimersByTime(300);
      tap(box(2));
      expect(scaleOf(layer(2))).toBe(1);

      vi.advanceTimersByTime(1000);
      tap(box(2), { x: 100, y: 200 });
      tap(box(2), { x: 130, y: 200 });
      expect(scaleOf(layer(2))).toBe(1);

      vi.advanceTimersByTime(1000);
      tap(box(2), { x: 100, y: 200 });
      tap(box(2), { x: 129, y: 200 });
      expect(scaleOf(layer(2))).toBe(2.5);

      drag(box(2), 0, 200);
      expect(onClose).not.toHaveBeenCalled();
      expect(scaleOf(layer(2))).toBe(2.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a pinch zooms around the fingers and, released below 1.05×, snaps back to 1×", () => {
    render(intl(viewer()));

    touch(box(2), "touchstart", [
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ]);
    touch(box(2), "touchmove", [
      { x: 50, y: 300 },
      { x: 250, y: 300 },
    ]);
    expect(scaleOf(layer(2))).toBe(2);
    // The strip locks only once the zoom settles, not during the pinch.
    expect(strip().className).toContain("overflow-x-auto");
    touch(box(2), "touchend", [], [{ x: 50, y: 300 }, { x: 250, y: 300 }]);
    expect(scaleOf(layer(2))).toBe(2);
    expect(strip().className).toContain("overflow-x-hidden");

    touch(box(2), "touchstart", [
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ]);
    touch(box(2), "touchmove", [
      { x: 102, y: 300 },
      { x: 198, y: 300 },
    ]);
    expect(scaleOf(layer(2))).toBeCloseTo(1.92);
    touch(box(2), "touchmove", [
      { x: 125, y: 300 },
      { x: 176, y: 300 },
    ]);
    touch(box(2), "touchend", [], [{ x: 125, y: 300 }, { x: 176, y: 300 }]);
    expect(scaleOf(layer(2))).toBe(1);
    expect(strip().className).toContain("overflow-x-auto");
  });

  it("an orientation change resets the zoom", () => {
    render(intl(viewer()));
    tap(box(2));
    tap(box(2));
    expect(scaleOf(layer(2))).toBe(2.5);

    act(() => {
      window.dispatchEvent(new Event("orientationchange"));
    });
    expect(scaleOf(layer(2))).toBe(1);
    expect(strip().className).toContain("overflow-x-auto");
  });

  it("the zoom is reset when the viewer is hidden with its cached route; shown again it is at 1× and unlocked", () => {
    const { rerender } = render(intl(<Activity mode="visible">{viewer()}</Activity>));
    tap(box(2));
    tap(box(2));
    expect(scaleOf(layer(2))).toBe(2.5);

    rerender(intl(<Activity mode="hidden">{viewer()}</Activity>));
    expect(scaleOf(layer(2))).toBe(1);
    expect(document.body.classList.contains("locked")).toBe(false);

    rerender(intl(<Activity mode="visible">{viewer()}</Activity>));
    expect(scaleOf(layer(2))).toBe(1);
    expect(strip().className).toContain("overflow-x-auto");
    expect(document.body.classList.contains("locked")).toBe(true);
  });

  it("closed by a swipe and shown again from its cached route: no fade and no offset are left", () => {
    const onClose = vi.fn();
    const { rerender } = render(intl(<Activity mode="visible">{viewer({ onClose })}</Activity>));
    drag(box(2), 0, 200);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dragVar()).not.toBe("");

    rerender(intl(<Activity mode="hidden">{viewer({ onClose })}</Activity>));
    rerender(intl(<Activity mode="visible">{viewer({ onClose })}</Activity>));
    expect(dragVar()).toBe("");
    expect(offsetY(layer(2))).toBe(0);
  });

  it("shown again after it was hidden, it opens at the address's photo, not the one paged to before", () => {
    const { rerender } = render(intl(<Activity mode="visible">{viewer({ index: 2 })}</Activity>));
    strip().scrollLeft = 6 * WIDTH;
    fireEvent.scroll(strip());
    expect(counter()).toBe("7 / 8");

    rerender(intl(<Activity mode="hidden">{viewer({ index: 2 })}</Activity>));
    rerender(intl(<Activity mode="visible">{viewer({ index: 2 })}</Activity>));
    expect(strip().scrollLeft).toBe(2 * WIDTH);
    expect(counter()).toBe("3 / 8");
  });

  it("a photo that fails to load shows the placeholder; paging still works", () => {
    const onIndexChange = vi.fn();
    render(intl(viewer({ onIndexChange })));

    fireEvent.error(document.querySelector('[data-viewer-slide="2"] img')!);
    expect(document.querySelector('[data-viewer-slide="2"] [data-photo="placeholder"]')).not.toBeNull();

    strip().scrollLeft = 3 * WIDTH;
    fireEvent.scroll(strip());
    expect(onIndexChange).toHaveBeenCalledWith(3);
  });
});

describe("ZoomableImage (WP-26)", () => {
  function image(props: Partial<ZoomableImageProps> = {}) {
    return <ZoomableImage src={PHOTOS[0]} active onZoom={vi.fn()} onDrag={vi.fn()} onClose={vi.fn()} {...props} />;
  }
  const only = () => document.querySelector<HTMLElement>("[data-zoom]")!;
  const onlyLayer = () => document.querySelector<HTMLElement>("[data-zoom-layer]")!;

  it("reports a settled zoom; a zoomed slide that stops being shown is reset at once and reports 1×", () => {
    const onZoom = vi.fn();
    const { rerender } = render(image({ onZoom }));

    tap(only());
    tap(only());
    expect(onZoom).toHaveBeenLastCalledWith(true);
    expect(scaleOf(onlyLayer())).toBe(2.5);
    expect(onlyLayer().style.transition).toContain("transform 0.25s");

    rerender(image({ onZoom, active: false }));
    expect(onZoom).toHaveBeenLastCalledWith(false);
    expect(scaleOf(onlyLayer())).toBe(1);
    expect(onlyLayer().style.transition).toBe("none");
  });

  it("LB-APP-004: the onZoom and onDrag passed after mount are the ones called", () => {
    const old = { onZoom: vi.fn(), onDrag: vi.fn() };
    const next = { onZoom: vi.fn(), onDrag: vi.fn() };
    const { rerender } = render(image(old));
    rerender(image(next));

    drag(only(), 0, 50);
    tap(only());
    tap(only());
    expect(next.onDrag).toHaveBeenLastCalledWith(0);
    expect(next.onZoom).toHaveBeenCalledWith(true);
    expect(old.onZoom).not.toHaveBeenCalled();
    expect(old.onDrag).not.toHaveBeenCalled();
  });

  it("a close drag reports its progress over 275 px and 0 when it springs back", () => {
    const onDrag = vi.fn();
    render(image({ onDrag }));

    drag(only(), 0, 55);
    expect(onDrag.mock.calls.map(([progress]) => progress)).toEqual([12 / 275, 55 / 275, 0]);
  });

  it("zoomed, any second tap within 300 ms zooms back to 1×, however far from the first", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      render(image());
      tap(only());
      tap(only());
      expect(scaleOf(onlyLayer())).toBe(2.5);

      tap(only(), { x: 100, y: 200 });
      vi.advanceTimersByTime(299);
      tap(only(), { x: 350, y: 200 });
      expect(scaleOf(onlyLayer())).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the drag direction is decided once: a close drag that swings sideways still follows the finger and springs back", () => {
    const onDrag = vi.fn();
    const onClose = vi.fn();
    render(image({ onDrag, onClose }));

    touch(only(), "touchstart", [{ x: 200, y: 300 }]);
    touch(only(), "touchmove", [{ x: 200, y: 312 }]);
    touch(only(), "touchmove", [{ x: 380, y: 320 }]);
    expect(offsetY(onlyLayer())).toBe(20);

    touch(only(), "touchend", [], [{ x: 380, y: 320 }]);
    expect(onDrag.mock.calls.map(([progress]) => progress)).toEqual([12 / 275, 20 / 275, 0]);
    expect(offsetY(onlyLayer())).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the drag direction is decided once: a sideways drag that turns down is never a close", () => {
    const onDrag = vi.fn();
    const onClose = vi.fn();
    render(image({ onDrag, onClose }));

    touch(only(), "touchstart", [{ x: 200, y: 300 }]);
    touch(only(), "touchmove", [{ x: 212, y: 300 }]);
    touch(only(), "touchmove", [{ x: 212, y: 500 }]);
    touch(only(), "touchend", [], [{ x: 212, y: 500 }]);
    expect(onDrag).not.toHaveBeenCalled();
    expect(offsetY(onlyLayer())).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("settles instantly under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    render(image());

    tap(only());
    tap(only());
    expect(scaleOf(onlyLayer())).toBe(2.5);
    expect(onlyLayer().style.transition).toBe("none");
  });
});

describe("PhotoViewerRoute (WP-26)", () => {
  function route(number: number | null = 100001) {
    return render(
      intl(
        <ListingLayerContext value={{ number, scrollToTop: () => {}, reportView: () => {}, view: null, close: () => {} }}>
          <PhotoViewerRoute />
        </ListingLayerContext>,
      ),
    );
  }

  it("shows the full set of the listing's resource at `i`", async () => {
    seedResource(listingKey(100001), { listing: detailsOf(), source: "stub" });
    route();

    expect(await screen.findByRole("dialog", { name: "Фото" })).toBeTruthy();
    expect(counter()).toBe("3 / 8");
    expect(document.querySelector('[data-viewer-slide="2"] img')?.getAttribute("src")).toBe(PHOTOS[2]);
  });

  it("opens over the card's preview photos while the answer is pending (G-10)", async () => {
    setPreview(100001, previewOf({ photos: { preview: PHOTOS.slice(0, 3), count: 8, cover: null } }));
    route();

    await screen.findByRole("dialog");
    expect(document.querySelectorAll("[data-viewer-slide]")).toHaveLength(3);
    expect(counter()).toBe("3 / 3");
  });

  it("without a record or a preview the dialog still opens, empty; an `i` out of range opens the last photo", async () => {
    route(1);
    await screen.findByRole("dialog");
    expect(document.querySelectorAll("[data-viewer-slide]")).toHaveLength(0);
    cleanup();

    window.history.replaceState(null, "", "/ru/listing/100001/photos?i=99");
    seedResource(listingKey(100001), { listing: detailsOf(), source: "stub" });
    route();
    await screen.findByRole("dialog");
    expect(counter()).toBe("8 / 8");
  });

  it("paging replaces `i` in the current address with its locale segment, without a new history entry", async () => {
    seedResource(listingKey(100001), { listing: detailsOf(), source: "stub" });
    const length = window.history.length;
    route();
    await screen.findByRole("dialog");

    strip().scrollLeft = 4 * WIDTH;
    fireEvent.scroll(strip());
    expect(window.location.pathname).toBe("/ru/listing/100001/photos");
    expect(window.location.search).toBe("?i=4");
    expect(window.history.length).toBe(length);
    expect(stack()).toEqual(["/listing/100001/photos?i=4"]);
    expect(depth()).toBe(0);
  });

  it("× closes through back()", async () => {
    route();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it("an address without a valid number renders nothing", async () => {
    route(null);
    await act(() => Promise.resolve());
    expect(dialog()).toBeNull();
  });
});
