# Data change log

Every hand-made change to **production data** (Convex `tough-meadowlark-233`)
lands here: what changed, why, the evidence, and how it was applied. Customer
names are **never** written here (see `CLAUDE.md`). Rows are identified by
booking code; the name is in the admin app.

Each change is also tagged in the database itself: the booking's or payment's
`notes` field carries the tag in brackets (e.g. `[backfill 2026-11-07]`), so
the admin app shows where a figure came from.

---

## 2026-11-07: back-fill of Jun–Nov rentals and payments

**Why.** No payment had been recorded in the app since 2026-07-11. Karen took
bookings through the renter site but never used the admin, so they stayed
"pending", and some rentals were only reported in WhatsApp. Revenue and the
partner split were understated.

**Evidence.** Karen's WhatsApp messages (dates quoted below), JJ's
Venmo/Wise statements, and the bookings already in the app. Where no digital
payment was found, the rental is assumed **paid in cash to Karen** (agreed by
JJ on 2026-11-07).

**How.** A one-off script using the admin API (logged in as JJ), run first as
a dry run and then applied; it is idempotent (re-running plans 0 changes). A
full table export was taken first and kept locally, outside git. The script
itself contains customer names, so it is not committed.

**Effect.** All-time received revenue went from **$6,237** to **$6,917**
(**+$680**), across 70 bookings and 70 payments.

### Payments recorded on existing bookings

| Booking | Rental | Bike | Change | Evidence |
|---|---|---|---|---|
| KJ-GFT3-624 | Jul 26–31 | Yamaha | +$90 cash (Karen), → returned | Karen Jul 26: rented the Yamaha 5 days, paid in córdobas |
| KJ-BLE2-644 | Aug 4–8 | Genesis blue | price $72 → **$80** agreed; +$80 cash (Karen), → returned | Karen Aug 4: "4 días a $20 por día" |
| KJ-9AK7-410 | Aug 11–17 | Yamaha | +$108 cash (Karen), → returned | booking forwarded by Karen Aug 11; cash assumed |
| KJ-K5GZ-361 | Aug 22–29 | Yamaha | price $108 → **$120** agreed; +$120 cash (Karen), → returned | Karen Aug 22: "120$ una semana" |
| KJ-TRMC-925 | Oct 20–22 | Genesis blue | +$36 Wise (JJ), → returned | Wise statement Oct 21 |

### Corrections

| Booking | Change | Evidence |
|---|---|---|
| KJ-FU7J-273 | dates Jun 21–26 → **Jun 20–26**, price $100 → **$120** agreed; +$20 Venmo (JJ) Jun 26; **−$100 refund** (deposit returned in cash by Karen) Jun 26; → returned | Karen Jun 20/25/27; Venmo "Extra day". The $200 Venmo included the $100 deposit. |
| KJ-4RVH-390 | price $54 → **$60** agreed; its cash payment $54 → $60 | Karen Jun 27: "Genesis azul 3 días: $60" |
| KJ-GHUY-479 | active → returned (rental ended Jul 27, already paid) | booking dates |
| KJ-KBWX-724 | active → returned (rental ended May 11, already paid) | booking dates |

### Rentals added (only reported in WhatsApp)

All are status *returned*, source *whatsapp*, paid in cash to Karen.

| Booking | Rental | Bike | Price | Evidence |
|---|---|---|---|---|
| KJ-TPVY-353 | Sep 16–18 | Genesis red ("rosa") | $40 | Karen Nov 7 (name + dates + price) |
| KJ-B72R-767 | Sep 16–18 | Genesis blue | $40 | Karen Nov 7 (dates + price; **renter's name to confirm**) |
| KJ-D5NM-956 | Oct 2–9 | Yamaha | $110 | Karen Nov 7 (name + dates + price) |
| KJ-RZRR-664 | Oct 2–5 | Genesis blue | $50 | Karen Oct 3 (**name pending**) |
| KJ-VQLW-866 | Nov 2–6 | Yamaha | $80 | Karen Nov 2 (**name pending**) |

### Still open

- Names for KJ-B72R-767, KJ-RZRR-664 and KJ-VQLW-866.
- Karen's voice note of 2026-11-07 03:29 UTC was not transcribed; it may
  mention more rentals.
- Possible extra Yamaha day around Jul 3 ("Un día más dejó la Yamaha"); not
  added, as it isn't clear which booking it belongs to.
- Two bookings for Nov 7–10 (both bikes, same renter) are real per Karen's
  Nov 6 message; left as pending until the rental happens.
