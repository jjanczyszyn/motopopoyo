import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertAdminRead } from "./admin";
import {
  PaymentLike,
  daysInMonth,
  monthBoundsISO,
  signedAmount,
} from "./lib/settlement";

// Bookings that should count toward rental days. Spec §3 — confirmed +
// active + completed/returned. Pending and cancelled are excluded.
const COUNTABLE_RESERVATION_STATUSES = new Set([
  "confirmed",
  "active",
  "returned",
]);

// Number of days of overlap between [aStart, aEnd) and [bStart, bEnd) (ISO).
function overlapDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start >= end) return 0;
  return Math.round(
    (Date.parse(end) - Date.parse(start)) / 86400000
  );
}

interface RangeArg {
  fromISO: string; // inclusive
  toISO: string; // exclusive
}

// 'YYYY-MM-DD' from a ms epoch.
function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function paymentReceivedInRange(
  p: { receivedAt?: number; status: string },
  fromISO: string,
  toISO: string
): boolean {
  if (p.status !== "received") return false;
  if (!p.receivedAt) return false;
  const iso = new Date(p.receivedAt).toISOString().slice(0, 10);
  return iso >= fromISO && iso < toISO;
}

export const dashboard = query({
  args: { adminToken: v.string(), fromISO: v.string(), toISO: v.string() },
  handler: async (ctx, { adminToken, fromISO, toISO: toEnd }) => {
    await assertAdminRead(ctx, adminToken);
    const reservations = await ctx.db.query("reservations").collect();
    const payments = await ctx.db.query("payments").collect();
    const bikes = await ctx.db.query("bikes").collect();
    const availability = await ctx.db.query("motorcycleAvailability").collect();

    const countable = reservations.filter((r) =>
      COUNTABLE_RESERVATION_STATUSES.has(r.status)
    );

    let rentalDaysSold = 0;
    const daysByBike = new Map<string, number>();
    const bookingsInRange: typeof reservations = [];
    for (const r of countable) {
      const d = overlapDays(r.startDate, r.endDate, fromISO, toEnd);
      if (d <= 0) continue;
      rentalDaysSold += d;
      daysByBike.set(r.bikeId, (daysByBike.get(r.bikeId) ?? 0) + d);
      bookingsInRange.push(r);
    }

    let revenue = 0;
    const revByBike = new Map<string, number>();
    const revByMethod = new Map<string, number>();
    for (const p of payments) {
      if (!paymentReceivedInRange(p, fromISO, toEnd)) continue;
      const amt = signedAmount(p as PaymentLike);
      if (amt === 0) continue;
      revenue += amt;
      revByMethod.set(p.method, (revByMethod.get(p.method) ?? 0) + amt);
      const r = reservations.find((rr) => rr._id === p.reservationId);
      if (r) {
        revByBike.set(r.bikeId, (revByBike.get(r.bikeId) ?? 0) + amt);
      }
    }

    // Available bike-days: per-bike days in range minus maintenance/blocked
    // days (pulled from motorcycleAvailability table). Bikes that aren't
    // operational at all in the range are excluded.
    const periodDays = Math.round(
      (Date.parse(toEnd) - Date.parse(fromISO)) / 86400000
    );
    let availableBikeDays = 0;
    for (const b of bikes) {
      const bikeStatus = b.status ?? (b.isActive ? "active" : "inactive");
      if (bikeStatus === "inactive" || bikeStatus === "sold") continue;
      const blocked = availability.filter(
        (a) =>
          a.bikeId === b._id && a.date >= fromISO && a.date < toEnd
      ).length;
      availableBikeDays += Math.max(0, periodDays - blocked);
    }

    const occupancy =
      availableBikeDays > 0 ? rentalDaysSold / availableBikeDays : 0;
    const avgDailyRate =
      rentalDaysSold > 0 ? revenue / rentalDaysSold : null;

    let topBikeId: string | null = null;
    let topBikeRev = -Infinity;
    for (const [id, r] of revByBike) {
      if (r > topBikeRev) {
        topBikeRev = r;
        topBikeId = id;
      }
    }
    const topBike = topBikeId
      ? bikes.find((b) => b._id === topBikeId) ?? null
      : null;

    let topMethod: string | null = null;
    let topMethodAmt = -Infinity;
    for (const [m, a] of revByMethod) {
      if (a > topMethodAmt) {
        topMethodAmt = a;
        topMethod = m;
      }
    }

    return {
      revenue,
      rentalCount: bookingsInRange.length,
      rentalDaysSold,
      availableBikeDays,
      occupancy,
      avgDailyRate,
      topBike: topBike
        ? {
            id: topBike._id,
            name: `${topBike.name} ${topBike.color}`,
            revenue: topBikeRev,
          }
        : null,
      topMethod: topMethod
        ? { method: topMethod, amount: topMethodAmt }
        : null,
    };
  },
});

