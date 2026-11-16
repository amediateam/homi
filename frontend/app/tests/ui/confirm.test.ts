import { fakeTelegram, type FakeTelegram } from "@homi/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tg } from "@/lib/telegram";
import { confirmText } from "@/lib/ui/confirm";

let fake: FakeTelegram | null = null;

afterEach(() => {
  fake?.uninstall();
  fake = null;
});

describe("confirmText (SCR-043)", () => {
  it("asks through Telegram's native dialog and resolves its answer", async () => {
    fake = fakeTelegram({ version: "6.2", answers: { confirm: false } });
    await expect(confirmText("Очистить историю просмотров?")).resolves.toBe(false);
    fake.answers.confirm = true;
    await expect(confirmText("Очистить историю просмотров?")).resolves.toBe(true);
    expect(fake.calls.filter((entry) => entry.member === "showConfirm").map((entry) => entry.args[0])).toEqual([
      "Очистить историю просмотров?",
      "Очистить историю просмотров?",
    ]);
  });

  it("delegates to tg.confirm, which owns the 6.2 gate", async () => {
    const confirm = vi.spyOn(tg, "confirm").mockResolvedValue(true);
    await expect(confirmText("Удалить радар «Чиланзар»?")).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith("Удалить радар «Чиланзар»?");
  });
});
