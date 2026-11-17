import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PHOTO_SIZES } from "@/features/feed/images";
import { Photo } from "@/features/feed/Photo";
import { PhotoStrip, type PhotoStripProps } from "@/features/feed/PhotoStrip";
import { firstContentShown, resetFirstContent } from "@/lib/analytics/firstContent";

const PHOTOS = [1, 2, 3].map((index) => `https://cdn.homi.loc/stub/100001/${index}.jpg?e=0&s=stub`);
const SMALL = "https://cdn.homi.loc/stub/100001/1.s.jpg?e=0&s=stub";

function tree(props: Partial<PhotoStripProps> = {}) {
  return (
    <div className="relative">
      <PhotoStrip photos={PHOTOS} dots sizes={PHOTO_SIZES} {...props} />
    </div>
  );
}

function strip(props: Partial<PhotoStripProps> = {}) {
  return render(tree(props));
}

type FakeConnection = EventTarget & { saveData?: boolean; effectiveType?: string };

/** `navigator.connection` of Chromium: its values, and `change` when they move. */
function stubConnection(values: { saveData?: boolean; effectiveType?: string }): FakeConnection {
  const connection: FakeConnection = Object.assign(new EventTarget(), values);
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  return connection;
}

/** Lets every queued promise reaction run (a macrotask after them). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const scroller = () => document.querySelector<HTMLElement>("[data-scroll-x]")!;
const mounted = () => [...document.querySelectorAll("[data-slide]")].map((slide) => slide.querySelector("img") !== null);
const activeDot = () => [...document.querySelectorAll("[data-dots] > span")].findIndex((dot) => dot.hasAttribute("data-on"));

/** Lays the strip out as a browser would: `width` px per slide, scrolled to `left`. */
function scrollTo(element: HTMLElement, left: number, width = 300) {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(element, "scrollLeft", { configurable: true, value: left });
  fireEvent.scroll(element);
}

/** What `img.complete` and `naturalWidth` report for a photo the browser settled before hydration. */
function settledImages(naturalWidth: number): () => void {
  const proto = HTMLImageElement.prototype;
  const complete = Object.getOwnPropertyDescriptor(proto, "complete")!;
  const width = Object.getOwnPropertyDescriptor(proto, "naturalWidth")!;
  Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => naturalWidth });
  return () => {
    Object.defineProperty(proto, "complete", complete);
    Object.defineProperty(proto, "naturalWidth", width);
  };
}

