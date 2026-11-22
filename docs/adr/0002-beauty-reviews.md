# ADR 0002: Popoyo Beauty reviews live in the moto backend

- Date: 2026-11-22
- Status: accepted

## Context

Popoyo Beauty has no Google Business Profile yet and customers want to leave
reviews now. Its site is static and reads nothing from a database. Tripadvisor
doesn't list mobile massage or nail services. Reviews from a public form need an
owner to check them before they appear.

## Decision

- A `beautyReviews` table in this Convex project, with a public `submit` and
  `published`, moderated in the admin both owners already use. A separate beauty
  project would need its own login and admin.
- Nothing is shown until published. Every genuine review is published whatever
  its stars; only spam, abuse or non-customers are hidden. Text can't be edited.
- No star-rating structured data: Google doesn't show review stars that a
  business marks up about itself.

## Consequences

- If this backend is down the beauty site still works, without reviews.
- When the Google profile is ready, customers can be sent there instead, all of
  them and not only the happy ones.
