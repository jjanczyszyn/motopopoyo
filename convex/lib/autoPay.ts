// Website bookings are recorded as paid the moment they're made (nobody was
// marking them by hand). Cash changes hands at the bike hand-off; electronic
// money is sent at booking time but must be checked against JJ's own records
// (payment emails), so it starts "unverified".

export const AUTO_PAYMENT_NOTE = "Recorded automatically at booking";

export type Verification = "unverified" | "verified" | "mismatch";

export function isElectronic(method: string): boolean {
  return method !== "cash";
}

export function autoPaymentFor(
  r: { payMethod: string; startDate: string; totalUSD: number },
  defaultCollector: "Karen" | "JJ" | "manual" | undefined,
  now: number
): {
  amount: number;
  collectedBy: "Karen" | "JJ";
  receivedAt: number;
  verification?: Verification;
} {
  const electronic = isElectronic(r.payMethod);
  const startMs = Date.parse(`${r.startDate}T12:00:00Z`);
  return {
    amount: r.totalUSD,
    collectedBy: defaultCollector === "Karen" ? "Karen" : "JJ",
    // Cash: midday on the start day (the hand-off). Electronic: now.
    receivedAt: electronic || !Number.isFinite(startMs) ? now : startMs,
    verification: electronic ? "unverified" : undefined,
  };
}
