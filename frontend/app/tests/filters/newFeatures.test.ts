import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isNewFeature, markFeatureSeen, useNewFeature } from "@/features/filters/newFeatures";
import { storageSet, subscribeStorage } from "@/lib/storage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("newFeatures (BR-APP-057)", () => {
  it("a feature is new until it is marked, and is marked once", () => {
    let writes = 0;
    const unsubscribe = subscribeStorage(() => {
      writes += 1;
    });

    expect(isNewFeature("pets")).toBe(true);
    markFeatureSeen("pets");
    markFeatureSeen("pets");

    expect(window.localStorage.getItem("homi-new-pets")).toBe("1");
    expect(isNewFeature("pets")).toBe(false);
    expect(writes).toBe(1);
    unsubscribe();
  });

  it("useNewFeature follows the marker, whoever writes it", () => {
    const { result } = renderHook(() => useNewFeature("pets"));
    expect(result.current).toBe(true);

    act(() => markFeatureSeen("pets"));
    expect(result.current).toBe(false);

    act(() => storageSet("homi-new-pets", null));
    expect(result.current).toBe(true);
  });

  it("renders false on the server and in the hydration render, then the marker's answer", async () => {
    function Pill() {
      return createElement("output", null, String(useNewFeature("pets")));
    }
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Pill));
    const server = container.textContent;
    const recoverable: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, createElement(Pill), { onRecoverableError: (error) => void recoverable.push(error) });
    });

    expect({ server, after: container.textContent, recoverable }).toEqual({ server: "false", after: "true", recoverable: [] });
  });
});
