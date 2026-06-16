import { internalQuery } from "./_generated/server";
import {
  DEFAULT_JJ_PCT,
  DEFAULT_KAREN_PCT,
  PaymentLike,
  TransferLike,
} from "./lib/settlement";
import { ReportReservation } from "./lib/report";

// Gather everything the daily report needs in one read-side query. The sending
// action (convex/reportSend.ts) runs this, then builds + emails the report.
export const data = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.db.query("config").first();
    const payments = await ctx.db.query("payments").collect();
    const reservations = await ctx.db.query("reservations").collect();
    const transfers = await ctx.db.query("settlementTransfers").collect();
    const bikes = await ctx.db.query("bikes").collect();

    const bikeNames: Record<string, string> = {};
    for (const b of bikes) bikeNames[b._id] = `${b.name}${b.color ? " " + b.color : ""}`;

    return {
      timezone: cfg?.timezone ?? "America/Managua",
      currency: cfg?.currency ?? "USD",
      businessName: cfg?.businessName ?? "Popoyo Moto",
      fallbackJjPct: cfg?.jjSharePercentage ?? DEFAULT_JJ_PCT,
      fallbackKarenPct: cfg?.karenSharePercentage ?? DEFAULT_KAREN_PCT,
      payments: payments as unknown as PaymentLike[],
      transfers: transfers as unknown as TransferLike[],
      bikeNames,
      reservations: reservations.map((r) => ({
        _id: r._id as unknown as string,
        code: r.code,
        status: r.status,
        bikeId: r.bikeId as unknown as string,
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.days,
        totalUSD: r.totalUSD,
        docFirstName: r.docFirstName,
        docLastName: r.docLastName,
        jjSharePct: r.jjSharePct,
        karenSharePct: r.karenSharePct,
      })) as ReportReservation[],
    };
  },
});
