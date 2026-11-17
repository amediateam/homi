import { describe, expect, it } from "vitest";

import { MASKED_PHONE, splitMaskedPhones } from "@/lib/phone/masked";

const UZ = "+998 ** *** ** 67";
const FOREIGN = "+** *** ** 67";

describe("splitMaskedPhones (WP-26, DEC-52)", () => {
  it("finds the Uzbek and the foreign masked form with their last two digits", () => {
    expect(splitMaskedPhones(`Звоните: ${UZ}`)).toEqual([
      { kind: "text", text: "Звоните: " },
      { kind: "phone", text: UZ, tail: "67" },
    ]);
    expect(splitMaskedPhones(`WhatsApp ${FOREIGN}.`)).toEqual([
      { kind: "text", text: "WhatsApp " },
      { kind: "phone", text: FOREIGN, tail: "67" },
      { kind: "text", text: "." },
    ]);
  });

  it("finds two masked numbers in one line, each with its own digits", () => {
    expect(splitMaskedPhones("+998 ** *** ** 67 или +998 ** *** ** 12")).toEqual([
      { kind: "phone", text: UZ, tail: "67" },
      { kind: "text", text: " или " },
      { kind: "phone", text: "+998 ** *** ** 12", tail: "12" },
    ]);
  });

  it("finds a number at the start and one at the end of a text, with no empty text parts", () => {
    expect(splitMaskedPhones(`${UZ}\nСдаётся квартира\n${FOREIGN}`)).toEqual([
      { kind: "phone", text: UZ, tail: "67" },
      { kind: "text", text: "\nСдаётся квартира\n" },
      { kind: "phone", text: FOREIGN, tail: "67" },
    ]);
    expect(splitMaskedPhones(UZ)).toEqual([{ kind: "phone", text: UZ, tail: "67" }]);
  });

  it.each([
    ["two stars", "Звёзд **"],
    ["stars between digits", "5 ** 7"],
    ["the mask without digits", "** *** **"],
    ["the mask without its last digits", "+998 ** *** ** "],
    ["a price", "$1 ***"],
    ["a raw number (the API never sends one)", "+998 00 000 00 67"],
    ["three trailing digits", "+998 ** *** ** 678"],
  ])("leaves %s as text", (_name, text) => {
    expect(splitMaskedPhones(text)).toEqual([{ kind: "text", text }]);
  });

  it("gives nothing for an empty text and keeps a text without numbers whole", () => {
    expect(splitMaskedPhones("")).toEqual([]);
    expect(splitMaskedPhones("Чисто, уютно.\n54 м², 3/9")).toEqual([{ kind: "text", text: "Чисто, уютно.\n54 м², 3/9" }]);
  });

  it("keeps no state between calls: the exported pattern has no global flag", () => {
    expect(MASKED_PHONE.flags).not.toContain("g");
    expect(MASKED_PHONE.test(UZ)).toBe(true);
    expect(MASKED_PHONE.test(UZ)).toBe(true);
    expect(splitMaskedPhones(UZ)).toEqual(splitMaskedPhones(UZ));
  });
});