// Per-month revenue/rentals/occupancy for a calendar year.
export const monthlySeries = query({
  args: { adminToken: v.string(), year: v.number() },
  handler: async (ctx, { adminToken, year }) => {
    await assertAdminRead(ctx, adminToken);
    const reservations = await ctx.db.query("reservations").collect();
    const payments = await ctx.db.query("payments").collect();
    const bikes = await ctx.db.query("bikes").collect();
    const availability = await ctx.db.query("motorcycleAvailability").collect();

    const result: {
      month: number;
      label: string;
      revenue: number;
      rentals: number;
      rentalDays: number;
      occupancy: number;
      availableDays: number;
      avgDailyRate: number | null;
    }[] = [];

    const monthLabel = (m: number) =>
      ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m];

    for (let m = 0; m < 12; m++) {
      const { start, end } = monthBoundsISO(year, m);
      const countable = reservations.filter((r) =>
        COUNTABLE_RESERVATION_STATUSES.has(r.status)
      );

      let rentalDays = 0;
      let rentals = 0;
      for (const r of countable) {
        const d = overlapDays(r.startDate, r.endDate, start, end);
        if (d <= 0) continue;
        rentalDays += d;
        rentals += 1;
      }

      let revenue = 0;
      for (const p of payments) {
        if (!paymentReceivedInRange(p, start, end)) continue;
        revenue += signedAmount(p as PaymentLike);
      }

      const dayCount = daysInMonth(year, m);
      let availableDays = 0;
      for (const b of bikes) {
        const bikeStatus = b.status ?? (b.isActive ? "active" : "inactive");
        if (bikeStatus === "inactive" || bikeStatus === "sold") continue;
        const blocked = availability.filter(
          (a) => a.bikeId === b._id && a.date >= start && a.date < end
        ).length;
        availableDays += Math.max(0, dayCount - blocked);
      }
      const occupancy = availableDays > 0 ? rentalDays / availableDays : 0;
      const avgDailyRate = rentalDays > 0 ? revenue / rentalDays : null;

      result.push({
        month: m + 1,
        label: monthLabel(m),
        revenue,
        rentals,
        rentalDays,
        occupancy,
        availableDays,
        avgDailyRate,
      });
    }

    return result;
  },
});

