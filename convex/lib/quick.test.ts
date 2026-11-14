import { describe, expect, it } from "vitest";
import { addDaysISO, canQuickEdit, inDeletedView, isISODate, quickAuthor, statusForDates } from "./quick";

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

describe("quickAuthor / canQuickEdit", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const hour = 3600 * 1000;
  const mine = { notes: "Added by Karen via quick add", createdAt: now - 2 * hour, status: "confirmed" };

  it("reads the author from the note, old and new wording", () => {
    expect(quickAuthor("Added by Karen via quick add")).toBe("Karen");
    expect(quickAuthor("Added by JJ via quick link")).toBe("JJ");
    expect(quickAuthor("walk-in, paid cash")).toBeNull();
    expect(quickAuthor(undefined)).toBeNull();
  });
  it("lets the author edit within 24 hours", () => {
    expect(canQuickEdit(mine, "Karen", now)).toBe(true);
    expect(canQuickEdit({ ...mine, createdAt: now - 23.9 * hour }, "Karen", now)).toBe(true);
  });
  it("refuses after 24 hours", () => {
    expect(canQuickEdit({ ...mine, createdAt: now - 24 * hour }, "Karen", now)).toBe(false);
  });
  it("refuses someone else's booking, a non-quick booking, or a cancelled one", () => {
    expect(canQuickEdit(mine, "JJ", now)).toBe(false);
    expect(canQuickEdit({ ...mine, notes: "from WhatsApp" }, "Karen", now)).toBe(false);
    expect(canQuickEdit({ ...mine, status: "cancelled" }, "Karen", now)).toBe(false);
  });
});

describe("soft delete", () => {
  const base = { notes: "Added by Karen via quick add", createdAt: 1_000, status: "confirmed" };
  it("locks a deleted rental even inside the 24 hours", () => {
    expect(canQuickEdit({ ...base, deletedAt: 2_000 }, "Karen", 3_000)).toBe(false);
  });
  it("hides deleted rentals from the normal admin lists", () => {
    expect(inDeletedView({}, false)).toBe(true);
    expect(inDeletedView({ deletedAt: 5 }, false)).toBe(false);
  });
  it("shows only deleted rentals in the Deleted log", () => {
    expect(inDeletedView({ deletedAt: 5 }, true)).toBe(true);
    expect(inDeletedView({}, true)).toBe(false);
  });
});
