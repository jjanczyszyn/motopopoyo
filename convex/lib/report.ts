// Pure logic for the daily owner email: rental + revenue summary for the day,
// the last 7 days, and the month-to-date, plus the JJ/Karen split and the
// outstanding (all-time) balance between the partners.
//
// Kept free of Convex so it can be unit-tested; convex/report.ts is a thin
// wrapper that loads the tables and sends the email.

import {
  BookingSplitLookup,
  PaymentLike,
  TransferLike,
  DEFAULT_JJ_PCT,
  DEFAULT_KAREN_PCT,
  formatUSD,
  signedAmount,
  summariseSettlement,
} from "./settlement";

// Bookings that count as real rentals (mirror metrics.ts).
const COUNTABLE = new Set(["confirmed", "active", "returned"]);

export interface ReportReservation {
  _id: string;
  code: string;
  status: string;
  bikeId: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD (exclusive end)
  days: number;
  totalUSD: number;
  docFirstName: string;
  docLastName: string;
  jjSharePct?: number;
  karenSharePct?: number;
}

export interface ReportInput {
  nowMs: number;
  timezone: string;
  currency: string;
  businessName: string;
  fallbackJjPct: number;
  fallbackKarenPct: number;
  payments: PaymentLike[];
  reservations: ReportReservation[];
  transfers: TransferLike[];
  bikeNames: Record<string, string>; // bikeId → display name
}

export interface WindowSummary {
  label: string;
  fromISO: string;
  toInclusiveISO: string;
  revenue: number;
  rentalCount: number;
  rentalDays: number;
  jjShare: number; // expected share of this window's revenue
  karenShare: number;
  jjCollected: number;
  karenCollected: number;
}

export interface DailyReport {
  dateISO: string;
  dateLabel: string;
  currency: string;
  businessName: string;
  day: WindowSummary;
  week: WindowSummary;
  month: WindowSummary;
  pendingBalance: number; // all-time JJ net (>0 Karen owes JJ)
  pendingBalanceLabel: string;
  todaysRentals: {
    code: string;
    customer: string;
    bike: string;
    startDate: string;
    endDate: string;
    days: number;
    totalUSD: number;
    status: string;
  }[];
}

// ---- date helpers (timezone-aware via Intl, ISO-date string math) ----------

// Local 'YYYY-MM-DD' for a ms epoch in the given IANA timezone.
export function localDateISO(ms: number, timezone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function firstOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

// Overlap (in days) of booking [aStart,aEnd) with window [bStart,bEnd) — all ISO.
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start >= end) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}

// ---- core ------------------------------------------------------------------

function splitLookup(
  reservations: ReportReservation[],
  fj: number,
  fk: number
): BookingSplitLookup {
  const map = new Map<string, { jjPct: number; karenPct: number }>();
  for (const r of reservations) {
    map.set(r._id, { jjPct: r.jjSharePct ?? fj, karenPct: r.karenSharePct ?? fk });
  }
  return { splitFor: (id) => map.get(id) ?? { jjPct: fj, karenPct: fk } };
}

