import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorState } from "../src/index";

afterEach(cleanup);

const OFFLINE = {
  title: "Нет связи",
  text: "Проверьте интернет и попробуйте ещё раз.",
};
const SERVER = {
  title: "Не загрузилось",
  text: "Сервер не ответил. Попробуйте ещё раз через минуту.",
};

describe("ErrorState", () => {
  it("shows WifiOff and the caller's texts for offline", () => {
    render(<ErrorState kind="offline" {...OFFLINE} retryLabel="Повторить" onRetry={() => {}} />);

    const state = screen.getByRole("alert");
    expect(state.getAttribute("data-kind")).toBe("offline");
    expect(state.querySelector('[data-slot="error-state-icon"] .lucide-wifi-off')).not.toBeNull();
    expect(state.querySelector(".lucide-cloud-off")).toBeNull();
    expect(state.querySelector('[data-slot="error-state-title"]')?.textContent).toBe(OFFLINE.title);
    expect(state.querySelector('[data-slot="error-state-text"]')?.textContent).toBe(OFFLINE.text);
  });

  it("shows CloudOff and the caller's texts for server", () => {
    render(<ErrorState kind="server" {...SERVER} retryLabel="Повторить" onRetry={() => {}} />);

    const state = screen.getByRole("alert");
    expect(state.getAttribute("data-kind")).toBe("server");
    expect(state.querySelector('[data-slot="error-state-icon"] .lucide-cloud-off')).not.toBeNull();
    expect(state.querySelector(".lucide-wifi-off")).toBeNull();
    expect(state.querySelector('[data-slot="error-state-title"]')?.textContent).toBe(SERVER.title);
    expect(state.querySelector('[data-slot="error-state-text"]')?.textContent).toBe(SERVER.text);
  });

  it("calls onRetry once per tap, without arguments, from a RotateCw button", () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="offline" {...OFFLINE} retryLabel="Повторить" onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "Повторить" });
    expect(retry.querySelector(".lucide-rotate-cw")?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("has a tall variant for a whole screen", () => {
    const { rerender } = render(<ErrorState kind="server" {...SERVER} retryLabel="Повторить" onRetry={() => {}} />);

    const state = screen.getByRole("alert");
    expect(state.className).toMatch(/\bpy-16\b/);
    expect(state.className).not.toMatch(/\bpt-24\b/);

    rerender(<ErrorState kind="server" {...SERVER} retryLabel="Повторить" onRetry={() => {}} tall />);
    expect(state.className).toMatch(/\bpt-24\b/);
    expect(state.querySelector('[data-slot="error-state-text"]')?.className).toMatch(/max-w-\[300px\]/);
  });
});
