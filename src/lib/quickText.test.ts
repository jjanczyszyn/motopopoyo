import { describe, expect, it } from "vitest";
import { spanishError } from "./quickText";

describe("spanishError", () => {
  it("explains a double-booking", () => {
    expect(
      spanishError("BIKE_UNAVAILABLE: this bike is already booked 2026-11-13 → 2026-11-16 (KJ-AAAA-111).")
    ).toMatch(/ocupada/);
  });
  it("explains a bike in maintenance", () => {
    expect(spanishError("BIKE_UNAVAILABLE: this bike is out of service on 2026-11-14.")).toMatch(/taller/);
  });
  it("asks to sign in again when the session is gone", () => {
    expect(spanishError("Admin session expired — please sign in again.")).toMatch(/entrar otra vez/);
    expect(spanishError("Admin auth required.")).toMatch(/entrar otra vez/);
  });
  it("explains the 24-hour edit window", () => {
    expect(
      spanishError("QUICK_EDIT_CLOSED: this rental can only be changed by whoever added it, within 24 hours.")
    ).toMatch(/24 horas/);
  });
  it("never shows English or codes for anything else", () => {
    expect(spanishError("Server Error")).toBe("No se guardó. Intenta otra vez.");
  });
});
