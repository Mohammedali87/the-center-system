/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("CRM security and reminders", () => {
  test("staff can only see and update their assigned tasks", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const staffA = await insertUser(t, "employee", "a@test.example");
    const staffB = await insertUser(t, "employee", "b@test.example");
    const [taskA, taskB] = await insertTasks(t, ownerId, staffA, staffB);
    const asStaffA = asUser(t, staffA);

    const visible = await asStaffA.query(api.jobs.list, {});
    expect(visible.map((job) => job._id)).toEqual([taskA]);
    await asStaffA.mutation(api.jobs.updateStatus, { jobId: taskA, status: "Completed" });
    await expect(asStaffA.mutation(api.jobs.updateStatus, { jobId: taskB, status: "Completed" })).rejects.toThrow(
      /assigned to you/
    );
    await asStaffA.mutation(api.jobs.addNote, { jobId: taskA, audience: "employee", body: "Progress update" });
    await expect(asStaffA.mutation(api.jobs.addNote, { jobId: taskB, audience: "employee", body: "Not mine" })).rejects.toThrow(
      /assigned to you/
    );
  });

  test("24-hour and 3-hour reminders are deduplicated", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const staff = await insertUser(t, "employee", "staff@test.example");
    const now = Date.now();
    const taskId = await t.run(async (ctx) => {
      return await ctx.db.insert("jobs", {
        jobType: "Near deadline",
        fee: 0,
        amountPaid: 0,
        assignedEmployeeId: staff,
        status: "Assigned",
        dueDate: new Date(now + 2 * 3600000).toISOString().slice(0, 10),
        deadlineAt: now + 2 * 3600000,
        priority: "High",
        createdBy: ownerId,
        createdAt: now,
        updatedAt: now
      });
    });

    await t.mutation(internal.notifications.checkJobDeadlines, {});
    await t.mutation(internal.notifications.checkJobDeadlines, {});
    const result = await t.run(async (ctx) => {
      const job = await ctx.db.get(taskId);
      const notices = await ctx.db.query("notifications").withIndex("by_job_id", (q) => q.eq("jobId", taskId)).take(20);
      return { job, notices };
    });
    expect(result.job?.reminder3hSentAt).toBeTypeOf("number");
    expect(result.notices.filter((notice) => notice.dedupeKey === `deadline:3h:${taskId}`)).toHaveLength(1);
  });

  test("chatbot writes require confirmation and enforce ownership", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const staffA = await insertUser(t, "employee", "a@test.example");
    const staffB = await insertUser(t, "employee", "b@test.example");
    const [, taskB] = await insertTasks(t, ownerId, staffA, staffB);
    const proposalId = await t.run(async (ctx) => {
      return await ctx.db.insert("chatProposals", {
        userId: staffA,
        action: "complete_task",
        jobId: taskB,
        payload: "",
        summary: "Complete another user's task",
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
        confirmedAt: null
      });
    });
    await expect(asUser(t, staffA).mutation(api.chatbot.confirm, { proposalId, approved: true })).rejects.toThrow(
      /permission/
    );
  });

  test("Cent AI confirms permission-scoped payment and client actions", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const [jobId] = await insertTasks(t, ownerId, ownerId, ownerId);
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { fee: 500 });
    });
    const paymentProposal = await insertProposal(t, ownerId, "record_payment", jobId, JSON.stringify({ amount: 125, note: "Deposit" }));
    const clientProposal = await insertProposal(t, ownerId, "create_client", null, JSON.stringify({ name: "Cent AI Client", email: "client@example.com", phone: null }));

    await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId: paymentProposal, approved: true });
    await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId: clientProposal, approved: true });

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      client: await ctx.db.query("clients").withIndex("by_client_name", (q) => q.eq("clientName", "Cent AI Client")).unique()
    }));
    expect(result.job?.amountPaid).toBe(125);
    expect(result.client?.email).toBe("client@example.com");
  });

  test("Center AI confirms every supported CRM action", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const [jobId] = await insertTasks(t, ownerId, ownerId, ownerId);
    const deadlineAt = Date.parse("2026-08-15T15:00:00Z");
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { fee: 500 });
    });

    const proposals = [
      await insertAnyProposal(t, ownerId, "add_note", jobId, "Customer supplied the missing document."),
      await insertAnyProposal(t, ownerId, "change_deadline", jobId, String(deadlineAt)),
      await insertAnyProposal(t, ownerId, "change_status", jobId, "In Progress"),
      await insertAnyProposal(t, ownerId, "record_payment", jobId, JSON.stringify({ amount: 125, note: "Deposit" })),
      await insertAnyProposal(
        t,
        ownerId,
        "create_client",
        null,
        JSON.stringify({ name: "Full Audit Client", email: "audit@example.com", phone: "555-0100" })
      ),
      await insertAnyProposal(t, ownerId, "create_service", null, JSON.stringify({ name: "Full Audit Service", fee: 275 }))
    ];
    for (const proposalId of proposals) {
      await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId, approved: true });
    }
    const completeProposal = await insertAnyProposal(t, ownerId, "complete_task", jobId, "");
    await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId: completeProposal, approved: true });

    const result = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      notes: await ctx.db.query("jobNotes").withIndex("by_job", (q) => q.eq("jobId", jobId)).take(10),
      payments: await ctx.db.query("payments").withIndex("by_job", (q) => q.eq("jobId", jobId)).take(10),
      client: await ctx.db.query("clients").withIndex("by_client_name", (q) => q.eq("clientName", "Full Audit Client")).unique(),
      service: await ctx.db.query("services").withIndex("by_normalized_name", (q) => q.eq("normalizedName", "full audit service")).unique(),
      audits: await ctx.db.query("auditLogs").take(20)
    }));
    expect(result.job).toMatchObject({
      status: "Completed",
      dueDate: "2026-08-15",
      deadlineAt,
      amountPaid: 125
    });
    expect(result.notes.map((note) => note.body)).toContain("Customer supplied the missing document.");
    expect(result.payments.map((payment) => payment.amount)).toContain(125);
    expect(result.client?.email).toBe("audit@example.com");
    expect(result.service?.defaultFee).toBe(275);
    expect(result.audits.filter((audit) => audit.action.startsWith("chatbot.") && audit.action.endsWith(".confirmed"))).toHaveLength(7);
  });

  test("Center AI recognizes every supported natural-language command", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const [jobId] = await insertTasks(t, ownerId, ownerId, ownerId);
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { jobOrderId: "JO-AUDIT1" });
    });
    const bot = asUser(t, ownerId);
    const commands = [
      "add a note to JO-AUDIT1: Documents received",
      "mark JO-AUDIT1 completed",
      "change the deadline for JO-AUDIT1 to 2026-08-15 3:00 PM",
      "set status of JO-AUDIT1 to In Progress",
      "record a payment of $125 for JO-AUDIT1: Deposit",
      "reassign JO-AUDIT1 to owner@test.example",
      "schedule task Audit Review for Audit Customer assign to owner@test.example due 2026-09-15 3:00 PM priority High fee $350",
      "create client Audit Company email audit@example.com phone 555-0100",
      "create service Audit Filing with fee $275"
    ];
    await insertCustomer(t, ownerId, "Audit Customer");
    for (const message of commands) {
      const response = await bot.action(api.chatbot.ask, { message });
      expect(response.proposalId).toBeTruthy();
      expect(response.text).toContain("prepared this action for your approval");
    }
    const proposals = await t.run(async (ctx) =>
      await ctx.db.query("chatProposals").withIndex("by_user_id", (q) => q.eq("userId", ownerId)).take(20)
    );
    expect(proposals.map((proposal) => proposal.action)).toEqual([
      "add_note",
      "complete_task",
      "change_deadline",
      "change_status",
      "record_payment",
      "reassign_task",
      "create_scheduled_task",
      "create_client",
      "create_service"
    ]);
    expect(proposals.every((proposal) => proposal.status === "pending")).toBe(true);
  });

  test("Center AI creates scheduled tasks and reassigns jobs after approval", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const staffId = await insertUser(t, "employee", "staff@test.example");
    const customerId = await insertCustomer(t, ownerId, "Schedule Customer");
    const [existingJobId] = await insertTasks(t, ownerId, ownerId, ownerId);
    const deadlineAt = Date.parse("2026-09-15T15:00:00Z");
    const createProposal = await insertAnyProposal(
      t,
      ownerId,
      "create_scheduled_task",
      null,
      JSON.stringify({ jobType: "Annual Filing", customer: "Schedule Customer", assignee: "staff@test.example", deadlineAt, priority: "High", fee: 350 })
    );
    const reassignProposal = await insertAnyProposal(t, ownerId, "reassign_task", existingJobId, JSON.stringify({ assignee: "staff@test.example" }));

    await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId: createProposal, approved: true });
    await asUser(t, ownerId).mutation(api.chatbot.confirm, { proposalId: reassignProposal, approved: true });

    const result = await t.run(async (ctx) => {
      const scheduledJobs = await ctx.db.query("jobs").withIndex("by_customer", (q) => q.eq("customerId", customerId)).take(10);
      const reassignedJob = await ctx.db.get(existingJobId);
      const notifications = await ctx.db.query("notifications").withIndex("by_user_id", (q) => q.eq("userId", staffId)).take(20);
      const activities = await ctx.db.query("jobActivities").take(30);
      const audits = await ctx.db.query("auditLogs").take(30);
      return { scheduledJobs, reassignedJob, notifications, activities, audits };
    });
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0]).toMatchObject({
      jobType: "Annual Filing",
      assignedEmployeeId: staffId,
      status: "Assigned",
      dueDate: "2026-09-15",
      deadlineAt,
      priority: "High",
      fee: 350
    });
    expect(result.scheduledJobs[0].jobOrderId).toMatch(/^JO-/);
    expect(result.reassignedJob?.assignedEmployeeId).toBe(staffId);
    expect(result.notifications.filter((notice) => notice.type === "assigned")).toHaveLength(2);
    expect(result.activities.map((activity) => activity.title)).toEqual(expect.arrayContaining(["Task scheduled by Center A.I bot", "Task reassigned by Center A.I bot"]));
    expect(result.audits.map((audit) => audit.action)).toEqual(expect.arrayContaining(["chatbot.create_scheduled_task.confirmed", "chatbot.reassign_task.confirmed"]));
  });

  test("Center AI blocks scheduled task and reassignment actions without permissions", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertUser(t, "owner", "owner@test.example");
    const staffId = await insertUser(t, "employee", "staff@test.example");
    await insertCustomer(t, ownerId, "Restricted Customer");
    const [jobId] = await insertTasks(t, ownerId, staffId, staffId);
    const scheduled = await insertAnyProposal(
      t,
      staffId,
      "create_scheduled_task",
      null,
      JSON.stringify({ jobType: "Restricted Task", customer: "Restricted Customer", assignee: "staff@test.example", deadlineAt: Date.now() + 86400000, priority: "Medium", fee: 0 })
    );
    const reassign = await insertAnyProposal(t, staffId, "reassign_task", jobId, JSON.stringify({ assignee: "owner@test.example" }));

    await expect(asUser(t, staffId).mutation(api.chatbot.confirm, { proposalId: scheduled, approved: true })).rejects.toThrow(/Add and assign jobs/);
    await expect(asUser(t, staffId).mutation(api.chatbot.confirm, { proposalId: reassign, approved: true })).rejects.toThrow(/Edit and reassign jobs/);
  });
});