function windowSummary(
  label: string,
  fromISO: string,
  toInclusiveISO: string,
  input: ReportInput,
  splits: BookingSplitLookup
): WindowSummary {
  const tz = input.timezone;
  const toExclusiveISO = addDaysISO(toInclusiveISO, 1);

  let revenue = 0, jjShare = 0, karenShare = 0, jjCollected = 0, karenCollected = 0;
  for (const p of input.payments) {
    if (p.status !== "received" || !p.receivedAt) continue;
    const d = localDateISO(p.receivedAt, tz);
    if (d < fromISO || d > toInclusiveISO) continue;
    const amt = signedAmount(p);
    if (amt === 0) continue;
    revenue += amt;
    const { jjPct, karenPct } = splits.splitFor(p.reservationId);
    jjShare += (amt * jjPct) / 100;
    karenShare += (amt * karenPct) / 100;
    if (p.collectedBy === "JJ") jjCollected += amt;
    else karenCollected += amt;
  }

  let rentalCount = 0, rentalDays = 0;
  for (const r of input.reservations) {
    if (!COUNTABLE.has(r.status)) continue;
    const d = overlapDays(r.startDate, r.endDate, fromISO, toExclusiveISO);
    if (d <= 0) continue;
    rentalCount += 1;
    rentalDays += d;
  }

  return { label, fromISO, toInclusiveISO, revenue, rentalCount, rentalDays, jjShare, karenShare, jjCollected, karenCollected };
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildReport(input: ReportInput): DailyReport {
  const today = localDateISO(input.nowMs, input.timezone);
  const splits = splitLookup(input.reservations, input.fallbackJjPct, input.fallbackKarenPct);

  const day = windowSummary("Today", today, today, input, splits);
  const week = windowSummary("Last 7 days", addDaysISO(today, -6), today, input, splits);
  const month = windowSummary("Month to date", firstOfMonthISO(today), today, input, splits);

  // Outstanding balance between partners — all received payments + all transfers.
  const allSettle = summariseSettlement(
    input.payments.filter((p) => p.status === "received"),
    input.transfers,
    splits
  );

  // Rentals active today (overlap with today).
  const toExcl = addDaysISO(today, 1);
  const todaysRentals = input.reservations
    .filter((r) => COUNTABLE.has(r.status) && overlapDays(r.startDate, r.endDate, today, toExcl) > 0)
    .map((r) => ({
      code: r.code,
      customer: `${r.docFirstName} ${r.docLastName}`.trim() || "—",
      bike: input.bikeNames[r.bikeId] ?? "—",
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      totalUSD: r.totalUSD,
      status: r.status,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    dateISO: today,
    dateLabel: prettyDate(today),
    currency: input.currency,
    businessName: input.businessName,
    day,
    week,
    month,
    pendingBalance: allSettle.jjFinalBalance,
    pendingBalanceLabel: allSettle.label,
    todaysRentals,
  };
}

// ---- email rendering -------------------------------------------------------

function windowText(w: WindowSummary): string {
  return [
    `${w.label}: ${formatUSD(w.revenue)} · ${w.rentalCount} rental${w.rentalCount === 1 ? "" : "s"} (${w.rentalDays} day${w.rentalDays === 1 ? "" : "s"})`,
    `    JJ ${formatUSD(w.jjShare)} / Karen ${formatUSD(w.karenShare)}  ·  collected: JJ ${formatUSD(w.jjCollected)}, Karen ${formatUSD(w.karenCollected)}`,
  ].join("\n");
}

export function renderReportEmail(r: DailyReport): { subject: string; text: string; html: string } {
  const subject = `${r.businessName} — daily report ${r.dateISO} (${formatUSD(r.day.revenue)} today)`;

  const rentalsText = r.todaysRentals.length
    ? r.todaysRentals
        .map((x) => `  • ${x.code}  ${x.customer}  ${x.bike}  ${x.startDate}→${x.endDate} (${x.days}d)  ${formatUSD(x.totalUSD)}  [${x.status}]`)
        .join("\n")
    : "  (no active rentals today)";

  const text = [
    `${r.businessName} — ${r.dateLabel}`,
    "",
    windowText(r.day),
    windowText(r.week),
    windowText(r.month),
    "",
    `Pending balance between partners: ${r.pendingBalanceLabel}`,
    "",
    "Active rentals today:",
    rentalsText,
    "",
    "Split is JJ/Karen per booking; 'pending balance' nets all received payments against recorded settlement transfers.",
  ].join("\n");

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const row = (w: WindowSummary) => `
    <tr>
      <td style="padding:6px 10px;font-weight:600">${w.label}</td>
      <td style="padding:6px 10px;text-align:right">${formatUSD(w.revenue)}</td>
      <td style="padding:6px 10px;text-align:right">${w.rentalCount} (${w.rentalDays}d)</td>
      <td style="padding:6px 10px;text-align:right">${formatUSD(w.jjShare)}</td>
      <td style="padding:6px 10px;text-align:right">${formatUSD(w.karenShare)}</td>
    </tr>`;
  const rentalsHtml = r.todaysRentals.length
    ? r.todaysRentals
        .map(
          (x) => `<tr><td style="padding:4px 8px">${esc(x.code)}</td><td style="padding:4px 8px">${esc(x.customer)}</td><td style="padding:4px 8px">${esc(x.bike)}</td><td style="padding:4px 8px">${x.startDate}→${x.endDate}</td><td style="padding:4px 8px;text-align:right">${formatUSD(x.totalUSD)}</td><td style="padding:4px 8px">${esc(x.status)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="6" style="padding:8px;color:#777">No active rentals today.</td></tr>`;

  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;color:#1a1a1a">
  <h2 style="margin:0 0 4px">${esc(r.businessName)}</h2>
  <div style="color:#666;margin-bottom:16px">${esc(r.dateLabel)}</div>
  <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #eee">
    <thead><tr style="background:#fafafa">
      <th style="padding:6px 10px;text-align:left">Period</th>
      <th style="padding:6px 10px;text-align:right">Revenue</th>
      <th style="padding:6px 10px;text-align:right">Rentals</th>
      <th style="padding:6px 10px;text-align:right">JJ share</th>
      <th style="padding:6px 10px;text-align:right">Karen share</th>
    </tr></thead>
    <tbody>${row(r.day)}${row(r.week)}${row(r.month)}</tbody>
  </table>
  <p style="font-size:15px;margin:16px 0"><strong>Pending balance between partners:</strong> ${esc(r.pendingBalanceLabel)}</p>
  <h3 style="margin:18px 0 6px;font-size:15px">Active rentals today</h3>
  <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #eee"><tbody>${rentalsHtml}</tbody></table>
  <p style="color:#999;font-size:12px;margin-top:18px">Split is JJ/Karen per booking; "pending balance" nets all received payments against recorded settlement transfers. Automated daily report.</p>
</div>`;

  return { subject, text, html };
}
