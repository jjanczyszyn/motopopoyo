import { describe, it, expect } from "vitest";
import { outstanding, payStatusFor, receivedTotal } from "./balance";

const received = (amount: number, paymentType = "full_payment") => ({
  amount, status: "received", paymentType,
});

describe("receivedTotal", () => {
  it("ignores anything not received", () => {
    expect(
      receivedTotal([
        received(50),
        { amount: 100, status: "pending", paymentType: "balance" },
        { amount: 100, status: "failed", paymentType: "balance" },
        { amount: 100, status: "cancelled", paymentType: "balance" },
      ])
    ).toBe(50);
  });

  it("subtracts refunds", () => {
    expect(receivedTotal([received(120), received(20, "refund")])).toBe(100);
  });
});

describe("outstanding", () => {
  it("is the full total when nothing is paid", () => {
    expect(outstanding(108, [])).toBe(108);
  });

  it("nets off part payments", () => {
    expect(outstanding(108, [received(50, "deposit")])).toBe(58);
  });

  it("is zero once fully paid", () => {
    expect(outstanding(108, [received(108)])).toBe(0);
  });

  it("goes negative when overpaid", () => {
    expect(outstanding(108, [received(120)])).toBe(-12);
  });

  it("rounds to cents so no un-clearable crumb is left", () => {
    // 0.1 + 0.2 === 0.30000000000000004 — without rounding this booking would
    // sit at a balance of 4e-17 forever and never read as paid.
    const total = 0.3;
    expect(outstanding(total, [received(0.1), received(0.2)])).toBe(0);
  });

  it("a refund reopens the balance", () => {
    expect(outstanding(108, [received(108), received(108, "refund")])).toBe(108);
  });
});

describe("payStatusFor", () => {
  it("unpaid with no payments", () => {
    expect(payStatusFor(108, [])).toBe("unpaid");
  });

  it("partial, paid and overpaid", () => {
    expect(payStatusFor(108, [received(50)])).toBe("partial");
    expect(payStatusFor(108, [received(108)])).toBe("paid");
    expect(payStatusFor(108, [received(150)])).toBe("overpaid");
  });

  it("refunded once the money has gone back out", () => {
    expect(payStatusFor(108, [received(108), received(108, "refund")])).toBe(
      "refunded"
    );
  });

  it("a pending payment does not make a booking partial", () => {
    expect(
      payStatusFor(108, [{ amount: 108, status: "pending", paymentType: "full_payment" }])
    ).toBe("unpaid");
  });
});
