import { describe, expect, it } from "vitest";
import { daily, funnel, scrub, MAX_DETAIL } from "./events";

describe("scrub", () => {
  it("removes emails, phone/ID numbers and long tokens", () => {
    expect(scrub("mail ana@example.com now")).toBe("mail [email] now");
    expect(scrub("call +505 8888 1234")).toBe("call [number]");
    expect(scrub("doc C01X00T47 ok")).toBe("doc C01X00T47 ok"); // short codes stay
    expect(scrub("passport 123456789")).toBe("passport [number]");
    expect(scrub(`t ${"a".repeat(40)}`)).toBe("t [token]");
  });

  it("keeps booking codes and normal error text", () => {
    expect(scrub("reservations:create: BIKE_UNAVAILABLE KJ-AB12-345")).toBe(
      "reservations:create: BIKE_UNAVAILABLE KJ-AB12-345"
    );
  });

  it("caps length and handles empty input", () => {
    expect(scrub("ab ".repeat(700))!.length).toBe(MAX_DETAIL);
    expect(scrub("")).toBeUndefined();
    expect(scrub(undefined)).toBeUndefined();
  });
});

const ev = (sessionId: string, name: string, kind = "step", area = "site", at = Date.parse("2026-11-06T18:00:00Z")) =>
  ({ sessionId, name, kind, area, at });

describe("funnel", () => {
  it("counts distinct sessions per renter step, in journey order", () => {
    const rows = [
      ev("a", "screen:home"), ev("a", "screen:home"), ev("a", "screen:calendar"), ev("a", "screen:done"),
      ev("b", "screen:home"), ev("b", "screen:calendar"),
      ev("c", "screen:home"),
      ev("z", "tab:payments", "step", "admin"),
    ];
    const f = funnel(rows);
    expect(f[0]).toEqual({ step: "home", sessions: 3 });
    expect(f.find((x) => x.step === "calendar")!.sessions).toBe(2);
    expect(f.find((x) => x.step === "done")!.sessions).toBe(1);
    expect(f.map((x) => x.step)).toEqual([
      "home", "calendar", "bike", "ocr", "phone", "pay", "contract", "delivery", "done",
    ]);
  });
});

describe("daily", () => {
  it("groups by Nicaragua day, newest first", () => {
    const rows = [
      ev("a", "site_open", "visit", "site", Date.parse("2026-11-07T03:00:00Z")), // Nov 6 local
      ev("a", "server_error", "error", "site", Date.parse("2026-11-07T03:05:00Z")),
      ev("b", "site_open", "visit", "site", Date.parse("2026-11-07T15:00:00Z")), // Nov 7 local
    ];
    expect(daily(rows)).toEqual([
      { day: "2026-11-07", visits: 1, sessions: 1, errors: 0 },
      { day: "2026-11-06", visits: 1, sessions: 1, errors: 1 },
    ]);
  });
});
