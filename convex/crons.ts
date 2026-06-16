import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("refresh google reviews", { hourUTC: 12, minuteUTC: 0 }, internal.reviews.refresh);
// Daily owner report at 9:00 PM America/Managua (UTC-6) → 03:00 UTC.
crons.daily("daily owner report", { hourUTC: 3, minuteUTC: 0 }, internal.reportSend.sendDaily);
export default crons;
