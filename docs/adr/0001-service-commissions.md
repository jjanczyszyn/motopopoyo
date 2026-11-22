# ADR 0001: Service commissions are kept apart from moto revenue

- Date: 2026-11-22
- Status: accepted

## Context

Karen and JJ also arrange services (massage, pedicure, childcare, transport).
The client pays one price, the provider gets another, and the difference is the
commission. Karen needs to log these where she already logs rentals.

`payments` is the source of truth for moto revenue and the partner settlement,
and every payment belongs to a reservation and is split 70/30 by default. No
split has been agreed for service commissions.

## Decision

- A separate `serviceSales` table holds price and cost. Commission is computed,
  never stored, so it can't disagree with them.
- Services don't count in moto revenue, occupancy figures, average daily rate or
  the partner settlement. They have their own totals.
- `addedBy` records who logged each service. Who holds the money isn't recorded.

## Consequences

- Existing figures and partner balances don't move.
- If the partners agree a split, add the percentages (and who collected the
  money) to `serviceSales` and include the commission in `settlement.summary`.
  Rows logged before that would need a default.
