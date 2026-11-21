import { act, cleanup, render, screen } from "@testing-library/react";
import { type HTMLAttributes, type ReactNode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SubPageFrame,
  SWIPE_BACK_CLOSE_SHARE,
  SWIPE_BACK_CLOSE_VELOCITY,
  SWIPE_BACK_RESET_MS,
  SWIPE_BACK_SETTLE_MS,
  SWIPE_BACK_START_PX,
  type SwipeBackOptions,
  useSwipeBack,
} from "../src/index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Screen width of these tests: a third of it is 99 px. */
const WIDTH = 300;
const START_X = 20;

type TouchType = "touchstart" | "touchmove" | "touchend" | "touchcancel";

/** A touch event at `x`, `y` with `fingers` fingers down; jsdom has no `Touch` constructor, so points are plain. */
function touch(target: Element, type: TouchType, x = START_X, y = 300, fingers = 1): TouchEvent {
  const point = { identifier: 0, target, clientX: x, clientY: y } as unknown as Touch;
  const touches = type === "touchend" || type === "touchcancel" ? [] : Array.from({ length: fingers }, () => point);
  const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: [point] });
  target.dispatchEvent(event);
  return event;
}

/** A rightward swipe of `distance` px that lasts `ms` from the first touch to the release. */
function swipe(target: Element, distance: number, ms: number): void {
  touch(target, "touchstart");
  touch(target, "touchmove", START_X + SWIPE_BACK_START_PX);
  vi.advanceTimersByTime(ms);
  touch(target, "touchmove", START_X + distance);
  touch(target, "touchend");
}

function stubReducedMotion(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
}