afterEach(() => {
  cleanup();
  resetFirstContent();
  document.documentElement.classList.remove("lite");
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe("PhotoStrip (SCR-007)", () => {
  it("mounts the first slide only; a pointer-down mounts the next", () => {
    strip();
    expect(mounted()).toEqual([true, false, false]);

    fireEvent.pointerDown(scroller());

    expect(mounted()).toEqual([true, true, false]);
  });

  it("a scroll moves the active dot and mounts the slide after it; seen slides stay", () => {
    strip();

    scrollTo(scroller(), 300);
    expect(activeDot()).toBe(1);
    expect(mounted()).toEqual([true, true, true]);

    scrollTo(scroller(), 0);
    expect(activeDot()).toBe(0);
    expect(mounted()).toEqual([true, true, true]);
  });

  it("ignores a scroll before layout (no width to divide by)", () => {
    strip();

    scrollTo(scroller(), 0, 0);

    expect(activeDot()).toBe(0);
    expect(mounted()).toEqual([true, false, false]);
  });

  it("dots one per photo of the strip, only with more than one photo and only when asked", () => {
    strip();
    expect(document.querySelectorAll("[data-dots] > span")).toHaveLength(3);
    cleanup();

    strip({ photos: PHOTOS.slice(0, 1) });
    expect(document.querySelector("[data-dots]")).toBeNull();
    cleanup();

    strip({ dots: false });
    expect(document.querySelector("[data-dots]")).toBeNull();
  });

  it("keeps a sideways swipe inside the strip (swipe back and sheet drag read these)", () => {
    strip();

    expect(scroller().hasAttribute("data-scroll-x")).toBe(true);
    expect(scroller().hasAttribute("data-no-swipe")).toBe(true);
  });

  it("without photos: the placeholder alone", () => {
    strip({ photos: [] });

    expect(document.querySelector('[data-photo="placeholder"]')).not.toBeNull();
    expect(document.querySelector("[data-scroll-x]")).toBeNull();
  });

  it("a video strip: ▶ is a mark hidden from assistive technology, not an image with an action's name", () => {
    strip({ video: true });

    const mark = document.querySelector("[data-video]")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.hasAttribute("role")).toBe(false);
    expect(mark.hasAttribute("aria-label")).toBe(false);
  });

  it("in a video slide a failed photo's placeholder is positioned after the blurred copy, so it paints over it", () => {
    strip({ video: true });

    fireEvent.error(document.querySelector('[data-slide="0"] img:not([aria-hidden])')!);

    const backdrop = document.querySelector('[data-slide="0"] img[aria-hidden]')!;
    const placeholder = document.querySelector('[data-slide="0"] [data-photo="placeholder"]')!;
    expect(placeholder.className.split(" ")).toContain("relative");
    expect(backdrop.compareDocumentPosition(placeholder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a new address after a failure is a new photo; the same address is not tried again", () => {
    const view = strip();
    fireEvent.error(document.querySelector("img")!);

    view.rerender(tree());
    expect(document.querySelector('[data-slide="0"] img')).toBeNull();

    const resigned = PHOTOS.map((photo) => photo.replace("e=0", "e=1"));
    view.rerender(tree({ photos: resigned }));
    expect(document.querySelector('[data-slide="0"] img')?.getAttribute("src")).toBe(resigned[0]);
  });

  it("only the first photo of an eager strip is eager", () => {
    strip({ eager: true });
    fireEvent.pointerDown(scroller());

    const images = document.querySelectorAll("img");
    expect(images[0].getAttribute("loading")).toBe("eager");
    expect(images[0].getAttribute("fetchpriority")).toBe("high");
    expect(images[1].getAttribute("loading")).toBe("lazy");
  });

  it("the card's slides are plain boxes, not buttons", () => {
    strip();

    expect(document.querySelectorAll("button[data-slide]")).toHaveLength(0);
    expect(document.querySelectorAll("div[data-slide]")).toHaveLength(3);
  });
});

describe("PhotoStrip of the listing's hero (WP-26)", () => {
  /** jsdom lays nothing out: every element of the strip is `width` px wide from the start. */
  function laidOut(width: number): () => void {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth")!;
    Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => width });
    return () => Object.defineProperty(Element.prototype, "clientWidth", descriptor);
  }

  it("starts at initialIndex: scrolled there before the first paint, that slide and the ones before it mounted", () => {
    const restore = laidOut(300);
    try {
      strip({ initialIndex: 2 });
    } finally {
      restore();
    }

    expect(scroller().scrollLeft).toBe(600);
    expect(activeDot()).toBe(2);
    expect(mounted()).toEqual([true, true, true]);
  });

  it("an eager strip started further on loads that slide first", () => {
    strip({ initialIndex: 1, eager: true });

    const images = document.querySelectorAll("img");
    expect(images[0].getAttribute("loading")).toBe("lazy");
    expect(images[1].getAttribute("loading")).toBe("eager");
  });

  it("an initialIndex past the end is the last slide", () => {
    strip({ initialIndex: 9 });

    expect(activeDot()).toBe(2);
  });

  it("reports the slide it settles on after a scroll", () => {
    const onActiveChange = vi.fn();
    strip({ onActiveChange });

    scrollTo(scroller(), 0, 0);
    expect(onActiveChange).not.toHaveBeenCalled();

    scrollTo(scroller(), 600);
    expect(onActiveChange).toHaveBeenLastCalledWith(2);
  });

  it("with onPhotoTap every slide is a named button that reports its index", () => {
    const onPhotoTap = vi.fn();
    strip({ onPhotoTap, tapLabel: "Фото" });

    const slides = document.querySelectorAll<HTMLButtonElement>("button[data-slide]");
    expect(slides).toHaveLength(3);
    expect(slides[1].getAttribute("type")).toBe("button");
    expect(slides[1].getAttribute("aria-label")).toBe("Фото");

    fireEvent.click(slides[1]);
    expect(onPhotoTap).toHaveBeenCalledWith(1);
    expect(scroller().hasAttribute("data-no-swipe")).toBe(true);
  });
});

describe("Photo (BR-APP-059)", () => {
  it("offers 480w and 800w with the card's sizes, no referrer and async decoding", () => {
    strip();

    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(PHOTOS[0]);
    expect(img.getAttribute("srcset")).toBe(`${SMALL} 480w, ${PHOTOS[0]} 800w`);
    expect(img.getAttribute("sizes")).toBe(PHOTO_SIZES);
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("alt")).toBe("");
  });

  it("lite graphics: the small variant only", () => {
    document.documentElement.classList.add("lite");
    strip();

    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SMALL);
    expect(img.hasAttribute("srcset")).toBe(false);
  });

  it.each([
    ["Save-Data", { saveData: true }],
    ["3g", { effectiveType: "3g" }],
  ])("%s: the small variant only", (_name, connection) => {
    stubConnection(connection);
    strip();

    expect(document.querySelector("img")?.getAttribute("src")).toBe(SMALL);
  });

  it("a connection that drops to 3g switches to the small variant", () => {
    const connection = stubConnection({ effectiveType: "4g" });
    strip();
    expect(document.querySelector("img")?.hasAttribute("srcset")).toBe(true);

    act(() => {
      connection.effectiveType = "3g";
      connection.dispatchEvent(new Event("change"));
    });

    expect(document.querySelector("img")?.getAttribute("src")).toBe(SMALL);
    expect(document.querySelector("img")?.hasAttribute("srcset")).toBe(false);
  });

  it("an address of another form is used as it is", () => {
    strip({ photos: ["https://example.org/photo.webp?x=1"] });

    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://example.org/photo.webp?x=1");
    expect(img.hasAttribute("srcset")).toBe(false);
  });

  it("fades in once loaded and marks the first content", async () => {
    let shown = false;
    void firstContentShown().then(() => {
      shown = true;
    });
    strip();
    const img = document.querySelector("img")!;
    expect(img.className).toContain("opacity-0");
    await act(flush);
    expect(shown).toBe(false);

    fireEvent.load(img);
    await act(async () => {});

    expect(img.className).toContain("opacity-100");
    expect(shown).toBe(true);
  });

  it("an eager photo is not faded: visible as soon as the browser paints it", () => {
    render(<Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} eager />);

    const classes = document.querySelector("img")!.className.split(" ");
    expect(classes).toContain("opacity-100");
    expect(classes).not.toContain("opacity-0");
  });

  it("a failed photo becomes the placeholder and is not tried again", () => {
    strip();

    fireEvent.error(document.querySelector("img")!);

    expect(document.querySelector('[data-slide="0"] [data-photo="placeholder"]')).not.toBeNull();
    expect(document.querySelector('[data-slide="0"] img')).toBeNull();
  });

  it("a photo that loaded before hydration is shown at once and marks the first content", async () => {
    const restore = settledImages(800);
    let shown = false;
    void firstContentShown().then(() => {
      shown = true;
    });
    try {
      render(<Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} />);
      await act(async () => {});
    } finally {
      restore();
    }

    expect(document.querySelector("img")?.className).toContain("opacity-100");
    expect(shown).toBe(true);
  });

  it("a photo that failed before hydration is the placeholder", () => {
    const restore = settledImages(0);
    try {
      render(<Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} />);
    } finally {
      restore();
    }

    expect(document.querySelector('[data-photo="placeholder"]')).not.toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("no address: the placeholder", () => {
    render(<Photo src={null} />);

    expect(document.querySelector('[data-photo="placeholder"]')).not.toBeNull();
  });
});