export const motorcyclePerformance = query({
  args: { adminToken: v.string(), fromISO: v.string(), toISO: v.string() },
  handler: async (ctx, { adminToken, fromISO, toISO: toEnd }) => {
    await assertAdminRead(ctx, adminToken);
    const bikes = await ctx.db.query("bikes").collect();
    const reservations = await ctx.db.query("reservations").collect();
    const payments = await ctx.db.query("payments").collect();
    const availability = await ctx.db.query("motorcycleAvailability").collect();

    const periodDays = Math.round(
      (Date.parse(toEnd) - Date.parse(fromISO)) / 86400000
    );
    const countable = reservations.filter((r) =>
      COUNTABLE_RESERVATION_STATUSES.has(r.status)
    );

    return bikes
      .map((b) => {
        const bikeStatus = b.status ?? (b.isActive ? "active" : "inactive");
        const bikeReservations = countable.filter((r) => r.bikeId === b._id);
        let rentalDays = 0;
        let bookings = 0;
        for (const r of bikeReservations) {
          const d = overlapDays(r.startDate, r.endDate, fromISO, toEnd);
          if (d <= 0) continue;
          rentalDays += d;
          bookings += 1;
        }
        const bikeReservationIds = new Set(bikeReservations.map((r) => r._id));
        let revenue = 0;
        for (const p of payments) {
          if (!paymentReceivedInRange(p, fromISO, toEnd)) continue;
          if (!bikeReservationIds.has(p.reservationId)) continue;
          revenue += signedAmount(p as PaymentLike);
        }
        const maintDays = availability.filter(
          (a) =>
            a.bikeId === b._id &&
            a.status === "maintenance" &&
            a.date >= fromISO &&
            a.date < toEnd
        ).length;
        const blockedDays = availability.filter(
          (a) =>
            a.bikeId === b._id &&
            a.status === "blocked" &&
            a.date >= fromISO &&
            a.date < toEnd
        ).length;
        const availableDays = Math.max(
          0,
          periodDays - maintDays - blockedDays
        );
        const occupancy = availableDays > 0 ? rentalDays / availableDays : 0;
        const adr = rentalDays > 0 ? revenue / rentalDays : null;
        const revPerAvail = availableDays > 0 ? revenue / availableDays : null;

        return {
          bikeId: b._id,
          name: `${b.name}${b.color ? " " + b.color : ""}`,
          status: bikeStatus,
          revenue,
          rentalDays,
          bookings,
          maintenanceDays: maintDays,
          blockedDays,
          availableDays,
          occupancy,
          avgDailyRate: adr,
          revenuePerAvailableDay: revPerAvail,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  },
});

// Per-bike monthly occupancy heatmap for a given year.
export const seasonalityHeatmap = query({
  args: { adminToken: v.string(), year: v.number() },
  handler: async (ctx, { adminToken, year }) => {
    await assertAdminRead(ctx, adminToken);
    const bikes = await ctx.db.query("bikes").collect();
    const reservations = await ctx.db.query("reservations").collect();
    const availability = await ctx.db.query("motorcycleAvailability").collect();
    const countable = reservations.filter((r) =>
      COUNTABLE_RESERVATION_STATUSES.has(r.status)
    );

    return bikes
      .filter((b) => {
        const s = b.status ?? (b.isActive ? "active" : "inactive");
        return s !== "sold";
      })
      .map((b) => {
        const cells = [] as { month: number; occupancy: number; rentalDays: number; availableDays: number }[];
        for (let m = 0; m < 12; m++) {
          const { start, end } = monthBoundsISO(year, m);
          let rentalDays = 0;
          for (const r of countable) {
            if (r.bikeId !== b._id) continue;
            rentalDays += overlapDays(r.startDate, r.endDate, start, end);
          }
          const totalDays = daysInMonth(year, m);
          const blocked = availability.filter(
            (a) => a.bikeId === b._id && a.date >= start && a.date < end
          ).length;
          const availableDays = Math.max(0, totalDays - blocked);
          const occupancy = availableDays > 0 ? rentalDays / availableDays : 0;
          cells.push({ month: m + 1, occupancy, rentalDays, availableDays });
        }
        return {
          bikeId: b._id,
          name: `${b.name}${b.color ? " " + b.color : ""}`,
          months: cells,
        };
      });
  },
});

export const paymentMethodSummary = query({
  args: { adminToken: v.string(), fromISO: v.string(), toISO: v.string() },
  handler: async (ctx, { adminToken, fromISO, toISO: toEnd }) => {
    await assertAdminRead(ctx, adminToken);
    const payments = await ctx.db.query("payments").collect();
    const cfg = await ctx.db.query("config").first();

    const inRange = payments.filter((p) =>
      paymentReceivedInRange(p, fromISO, toEnd)
    );

    const totals = new Map<
      string,
      {
        method: string;
        amount: number;
        count: number;
        jjAmount: number;
        karenAmount: number;
      }
    >();
    for (const p of inRange) {
      const amt = signedAmount(p as PaymentLike);
      if (amt === 0) continue;
      const row = totals.get(p.method) ?? {
        method: p.method,
        amount: 0,
        count: 0,
        jjAmount: 0,
        karenAmount: 0,
      };
      row.amount += amt;
      row.count += 1;
      if (p.collectedBy === "JJ") row.jjAmount += amt;
      else row.karenAmount += amt;
      totals.set(p.method, row);
    }

    const totalRevenue = Array.from(totals.values()).reduce(
      (s, r) => s + r.amount,
      0
    );

    const labelByMethod: Record<string, { label: string; defaultCollector?: string }> = {};
    for (const m of cfg?.paymentMethods ?? []) {
      labelByMethod[m.id] = {
        label: m.label,
        defaultCollector: m.defaultCollector,
      };
    }

    return {
      totalRevenue,
      rows: Array.from(totals.values())
        .map((r) => ({
          ...r,
          label: labelByMethod[r.method]?.label ?? r.method,
          defaultCollector: labelByMethod[r.method]?.defaultCollector ?? null,
          percent: totalRevenue > 0 ? r.amount / totalRevenue : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  },
});

// Booking source performance for the Bookings tab.
export const sourcePerformance = query({
  args: { adminToken: v.string(), fromISO: v.string(), toISO: v.string() },
  handler: async (ctx, { adminToken, fromISO, toISO: toEnd }) => {
    await assertAdminRead(ctx, adminToken);
    const reservations = await ctx.db.query("reservations").collect();
    const payments = await ctx.db.query("payments").collect();
    const countable = reservations.filter((r) =>
      COUNTABLE_RESERVATION_STATUSES.has(r.status)
    );

    const bySource = new Map<
      string,
      {
        source: string;
        bookings: number;
        rentalDays: number;
        revenue: number;
      }
    >();

    for (const r of countable) {
      const d = overlapDays(r.startDate, r.endDate, fromISO, toEnd);
      if (d <= 0) continue;
      const src = r.source ?? "other";
      const row = bySource.get(src) ?? {
        source: src,
        bookings: 0,
        rentalDays: 0,
        revenue: 0,
      };
      row.bookings += 1;
      row.rentalDays += d;
      bySource.set(src, row);
    }

    for (const p of payments) {
      if (!paymentReceivedInRange(p, fromISO, toEnd)) continue;
      const r = reservations.find((rr) => rr._id === p.reservationId);
      if (!r) continue;
      const src = r.source ?? "other";
      const row = bySource.get(src);
      if (!row) continue;
      row.revenue += signedAmount(p as PaymentLike);
    }

    return Array.from(bySource.values())
      .map((r) => ({
        ...r,
        avgBookingValue: r.bookings > 0 ? r.revenue / r.bookings : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },
});
