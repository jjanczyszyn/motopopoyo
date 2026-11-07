/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as availability from "../availability.js";
import type * as bikes from "../bikes.js";
import type * as config from "../config.js";
import type * as contract from "../contract.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as lib_balance from "../lib/balance.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_googleReviews from "../lib/googleReviews.js";
import type * as lib_integrity from "../lib/integrity.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_report from "../lib/report.js";
import type * as lib_season from "../lib/season.js";
import type * as lib_settlement from "../lib/settlement.js";
import type * as metrics from "../metrics.js";
import type * as ocr from "../ocr.js";
import type * as pastBookings from "../pastBookings.js";
import type * as payments from "../payments.js";
import type * as report from "../report.js";
import type * as reportSend from "../reportSend.js";
import type * as reservations from "../reservations.js";
import type * as reviews from "../reviews.js";
import type * as seed from "../seed.js";
import type * as settlement from "../settlement.js";
import type * as storage from "../storage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  availability: typeof availability;
  bikes: typeof bikes;
  config: typeof config;
  contract: typeof contract;
  crons: typeof crons;
  events: typeof events;
  "lib/balance": typeof lib_balance;
  "lib/events": typeof lib_events;
  "lib/googleReviews": typeof lib_googleReviews;
  "lib/integrity": typeof lib_integrity;
  "lib/pricing": typeof lib_pricing;
  "lib/report": typeof lib_report;
  "lib/season": typeof lib_season;
  "lib/settlement": typeof lib_settlement;
  metrics: typeof metrics;
  ocr: typeof ocr;
  pastBookings: typeof pastBookings;
  payments: typeof payments;
  report: typeof report;
  reportSend: typeof reportSend;
  reservations: typeof reservations;
  reviews: typeof reviews;
  seed: typeof seed;
  settlement: typeof settlement;
  storage: typeof storage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
