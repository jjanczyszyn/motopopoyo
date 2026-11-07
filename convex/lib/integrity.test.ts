import { describe, expect, it } from "vitest";
import {
  blockedDays,
  findOverlap,
  holdsBike,
  nameNeedsReview,
  repriceTotal,
  splitAwaiting,
  todayInNicaragua,
} from "./integrity";

const bk = (id: string, bikeId: string, startDate: string, endDate: string, status = "confirmed") =>
  ({ _id: id, bikeId, startDate, endDate, status, code: `KJ-${id}` });

describe("holdsBike", () => {
  it("frees the bike only when cancelled or returned", () => {
    expect(holdsBike("pending")).toBe(true);
    expect(holdsBike("confirmed")).toBe(true);
    expect(holdsBike("active")).toBe(true);
    expect(holdsBike("returned")).toBe(false);
    expect(holdsBike("cancelled")).toBe(false);
  });
});

describe("findOverlap", () => {
  const existing = [bk("a", "yamaha", "2026-11-07", "2026-11-10")];

  it("finds a clash on the same bike", () => {
    expect(findOverlap(existing, { bikeId: "yamaha", startDate: "2026-11-08", endDate: "2026-11-12" })?._id).toBe("a");
    expect(findOverlap(existing, { bikeId: "yamaha", startDate: "2026-11-01", endDate: "2026-11-30" })?._id).toBe("a");
  });

  it("allows back-to-back rentals (return day = next start day)", () => {
    expect(findOverlap(existing, { bikeId: "yamaha", startDate: "2026-11-10", endDate: "2026-11-12" })).toBeNull();
    expect(findOverlap(existing, { bikeId: "yamaha", startDate: "2026-11-05", endDate: "2026-11-07" })).toBeNull();
  });

  it("ignores other bikes, released bookings and the booking being edited", () => {
    expect(findOverlap(existing, { bikeId: "genesis", startDate: "2026-11-08", endDate: "2026-11-09" })).toBeNull();
    expect(findOverlap([bk("b", "yamaha", "2026-11-07", "2026-11-10", "cancelled")],
      { bikeId: "yamaha", startDate: "2026-11-08", endDate: "2026-11-09" })).toBeNull();
    expect(findOverlap(existing, { bikeId: "yamaha", startDate: "2026-11-08", endDate: "2026-11-11", excludeId: "a" })).toBeNull();
  });
});

describe("blockedDays", () => {
  it("lists maintenance days inside the range, end exclusive", () => {
    const blocks = [
      { bikeId: "yamaha", date: "2026-11-09", status: "maintenance" },
      { bikeId: "yamaha", date: "2026-11-12", status: "blocked" },
      { bikeId: "genesis", date: "2026-11-09", status: "blocked" },
    ];
    expect(blockedDays(blocks, "yamaha", "2026-11-07", "2026-11-12")).toEqual(["2026-11-09"]);
    expect(blockedDays(blocks, "yamaha", "2026-11-10", "2026-11-12")).toEqual([]);
  });
});

describe("nameNeedsReview", () => {
  it("flags ID-card headings and junk reads", () => {
    expect(nameNeedsReview("Republica", "De Nicaragua")).toBe(true);
    expect(nameNeedsReview("PASSPORT", "")).toBe(true);
    expect(nameNeedsReview("G", "Ne")).toBe(true);
    expect(nameNeedsReview("", "")).toBe(true);
    expect(nameNeedsReview("Ann3", "Smith")).toBe(true);
  });

  it("accepts ordinary names, including accents and short surnames", () => {
    expect(nameNeedsReview("Ana", "Pérez")).toBe(false);
    expect(nameNeedsReview("Jo", "Ng Tan")).toBe(false);
    expect(nameNeedsReview("Søren", "Kierkegaard")).toBe(false);
  });
});

describe("repriceTotal", () => {
  it("uses the booking's own daily rate, not today's season", () => {
    // A high-season ($20) booking edited from 3 to 4 days stays at $20/day.
    expect(repriceTotal(4, 20)).toBe(80);
    expect(repriceTotal(4, 18)).toBe(72);
    // A week bills as 6 days.
    expect(repriceTotal(7, 20)).toBe(120);
  });

  it("applies the discount and never goes negative", () => {
    expect(repriceTotal(3, 20, 10)).toBe(50);
    expect(repriceTotal(1, 20, 50)).toBe(0);
  });
});

describe("splitAwaiting", () => {
  it("separates started rentals (overdue) from future ones", () => {
    const rows = [
      { id: 1, startDate: "2026-11-10", status: "pending", balance: 54 },
      { id: 2, startDate: "2026-08-04", status: "pending", balance: 72 },
      { id: 3, startDate: "2026-11-06", status: "confirmed", balance: 54 },
      { id: 4, startDate: "2026-07-01", status: "cancelled", balance: 40 },
      { id: 5, startDate: "2026-07-01", status: "returned", balance: 0 },
    ];
    const { overdue, upcoming } = splitAwaiting(rows, "2026-11-06");
    expect(overdue.map((r) => r.id)).toEqual([2, 3]);
    expect(upcoming.map((r) => r.id)).toEqual([1]);
  });
});

describe("todayInNicaragua", () => {
  it("is UTC-6", () => {
    // 03:00 UTC on Nov 7 is still Nov 6 in Popoyo.
    expect(todayInNicaragua(Date.parse("2026-11-07T03:00:00Z"))).toBe("2026-11-06");
    expect(todayInNicaragua(Date.parse("2026-11-07T07:00:00Z"))).toBe("2026-11-07");
  });
});
