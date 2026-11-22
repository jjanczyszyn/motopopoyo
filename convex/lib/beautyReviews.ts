// Pure rules for customer reviews left on beauty.popoyo.co/review.

export const MAX_NAME = 60;
export const MAX_TEXT = 1500;
export const MIN_TEXT = 10;
export const MAX_SERVICE = 60;
/** Public form, no login: past this many in 24h it refuses until it drops. */
export const MAX_PER_DAY = 30;

const tidy = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export interface ReviewInput { name: string; rating: number; text: string; service?: string }

/** Cleaned review, or why it can't be accepted. The star rating never matters. */
export function checkReview(
  r: ReviewInput
): { ok: true; review: ReviewInput } | { ok: false; problem: string } {
  const name = oneLine(r.name);
  const text = tidy(r.text);
  const service = oneLine(r.service ?? "");
  if (!name) return { ok: false, problem: "Please add your name." };
  if (name.length > MAX_NAME) return { ok: false, problem: "That name is too long." };
  if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) {
    return { ok: false, problem: "Please choose 1 to 5 stars." };
  }
  if (text.length < MIN_TEXT) return { ok: false, problem: "Please write a little more." };
  if (text.length > MAX_TEXT) return { ok: false, problem: `Please keep it under ${MAX_TEXT} characters.` };
  if (service.length > MAX_SERVICE) return { ok: false, problem: "That service name is too long." };
  return { ok: true, review: { name, rating: r.rating, text, service: service || undefined } };
}