async function insertUser(t: ReturnType<typeof convexTest>, role: "owner" | "employee", email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: email,
      email,
      role,
      title: role,
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now()
    });
  });
}

async function insertTasks(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<"users">,
  staffA: Id<"users">,
  staffB: Id<"users">
) {
  return await t.run(async (ctx) => {
    const make = (assignedEmployeeId: Id<"users">, name: string) =>
      ctx.db.insert("jobs", {
        jobType: name,
        fee: 0,
        amountPaid: 0,
        assignedEmployeeId,
        status: "Assigned",
        dueDate: "2026-07-01",
        priority: "Medium",
        createdBy: ownerId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    return [await make(staffA, "Task A"), await make(staffB, "Task B")];
  });
}

async function insertCustomer(t: ReturnType<typeof convexTest>, ownerId: Id<"users">, businessName: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("customers", {
      businessName,
      phoneNumber: "555-0100",
      email: null,
      businessType: "Business",
      openingBalance: 0,
      balance: 0,
      createdBy: ownerId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  );
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}`, issuer: "test" });
}

async function insertProposal(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  action: "record_payment" | "create_client",
  jobId: Id<"jobs"> | null,
  payload: string
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("chatProposals", {
      userId,
      action,
      jobId,
      payload,
      summary: `Test ${action}`,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      confirmedAt: null
    })
  );
}

async function insertAnyProposal(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  action: "add_note" | "complete_task" | "change_deadline" | "change_status" | "record_payment" | "create_client" | "create_service" | "create_scheduled_task" | "reassign_task",
  jobId: Id<"jobs"> | null,
  payload: string
) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("chatProposals", {
      userId,
      action,
      jobId,
      payload,
      summary: `Test ${action}`,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      confirmedAt: null
    })
  );
}
