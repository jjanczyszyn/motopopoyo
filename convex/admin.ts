import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";

// Server-side admin auth. Each owner has their own password env var
// (ADMIN_KAREN_PASSWORD / ADMIN_JJ_PASSWORD). Login takes a username +
// password pair; verification returns a random session token stored in the
// adminSessions table that every admin-only mutation requires. The client
// never sees the password material — it only exists in the Convex deployment
// env.

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const USERS = ["karen", "jj"] as const;
type AdminUsername = typeof USERS[number];

function passwordFor(username: AdminUsername): string {
  if (username === "karen") return process.env.ADMIN_KAREN_PASSWORD ?? "";
  if (username === "jj") return process.env.ADMIN_JJ_PASSWORD ?? "";
  return "";
}

function randomToken(): string {
  // 32 hex chars from two random doubles. Doesn't need to be cryptographically
  // perfect — only used to gate a small admin panel and tied to a 24h TTL.
  const a = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const b = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const c = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const d = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${a}${b}${c}${d}`;
}

export const verifyPassword = mutation({
  args: {
    username: v.union(v.literal("karen"), v.literal("jj")),
    password: v.string(),
  },
  handler: async (ctx, { username, password }) => {
    const expected = passwordFor(username);
    if (!expected) {
      throw new Error("Admin login is not configured for this user.");
    }
    if (password !== expected) {
      // Generic message — don't leak which axis was wrong.
      throw new Error("Invalid username or password.");
    }
    const token = randomToken();
    await ctx.db.insert("adminSessions", {
      token,
      username,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    // Opportunistically clean up expired sessions so the table doesn't grow
    // forever — cheap on a tiny admin table.
    const stale = await ctx.db.query("adminSessions").collect();
    for (const s of stale) {
      if (s.expiresAt < Date.now()) await ctx.db.delete(s._id);
    }
    return { token, username, expiresAt: Date.now() + SESSION_TTL_MS };
  },
});

export const checkSession = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!row) return { ok: false as const };
    if (row.expiresAt < Date.now()) return { ok: false as const };
    return { ok: true as const, expiresAt: row.expiresAt, username: row.username };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

// Read-only variant for admin QUERIES (can't write, so it doesn't prune the
// expired row — it just rejects). Use this to gate every query that returns
// customer PII or financial data; without it those queries are world-readable
// on the public Convex deployment.
export async function assertAdminRead(ctx: QueryCtx, token: string) {
  if (!token) throw new Error("Admin auth required.");
  const row = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!row || row.expiresAt < Date.now()) {
    throw new Error("Admin auth required.");
  }
  return row;
}

// Helper for admin mutations elsewhere in convex/. Throws if the token is
// missing or expired. Returns the session row otherwise.
export async function assertAdmin(ctx: MutationCtx, token: string) {
  if (!token) throw new Error("Admin auth required.");
  const row = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!row) throw new Error("Admin auth required.");
  if (row.expiresAt < Date.now()) {
    await ctx.db.delete(row._id);
    throw new Error("Admin session expired — please sign in again.");
  }
  return row;
}
