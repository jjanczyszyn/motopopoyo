// What a booking still owes. Shared by reservations.listForAdmin (which
// renders the balance) and payments.markPaid (which writes it), so the amount
// on the "Mark paid" button is always the amount that gets recorded.

export interface PaymentLike {
  amount: number;
  status: string;
  paymentType: string;
}

/** Net of received payments; refunds count against the total. */
export function receivedTotal(payments: PaymentLike[]): number {
  let total = 0;
  for (const p of payments) {
    if (p.status !== "received") continue;
    total += p.paymentType === "refund" ? -p.amount : p.amount;
  }
  return total;
}

/**
 * Outstanding balance, rounded to cents so floating-point crumbs never leave a
 * booking showing a $0.004 balance that can't be cleared.
 */
export function outstanding(totalUSD: number, payments: PaymentLike[]): number {
  return round2(totalUSD - receivedTotal(payments));
}

export type PayStatus = "unpaid" | "partial" | "paid" | "overpaid" | "refunded";

export function payStatusFor(
  totalUSD: number,
  payments: PaymentLike[]
): PayStatus {
  const paid = receivedTotal(payments);
  const hasRefund = payments.some(
    (p) => p.status === "received" && p.paymentType === "refund"
  );
  if (paid <= 0) return hasRefund ? "refunded" : "unpaid";
  if (paid < totalUSD) return "partial";
  if (paid > totalUSD) return "overpaid";
  return "paid";
}

export function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  // Normalise -0, which would otherwise render as "-$0.00" in a balance cell.
  return r === 0 ? 0 : r;
}
