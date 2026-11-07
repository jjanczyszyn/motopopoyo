import { ConvexError } from "convex/values";

/**
 * The human-readable text of an error thrown by a Convex function. Prod
 * deployments hide plain Error messages, so server code that needs the
 * client to react throws ConvexError, whose `data` always comes through.
 */
export function errorText(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data);
  if (e && typeof e === "object" && "data" in e) return String((e as { data: unknown }).data);
  return String((e as Error)?.message ?? e);
}
