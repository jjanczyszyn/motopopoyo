// Mapping from the Google Places API (New) Place Details `reviews` field onto
// our `reviews` table. Kept out of the Convex function module so it can be
// unit-tested without a backend.

export interface PlacesReview {
  name?: string;
  rating?: number;
  publishTime?: string;
  relativePublishTimeDescription?: string;
  text?: { text?: string; languageCode?: string };
  originalText?: { text?: string; languageCode?: string };
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
}

export interface ReviewRow {
  googleId: string;
  name: string;
  rating: number;
  text: string;
  publishedAt: number;
  profilePic?: string;
}

// Google returns the review resource name as
// "places/<placeId>/reviews/<reviewId>" — the last segment is the stable id.
export function reviewIdOf(resourceName: string | undefined): string | null {
  if (!resourceName) return null;
  const id = resourceName.split("/").filter(Boolean).pop();
  return id ? `g:${id}` : null;
}

// Drops anything we can't render honestly: no stable id, no text, no author,
// or no real publish timestamp. `relativePublishTimeDescription` is
// deliberately ignored — it is a "3 months ago" string that is only true on
// the day it was fetched.
export function normalizeReviews(reviews: PlacesReview[] | undefined): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const r of reviews ?? []) {
    const googleId = reviewIdOf(r.name);
    // Prefer Google's translation into the site language, fall back to what
    // the reviewer actually wrote.
    const text = (r.text?.text ?? r.originalText?.text ?? "").trim();
    const author = r.authorAttribution?.displayName?.trim();
    const publishedAt = r.publishTime ? Date.parse(r.publishTime) : NaN;
    if (!googleId || !text || !author) continue;
    if (typeof r.rating !== "number" || !Number.isFinite(publishedAt)) continue;
    out.push({
      googleId,
      name: author,
      rating: r.rating,
      text,
      publishedAt,
      ...(r.authorAttribution?.photoUri
        ? { profilePic: r.authorAttribution.photoUri }
        : {}),
    });
  }
  return out;
}
