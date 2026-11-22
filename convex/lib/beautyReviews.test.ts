import { describe, expect, it } from "vitest";
import { MAX_TEXT, checkReview } from "./beautyReviews";

const ok = { name: "Test Guest", rating: 5, text: "Lovely massage after surfing.", service: "Massage" };
const problem = (o: object) => {
  const r = checkReview({ ...ok, ...o });
  return r.ok ? null : r.problem;
};

describe("checkReview", () => {
  it("accepts every star rating alike", () => {
    for (const rating of [1, 2, 3, 4, 5]) expect(problem({ rating })).toBeNull();
  });
  it("tidies spacing and drops an empty service", () => {
    const r = checkReview({ name: "  Test \n Guest ", rating: 4, text: " So   good,\n\n\n\nthank you ", service: " " });
    expect(r).toEqual({ ok: true, review: { name: "Test Guest", rating: 4, text: "So good,\n\nthank you", service: undefined } });
  });
  it("needs a name, whole stars from 1 to 5, and some text", () => {
    expect(problem({ name: "  " })).toMatch(/name/);
    for (const rating of [0, 6, 4.5, NaN]) expect(problem({ rating })).toMatch(/stars/);
    expect(problem({ text: "ok" })).toMatch(/little more/);
  });
  it("caps lengths", () => {
    expect(problem({ name: "x".repeat(61) })).toMatch(/too long/);
    expect(problem({ text: "x".repeat(MAX_TEXT + 1) })).toMatch(/under/);
    expect(problem({ service: "x".repeat(61) })).toMatch(/too long/);
  });
});
