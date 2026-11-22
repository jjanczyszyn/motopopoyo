import { describe, expect, it } from "vitest";
import { parseMoney, spanishError } from "./quickText";

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
  it("explains each service problem", () => {
    expect(spanishError("SERVICE_NAME: enter the service.")).toMatch(/qué servicio/);
    expect(spanishError("SERVICE_FUTURE: log a service on or after the day it happens.")).toMatch(/todavía no llega/);
    expect(spanishError("SERVICE_DATE: pick a date.")).toMatch(/Elige el día/);
    expect(spanishError("SERVICE_PRICE: enter the price charged.")).toMatch(/pagó el cliente/);
    expect(spanishError("SERVICE_COST: enter what the service cost.")).toMatch(/costó el servicio/);
    expect(spanishError("SERVICE_COST_OVER_PRICE: the cost is higher than the price charged.")).toMatch(/Revisa/);
  });
  it("never shows English or codes for anything else", () => {
    expect(spanishError("Server Error")).toBe("No se guardó. Intenta otra vez.");
  });
});

describe("parseMoney", () => {
  it("reads amounts with a dot or a comma", () => {
    expect(parseMoney("45")).toBe(45);
    expect(parseMoney(" 45,50 ")).toBe(45.5);
    expect(parseMoney("45.")).toBe(45);
    expect(parseMoney("0")).toBe(0);
  });
  it("is null for blanks and anything that isn't an amount", () => {
    for (const s of ["", "  ", "-5", "abc", "1e3", "1,000.50", "$5"]) expect(parseMoney(s)).toBeNull();
  });
});
