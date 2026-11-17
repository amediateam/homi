import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntInput, PriceInput } from "../src/index";

afterEach(cleanup);

describe("IntInput", () => {
  function Area({ onValue = () => {} }: { onValue?: (value: number | null) => void }) {
    const [value, setValue] = useState<number | null>(null);
    return (
      <IntInput
        aria-label="от"
        value={value}
        max={10_000}
        onValueChange={(next) => {
          onValue(next);
          setValue(next);
        }}
      />
    );
  }

  const field = () => screen.getByRole("textbox", { name: "от" }) as HTMLInputElement;

  it("drops non-digits", () => {
    const onValue = vi.fn();
    render(<Area onValue={onValue} />);

    fireEvent.change(field(), { target: { value: "12a3" } });

    expect(onValue).toHaveBeenLastCalledWith(123);
    expect(field().value).toBe("123");
  });

  it("treats 0 as no value", () => {
    const onValue = vi.fn();
    render(<Area onValue={onValue} />);

    fireEvent.change(field(), { target: { value: "0" } });

    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(field().value).toBe("");
  });

  it("caps the value at max", () => {
    const onValue = vi.fn();
    render(<Area onValue={onValue} />);

    fireEvent.change(field(), { target: { value: "20000" } });

    expect(onValue).toHaveBeenLastCalledWith(10_000);
    expect(field().value).toBe("10000");
  });

  it("is a numeric field with a done key", () => {
    render(<Area />);

    expect(field().getAttribute("inputmode")).toBe("numeric");
    expect(field().getAttribute("enterkeyhint")).toBe("done");
  });
});

describe("PriceInput", () => {
  /** Millions of сум at 12 650 per dollar, with one `,` or `.` as the decimal mark, as `Money` does it. */
  const RATE = 12_650;
  const toText = (usd: number | null) => (usd === null ? "" : String(Math.round((usd * RATE) / 100_000) / 10).replace(".", ","));
  const parse = (text: string) => {
    const amount = Number(text.replace(",", "."));
    return text.trim() === "" || !Number.isFinite(amount) || amount <= 0 ? null : Math.round((amount * 1_000_000) / RATE);
  };

  function Price({ initial = null, onValue = () => {} }: { initial?: number | null; onValue?: (value: number | null) => void }) {
    const [value, setValue] = useState<number | null>(initial);
    return (
      <>
        <PriceInput
          aria-label="до"
          inputMode="decimal"
          value={value}
          toText={toText}
          parse={parse}
          onValueChange={(next) => {
            onValue(next);
            setValue(next);
          }}
        />
        <button type="button" onClick={() => setValue(395)}>
          preset
        </button>
        <button type="button" onClick={() => setValue(null)}>
          reset
        </button>
      </>
    );
  }

  const field = () => screen.getByRole("textbox", { name: "до" }) as HTMLInputElement;

  it("keeps the text as typed while it parses to the value", () => {
    const onValue = vi.fn();
    render(<Price onValue={onValue} />);

    fireEvent.change(field(), { target: { value: "1," } });
    expect(field().value).toBe("1,");
    expect(onValue).toHaveBeenLastCalledWith(79);

    fireEvent.change(field(), { target: { value: "1,2" } });
    expect(field().value).toBe("1,2");
    expect(onValue).toHaveBeenLastCalledWith(95);
  });

  it("keeps text that does not parse and reports no value", () => {
    const onValue = vi.fn();
    render(<Price initial={95} onValue={onValue} />);

    fireEvent.change(field(), { target: { value: "abc" } });

    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(field().value).toBe("abc");
  });

  it("takes the text of a value set from outside", () => {
    render(<Price />);
    fireEvent.change(field(), { target: { value: "1,2" } });

    fireEvent.click(screen.getByRole("button", { name: "preset" }));
    expect(field().value).toBe("5");

    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    expect(field().value).toBe("");
  });

  it("starts from the text of its value", () => {
    render(<Price initial={95} />);

    expect(field().value).toBe("1,2");
    expect(field().getAttribute("inputmode")).toBe("decimal");
  });
});