function Layer({ onBack, children, ...options }: SwipeBackOptions & { onBack: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipeBack(ref, onBack, options);
  return (
    <div ref={ref} data-testid="layer">
      {children}
      <p>content</p>
    </div>
  );
}

describe("useSwipeBack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("innerWidth", WIDTH);
  });

  it("keeps the legacy constants (03 §3.4)", () => {
    expect([SWIPE_BACK_START_PX, SWIPE_BACK_CLOSE_SHARE, SWIPE_BACK_CLOSE_VELOCITY, SWIPE_BACK_SETTLE_MS]).toEqual([
      10, 0.33, 0.5, 180,
    ]);
  });

  it("follows the finger from 10 px only, and keeps the page from scrolling then", () => {
    const onSwipeStart = vi.fn();
    render(<Layer onBack={vi.fn()} onSwipeStart={onSwipeStart} />);
    const layer = screen.getByTestId("layer");

    touch(layer, "touchstart");
    const early = touch(layer, "touchmove", START_X + 9);
    expect(layer.style.transform).toBe("");
    expect(early.defaultPrevented).toBe(false);
    expect(onSwipeStart).not.toHaveBeenCalled();
    expect(layer.style.animation).toBe("");

    const started = touch(layer, "touchmove", START_X + 10);
    expect(layer.style.transform).toBe("translateX(10px)");
    expect(layer.hasAttribute("data-swiping")).toBe(true);
    expect(started.defaultPrevented).toBe(true);
    // A swipe in the first 250 ms would otherwise lose to the entrance, which overrides the inline transform.
    expect(layer.style.animation).toContain("none");

    touch(layer, "touchmove", START_X + 40);
    expect(layer.style.transform).toBe("translateX(40px)");
    expect(onSwipeStart).toHaveBeenCalledTimes(1);
  });

  it("never takes a leftward or a mostly vertical swipe", () => {
    render(<Layer onBack={vi.fn()} />);
    const layer = screen.getByTestId("layer");

    touch(layer, "touchstart");
    touch(layer, "touchmove", START_X - 12);
    touch(layer, "touchmove", START_X + 200);
    expect(layer.style.transform).toBe("");
    touch(layer, "touchend");

    touch(layer, "touchstart");
    touch(layer, "touchmove", START_X + 12, 300 + 10);
    touch(layer, "touchmove", START_X + 200, 300 + 10);
    expect(layer.style.transform).toBe("");
  });

  it("released past a third of the width, slides out over 180 ms and then calls onBack once", () => {
    const onBack = vi.fn();
    const onCommit = vi.fn();
    render(<Layer onBack={onBack} onCommit={onCommit} />);
    const layer = screen.getByTestId("layer");

    // 100 px in 2 s: 0.05 px/ms, so only the distance (more than 99 px) closes it.
    swipe(layer, 100, 2000);
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The swipe is the layer's way out: the mark tells the leave to play nothing on top of it (WP-39).
    expect(layer.hasAttribute("data-gone")).toBe(true);
    expect(layer.style.transform).toBe(`translateX(${WIDTH}px)`);
    expect(layer.style.transition).toContain(`${SWIPE_BACK_SETTLE_MS}ms`);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS - 1);
    expect(onBack).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBack).toHaveBeenCalledTimes(1);

    // The layer stays out for 300 ms and ignores touches meanwhile (WP-82)…
    swipe(layer, 150, 50);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(layer.style.transform).toBe(`translateX(${WIDTH}px)`);
    // …then its inline styles go, so a layer kept mounted (`<Activity>`) shows in place next time.
    vi.advanceTimersByTime(SWIPE_BACK_RESET_MS - 50 - SWIPE_BACK_SETTLE_MS);
    expect(layer.style.transform).toBe("");
    expect(layer.style.transition).toBe("");
    expect(layer.hasAttribute("data-gone")).toBe(false);
  });

  it("a touch inside a nested sub-page is that page's swipe, never this layer's (WP-82)", () => {
    const onBack = vi.fn();
    render(
      <Layer onBack={onBack}>
        <div data-slot="subpage" data-testid="nested">
          <p>requests</p>
        </div>
      </Layer>,
    );
    swipe(screen.getByTestId("nested"), 150, 2000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("layer").style.transform).toBe("");
  });

  it("a fast short swipe closes by its speed; the same swipe slower does not", () => {
    const fast = vi.fn();
    render(<Layer onBack={fast} />);
    // 60 px in 100 ms: 0.6 px/ms.
    swipe(screen.getByTestId("layer"), 60, 100);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(fast).toHaveBeenCalledTimes(1);
    cleanup();

    const slow = vi.fn();
    render(<Layer onBack={slow} />);
    // 60 px in 150 ms: 0.4 px/ms.
    swipe(screen.getByTestId("layer"), 60, 150);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(slow).not.toHaveBeenCalled();
  });

  it("below both thresholds slides back over 180 ms and leaves no inline style", () => {
    const onBack = vi.fn();
    const onCommit = vi.fn();
    render(<Layer onBack={onBack} onCommit={onCommit} />);
    const layer = screen.getByTestId("layer");

    // 90 px in 1 s: under 99 px and under 0.5 px/ms.
    swipe(layer, 90, 1000);
    expect(layer.style.transform).toBe("translateX(0px)");
    expect(layer.style.transition).toContain(`${SWIPE_BACK_SETTLE_MS}ms`);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(layer.style.transform).toBe("");
    expect(layer.style.transition).toBe("");
    expect(layer.hasAttribute("data-swiping")).toBe(false);
    expect(layer.hasAttribute("data-gone")).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();

    // Ready for the next swipe.
    swipe(layer, 150, 1000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a cancelled touch or a second finger never closes", () => {
    const onBack = vi.fn();
    render(<Layer onBack={onBack} />);
    const layer = screen.getByTestId("layer");

    touch(layer, "touchstart");
    touch(layer, "touchmove", START_X + 200);
    touch(layer, "touchcancel");
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(layer.style.transform).toBe("");

    touch(layer, "touchstart");
    touch(layer, "touchmove", START_X + 200);
    touch(layer, "touchstart", START_X + 200, 300, 2);
    touch(layer, "touchend");
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(layer.style.transform).toBe("");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("edgeOnly (WP-81): a swipe starts only within the left 24 px, even over a map; the layer is marked", () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    render(
      <Layer onBack={onBack} edgeOnly>
        <div data-map="" data-testid="map" />
      </Layer>,
    );
    const layer = screen.getByTestId("layer");
    const map = screen.getByTestId("map");
    expect(layer.hasAttribute("data-edge-swipe")).toBe(true);

    // From the middle of the map: the map's own gesture.
    touch(map, "touchstart", 150);
    touch(map, "touchmove", 150 + SWIPE_BACK_START_PX);
    touch(map, "touchmove", 280);
    touch(map, "touchend");
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(onBack).not.toHaveBeenCalled();

    // From the edge, over the same map: the layer's.
    swipe(map, 200, 100);
    act(() => vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("enabled = false attaches nothing", () => {
    const onBack = vi.fn();
    render(<Layer onBack={onBack} enabled={false} />);
    const layer = screen.getByTestId("layer");

    touch(layer, "touchstart");
    const move = touch(layer, "touchmove", START_X + 200);
    touch(layer, "touchend");
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(move.defaultPrevented).toBe(false);
    expect(layer.style.transform).toBe("");
    expect(onBack).not.toHaveBeenCalled();
  });

  /** A container with `props` and, nested in it, the element the touch starts on. */
  const around = (props: HTMLAttributes<HTMLDivElement> & { [data: `data-${string}`]: string }) => (
    <div {...props}>
      <span data-testid="start">inside</span>
    </div>
  );

  it.each([
    ["[data-no-swipe]", around({ "data-no-swipe": "" })],
    ["[data-scroll-x]", around({ "data-scroll-x": "" })],
    ["an input", <input key="input" data-testid="start" />],
    ["a textarea", <textarea key="textarea" data-testid="start" />],
    ["a select", <select key="select" data-testid="start" />],
    ["editable text", around({ contentEditable: true, suppressContentEditableWarning: true })],
    ["a MapLibre map", around({ className: "maplibregl-map" })],
    ["a marked map", around({ "data-map": "" })],
  ])("never starts inside %s", (_name, child) => {
    const onBack = vi.fn();
    render(<Layer onBack={onBack}>{child}</Layer>);

    swipe(screen.getByTestId("start"), 200, 100);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(screen.getByTestId("layer").style.transform).toBe("");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("calls the onBack passed after mount, not the first one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Layer onBack={first} />);
    rerender(<Layer onBack={second} />);

    swipe(screen.getByTestId("layer"), 150, 1000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("settles at once under prefers-reduced-motion", () => {
    stubReducedMotion();
    const onBack = vi.fn();
    render(<Layer onBack={onBack} />);
    const layer = screen.getByTestId("layer");

    swipe(layer, 90, 1000);
    expect(layer.style.transform).toBe("");
    expect(layer.hasAttribute("data-swiping")).toBe(false);

    swipe(layer, 150, 1000);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(layer.style.transform).toBe(`translateX(${WIDTH}px)`);
    expect(layer.style.transition).toBe("none");
  });

  it("unmounting during the slide drops onBack and removes the inline styles", () => {
    const onBack = vi.fn();
    const { unmount } = render(<Layer onBack={onBack} />);
    const layer = screen.getByTestId("layer");

    swipe(layer, 150, 1000);
    unmount();
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).not.toHaveBeenCalled();
    expect(layer.style.transform).toBe("");
    expect(layer.hasAttribute("data-swiping")).toBe(false);
    // A layer hidden with its cached route and shown again slides in anew.
    expect(layer.style.animation).toBe("");
  });
});

interface FakeObserver {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  targets: Element[];
  disconnected: boolean;
}

/** IntersectionObserver is absent from jsdom: a stub that records itself and is triggered by hand. */
function stubIntersectionObserver(): FakeObserver[] {
  const observers: FakeObserver[] = [];
  class FakeIntersectionObserver {
    private readonly record: FakeObserver;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = { callback, options, targets: [], disconnected: false };
      observers.push(this.record);
    }

    observe(target: Element): void {
      this.record.targets.push(target);
    }

    unobserve(): void {}

    disconnect(): void {
      this.record.disconnected = true;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  return observers;
}

function intersect(observer: FakeObserver, isIntersecting: boolean): void {
  const entry = { isIntersecting, target: observer.targets[0] } as IntersectionObserverEntry;
  act(() => observer.callback([entry], {} as IntersectionObserver));
}

const header = () => document.querySelector('[data-slot="subpage-header"]') as HTMLElement;

describe("SubPageFrame", () => {
  it("holds body.subpage-open while mounted, so the page under it does not scroll (WP-36)", () => {
    const { unmount } = render(<SubPageFrame title="Тема" onBack={vi.fn()} />);
    expect(document.body.classList.contains("subpage-open")).toBe(true);

    unmount();

    expect(document.body.classList.contains("subpage-open")).toBe(false);
  });

  it("is a fixed layer at the sub-page level with the title, a card and the hint", () => {
    render(
      <SubPageFrame title="Тема" hint="Для приложения, бота и карточек объявлений." onBack={vi.fn()}>
        <p>Как в Telegram</p>
      </SubPageFrame>,
    );

    const page = screen.getByRole("region", { name: "Тема" });
    expect(page.getAttribute("data-slot")).toBe("subpage");
    expect(page.className).toMatch(/(?:^|\s)fixed(?:\s|$)/);
    expect(page.className).toContain("z-(--z-subpage)");
    // The entrance; the reduced-motion rule of motion.css stops it (tokens.test.ts).
    expect(page.className).toContain("animate-subpage-in");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Тема");
    expect(screen.getByText("Как в Telegram").parentElement?.getAttribute("data-slot")).toBe("subpage-card");
    const hint = screen.getByText("Для приложения, бота и карточек объявлений.");
    expect(hint.tagName).toBe("P");
    expect(hint.getAttribute("data-slot")).toBe("subpage-hint");
  });

  it("bare mode leaves the card out; without a hint there is no paragraph", () => {
    render(
      <SubPageFrame title={<span>Скрытое</span>} bare onBack={vi.fn()}>
        <section aria-label="groups">groups</section>
      </SubPageFrame>,
    );

    expect(document.querySelector('[data-slot="subpage-card"]')).toBeNull();
    expect(screen.getByLabelText("groups").parentElement?.getAttribute("data-slot")).toBe("subpage-body");
    expect(document.querySelector('[data-slot="subpage-hint"]')).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Скрытое");
  });

  it("renders the back slot before the title", () => {
    render(
      <SubPageFrame title="Валюта" back={<button type="button">Назад</button>} onBack={vi.fn()}>
        content
      </SubPageFrame>,
    );

    const back = screen.getByRole("button", { name: "Назад" });
    const title = screen.getByRole("heading", { level: 1 });
    expect(header().contains(back)).toBe(true);
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the header shadow while the top sentinel is out of the page", () => {
    const observers = stubIntersectionObserver();
    const { unmount } = render(
      <SubPageFrame title="Тема" onBack={vi.fn()}>
        content
      </SubPageFrame>,
    );

    expect(observers).toHaveLength(1);
    const [observer] = observers;
    expect(observer.options?.root).toBe(document.querySelector('[data-slot="subpage"]'));
    expect(observer.targets).toEqual([document.querySelector('[data-slot="subpage-sentinel"]')]);
    expect(header().hasAttribute("data-scrolled")).toBe(false);

    intersect(observer, false);
    expect(header().hasAttribute("data-scrolled")).toBe(true);
    expect(header().className).toContain("data-scrolled:border-sep");

    intersect(observer, true);
    expect(header().hasAttribute("data-scrolled")).toBe(false);

    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("without IntersectionObserver the header stays flat", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <SubPageFrame title="Тема" onBack={vi.fn()}>
        content
      </SubPageFrame>,
    );

    expect(header().hasAttribute("data-scrolled")).toBe(false);
  });

  it("closes by swipe back with its haptic callbacks, unless swipeBack is off", () => {
    vi.useFakeTimers();
    vi.stubGlobal("innerWidth", WIDTH);
    const onBack = vi.fn();
    const onSwipeStart = vi.fn();
    const onSwipeCommit = vi.fn();
    const { rerender } = render(
      <SubPageFrame title="Тема" onBack={onBack} onSwipeStart={onSwipeStart} onSwipeCommit={onSwipeCommit}>
        <p>Светлая</p>
      </SubPageFrame>,
    );

    swipe(screen.getByText("Светлая"), 150, 1000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect([onSwipeStart, onSwipeCommit, onBack].map((callback) => callback.mock.calls.length)).toEqual([1, 1, 1]);

    rerender(
      <SubPageFrame title="Тема" onBack={onBack} swipeBack={false}>
        <p>Светлая</p>
      </SubPageFrame>,
    );
    expect(screen.getByRole("region").style.transform).toBe("");
    swipe(screen.getByText("Светлая"), 150, 1000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("SubPageFrame: the leave (WP-39, BR-APP-112)", () => {
  const copies = () => [...document.querySelectorAll<HTMLElement>('[data-leave="subpage"]')];
  let played: Array<{ frames: Keyframe[]; timing: KeyframeAnimationOptions }> = [];

  beforeEach(() => {
    played = [];
    Element.prototype.animate = function animate(frames: Keyframe[], timing: KeyframeAnimationOptions) {
      played.push({ frames, timing });
      return { finished: new Promise<void>(() => undefined) } as unknown as Animation;
    } as unknown as typeof Element.prototype.animate;
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "animate");
    document.querySelector("[data-leave-layer]")?.remove();
  });

  it("a page that goes leaves a copy to the right: 24 %, faded, 200 ms; the copy is no sub-page", async () => {
    const { unmount } = render(<SubPageFrame title="Тема" onBack={vi.fn()} />);
    unmount();
    await act(async () => undefined);

    expect(copies()).toHaveLength(1);
    expect(copies()[0]!.getAttribute("data-slot")).toBe("subpage-leave");
    expect(copies()[0]!.hasAttribute("inert")).toBe(true);
    expect(document.querySelector('[data-slot="subpage"]')).toBeNull();
    expect(played).toEqual([
      { frames: [{ transform: "translateX(24%)", opacity: 0 }], timing: { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" } },
    ]);
  });

  it("a page its swipe took away leaves none", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: WIDTH });
    const onBack = vi.fn();
    const { unmount } = render(<SubPageFrame title="Тема" onBack={onBack} />);
    const page = document.querySelector<HTMLElement>('[data-slot="subpage"]')!;

    swipe(page, 200, 2000);
    vi.advanceTimersByTime(SWIPE_BACK_SETTLE_MS);
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => undefined);

    expect(copies()).toHaveLength(0);
  });
});
