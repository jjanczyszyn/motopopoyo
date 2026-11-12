import { describe, expect, it } from "vitest";
import { addDaysISO, isISODate, statusForDates, tokenMatches } from "./quick";

const SECRET = "a".repeat(16) + "b".repeat(16);

describe("tokenMatches", () => {
  it("accepts the exact secret", () => {
    expect(tokenMatches(SECRET, SECRET)).toBe(true);
  });
  it("refuses a wrong or partial token", () => {
    expect(tokenMatches(SECRET.slice(0, -1) + "c", SECRET)).toBe(false);
    expect(tokenMatches(SECRET.slice(0, 10), SECRET)).toBe(false);
    expect(tokenMatches("", SECRET)).toBe(false);
  });
  it("refuses everything when the secret is unset or too short", () => {
    expect(tokenMatches("", undefined)).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches("short", "short")).toBe(false);
  });
});

describe("addDaysISO", () => {
  it("adds days across month and year ends", () => {
    expect(addDaysISO("2026-11-12", 3)).toBe("2026-11-15");
    expect(addDaysISO("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("isISODate", () => {
  it("accepts YYYY-MM-DD only", () => {
    expect(isISODate("2026-11-12")).toBe(true);
    expect(isISODate("12/11/2026")).toBe(false);
    expect(isISODate("")).toBe(false);
  });
});

describe("statusForDates", () => {
  const today = "2026-11-12";
  it("is confirmed when the rental is ahead", () => {
    expect(statusForDates("2026-11-13", "2026-11-15", today)).toBe("confirmed");
  });
  it("is active when it starts today or is running", () => {
    expect(statusForDates("2026-11-12", "2026-11-15", today)).toBe("active");
    expect(statusForDates("2026-11-10", "2026-11-13", today)).toBe("active");
  });
  it("is returned when the return day has come", () => {
    expect(statusForDates("2026-11-08", "2026-11-12", today)).toBe("returned");
  });
});
