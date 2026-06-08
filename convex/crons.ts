import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("check job deadlines and reminders", { minutes: 30 }, internal.notifications.checkJobDeadlines, {});
crons.interval("generate daily report snapshot", { hours: 24 }, internal.reports.generateDailySnapshot, {});
crons.interval("generate weekly report snapshot", { hours: 24 * 7 }, internal.reports.generateWeeklySnapshot, {});
crons.interval("generate monthly report snapshot", { hours: 24 * 30 }, internal.reports.generateMonthlySnapshot, {});
crons.interval("generate quarterly report snapshot", { hours: 24 * 91 }, internal.reports.generateQuarterlySnapshot, {});
crons.interval("generate annual report snapshot", { hours: 24 * 365 }, internal.reports.generateAnnualSnapshot, {});

export default crons;
