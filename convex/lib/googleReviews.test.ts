import { describe, it, expect } from "vitest";
import { normalizeReviews, reviewIdOf } from "./googleReviews";

// Synthetic Places API payload — shaped like the real one, no real customer
// names or review text.
const sample = [
  {
    name: "places/ChIJfakeplaceid/reviews/AbCdEf123",
    rating: 5,
    publishTime: "2026-07-02T18:24:11Z",
    relativePublishTimeDescription: "3 weeks ago",
    text: { text: "Great bike, easy pickup.", languageCode: "en" },
    originalText: { text: "Buena moto.", languageCode: "es" },
    authorAttribution: {
      displayName: "Test Rider",
      photoUri: "https://example.test/pic.jpg",
    },
  },
  {
    name: "places/ChIJfakeplaceid/reviews/XyZ789",
    rating: 4,
    publishTime: "2026-01-15T09:00:00Z",
    originalText: { text: "Bonne expérience.", languageCode: "fr" },
    authorAttribution: { displayName: "Autre Client" },
  },
];

describe("reviewIdOf", () => {
  it("takes the last path segment of the resource name", () => {
    expect(reviewIdOf("places/ChIJx/reviews/AbC")).toBe("g:AbC");
  });

  it("returns null when there is no resource name", () => {
    expect(reviewIdOf(undefined)).toBeNull();
    expect(reviewIdOf("")).toBeNull();
  });
});

describe("normalizeReviews", () => {
  it("maps publishTime to a real epoch timestamp", () => {
    const [first] = normalizeReviews(sample);
    expect(first.publishedAt).toBe(Date.parse("2026-07-02T18:24:11Z"));
  });

  it("never carries the relative 'N weeks ago' description through", () => {
    const rows = normalizeReviews(sample);
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toMatch(/ago/);
      expect(r).not.toHaveProperty("when");
      expect(r).not.toHaveProperty("relativePublishTimeDescription");
    }
  });

  it("prefers the translated text, falling back to the original", () => {
    const rows = normalizeReviews(sample);
    expect(rows[0].text).toBe("Great bike, easy pickup.");
    expect(rows[1].text).toBe("Bonne expérience.");
  });

  it("keeps author name, rating and optional photo", () => {
    const rows = normalizeReviews(sample);
    expect(rows[0]).toMatchObject({
      googleId: "g:AbCdEf123",
      name: "Test Rider",
      rating: 5,
      profilePic: "https://example.test/pic.jpg",
    });
    expect(rows[1].profilePic).toBeUndefined();
  });

  it("drops entries missing an id, text, author, rating or publish time", () => {
    expect(
      normalizeReviews([
        { rating: 5, publishTime: "2026-07-02T00:00:00Z", text: { text: "no id" }, authorAttribution: { displayName: "A" } },
        { name: "places/p/reviews/1", rating: 5, publishTime: "2026-07-02T00:00:00Z", text: { text: "   " }, authorAttribution: { displayName: "A" } },
        { name: "places/p/reviews/2", rating: 5, publishTime: "2026-07-02T00:00:00Z", text: { text: "ok" } },
        { name: "places/p/reviews/3", publishTime: "2026-07-02T00:00:00Z", text: { text: "ok" }, authorAttribution: { displayName: "A" } },
        { name: "places/p/reviews/4", rating: 5, text: { text: "ok" }, authorAttribution: { displayName: "A" } },
        { name: "places/p/reviews/5", rating: 5, publishTime: "not-a-date", text: { text: "ok" }, authorAttribution: { displayName: "A" } },
      ])
    ).toEqual([]);
  });

  it("handles a missing reviews array", () => {
    expect(normalizeReviews(undefined)).toEqual([]);
    expect(normalizeReviews([])).toEqual([]);
  });
});