describe("Photo: the server render and hydration (BR-APP-059)", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  /** The server's HTML in a container, as the browser parsed it before hydration. */
  function serverHtml(element: ReactElement): HTMLElement {
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    return container;
  }

  it("without a hint the server offers the full set; a 3g client hydrates without a mismatch, then asks for the small variant", async () => {
    stubConnection({ effectiveType: "3g" });
    const element = <Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} eager />;
    const container = serverHtml(element);
    const before = container.querySelector("img")!;
    expect(before.getAttribute("src")).toBe(PHOTOS[0]);
    expect(before.getAttribute("srcset")).toBe(`${SMALL} 480w, ${PHOTOS[0]} 800w`);
    expect(before.className).toContain("opacity-100");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(errors).not.toHaveBeenCalled();
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SMALL);
    expect(img.hasAttribute("srcset")).toBe(false);
  });

  it("with the server's hint the HTML already asks for the small variant only, and hydration keeps it", async () => {
    stubConnection({ saveData: true });
    const element = <Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} eager serverSmallOnly />;
    const container = serverHtml(element);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(SMALL);
    expect(container.querySelector("img")?.hasAttribute("srcset")).toBe(false);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(SMALL);
    expect(container.querySelector("img")?.hasAttribute("srcset")).toBe(false);
  });

  it("the hint only seeds the server and hydration renders: a fast client switches back to the full set", async () => {
    stubConnection({ effectiveType: "4g" });
    const element = <Photo src={PHOTOS[0]} sizes={PHOTO_SIZES} serverSmallOnly />;
    const container = serverHtml(element);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("srcset")).toBe(`${SMALL} 480w, ${PHOTOS[0]} 800w`);
  });
});
