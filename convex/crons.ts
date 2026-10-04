import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("refresh google reviews", { hourUTC: 12, minuteUTC: 0 }, internal.reviews.refresh);
// Daily owner report email disabled 2026-10-03 at the owner's request. To
// re-enable: crons.daily("daily owner report", { hourUTC: 3, minuteUTC: 0 },
// internal.reportSend.sendDaily);
export default crons;
