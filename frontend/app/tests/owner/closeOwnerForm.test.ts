import { beforeEach, describe, expect, it, vi } from "vitest";

const history = vi.hoisted(() => ({ depth: 0, taken: null as number | null }));
vi.mock("@/lib/navigation/history", () => ({
  depth: () => history.depth,
  backBy: vi.fn(async (steps: number) => {
    const taken = history.taken ?? Math.min(steps, history.depth);
    history.depth -= taken;
    return taken;
  }),
}));
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigation/nav", () => ({ nav: { replace } }));
const impact = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telegram", () => ({ tg: { haptic: { impact } } }));

const { backBy } = await import("@/lib/navigation/history");
const { closeOwnerForm, forgetOwnerForm, markOwnerFormOpened } = await import("@/features/owner/closeOwnerForm");

const ID = "01JF0000000000000000000004";
const at = (path: string) => window.history.replaceState(null, "", path);

beforeEach(() => {
  forgetOwnerForm();
  history.depth = 0;
  history.taken = null;
  vi.mocked(backBy).mockClear();
  replace.mockClear();
  impact.mockClear();
});

describe("closeOwnerForm (WP-81)", () => {
  it("steps back over the form's steps and its own entry at once, with a light haptic", async () => {
    history.depth = 1; // the feed, then /owner/new pushed
    markOwnerFormOpened();
    history.depth = 3; // /place and /phone pushed after it
    at(`/ru/owner/${ID}/phone`);

    await closeOwnerForm();

    expect(backBy).toHaveBeenCalledWith(3);
    expect(impact).toHaveBeenCalledWith("light");
  });

  it("a second close before the first lands is the same close and waits for it (round 2)", async () => {
    history.depth = 1;
    markOwnerFormOpened();
    history.depth = 2;
    at(`/ru/owner/${ID}/place`);

    const first = closeOwnerForm();
    const second = closeOwnerForm();
    await Promise.all([first, second]);

    expect(backBy).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it("a later mount of the same opening keeps the first depth", async () => {
    history.depth = 2;
    markOwnerFormOpened();
    history.depth = 3;
    markOwnerFormOpened();
    at(`/ru/owner/${ID}`);

    await closeOwnerForm();

    expect(backBy).toHaveBeenCalledWith(2);
  });

  it("a form loaded directly replaces its address with /settings once the steps behind it are used up", async () => {
    history.depth = 0;
    markOwnerFormOpened();
    history.depth = 1;
    at(`/uz/owner/${ID}/mode`);
    history.taken = 1;
    // After one step back the browser shows the questionnaire, loaded directly.
    vi.mocked(backBy).mockImplementationOnce(async () => {
      at(`/uz/owner/${ID}`);
      return 1;
    });

    await closeOwnerForm();

    expect(backBy).toHaveBeenCalledWith(2);
    expect(replace).toHaveBeenCalledWith("/settings");
  });

  it("without a recorded opening it replaces a form address with /settings, and leaves any other address alone", async () => {
    at(`/ru/owner/${ID}/done`);
    await closeOwnerForm();
    expect(backBy).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/settings");

    replace.mockClear();
    at("/ru/settings");
    await closeOwnerForm();
    expect(replace).not.toHaveBeenCalled();
  });
});
