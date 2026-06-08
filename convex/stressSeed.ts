import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";

const people = [
  ["supervisor1@centerbusiness.test", "Samira Lead", "supervisor"],
  ["supervisor2@centerbusiness.test", "Noah Lead", "supervisor"],
  ["staff1@centerbusiness.test", "Ari Staff", "employee"],
  ["staff2@centerbusiness.test", "Bea Staff", "employee"],
  ["staff3@centerbusiness.test", "Chris Staff", "employee"],
  ["staff4@centerbusiness.test", "Drew Staff", "employee"],
  ["staff5@centerbusiness.test", "Emi Staff", "employee"],
  ["staff6@centerbusiness.test", "Fran Staff", "employee"],
  ["staff7@centerbusiness.test", "Gray Staff", "employee"]
] as const;

export const install = action({
  args: {},
  handler: async (ctx): Promise<{ seeded: boolean; users: number; tasks: number; notes: number }> => {
    const ownerId = await ctx.runQuery(internal.auth.requireTeamAddForAction, {});
    const userIds: Id<"users">[] = [];
    for (const [email, name, role] of people) {
      const existing = await ctx.runQuery(internal.auth.findUserByEmail, { email });
      if (existing) {
        userIds.push(existing._id);
        continue;
      }
      const created = await createAccount(ctx, {
        provider: "password",
        account: { id: email, secret: "Temporary123!" },
        profile: {
          email,
          emailVerificationTime: Date.now(),
          name,
          role: "employee",
          title: role === "supervisor" ? "Supervisor" : "Staff",
          isActive: true,
          accessStatus: "active",
          accessUpdatedAt: Date.now(),
          adminCreated: true
        }
      });
      await ctx.runMutation(internal.auth.patchTeamUser, {
        userId: created.user._id,
        name,
        role,
        title: role === "supervisor" ? "Supervisor" : "Staff",
        phone: null,
        accessStatus: "active"
      });
      userIds.push(created.user._id);
    }
    return await ctx.runMutation(internal.stressSeed.seedData, { ownerId, userIds });
  }
});

export const seedData = internalMutation({
  args: { ownerId: v.id("users"), userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const marker = await ctx.db.query("customers").withIndex("by_business_name", (q) => q.eq("businessName", "Stress Test Account")).first();
    if (marker) return { seeded: false, users: args.userIds.length + 1, tasks: 0, notes: 0 };
    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      businessName: "Stress Test Account",
      phoneNumber: "(615) 555-0100",
      email: "stress@example.test",
      businessType: "Internal test",
      openingBalance: 0,
      balance: 0,
      createdBy: args.ownerId,
      createdAt: now,
      updatedAt: now
    });
    let notes = 0;
    for (let index = 0; index < 100; index += 1) {
      const assignee = args.userIds[index % args.userIds.length];
      const offsetHours = index < 10 ? -48 - index : index < 20 ? 2 : index < 35 ? 20 : 48 + index;
      const deadlineAt = now + offsetHours * 60 * 60 * 1000;
      const status = index < 20 ? "Overdue" : index % 4 === 0 ? "Completed" : index % 3 === 0 ? "In Progress" : "Assigned";
      const jobId = await ctx.db.insert("jobs", {
        customerId,
        jobType: `Stress test task ${index + 1}`,
        fee: 100 + index,
        amountPaid: index % 4 === 0 ? 100 + index : 0,
        assignedEmployeeId: assignee,
        status,
        dueDate: new Date(deadlineAt).toISOString().slice(0, 10),
        deadlineAt,
        reminder24hSentAt: null,
        reminder3hSentAt: null,
        priority: index % 5 === 0 ? "High" : index % 2 === 0 ? "Medium" : "Low",
        notes: "Generated for small-team stress testing.",
        createdBy: args.ownerId,
        createdAt: now - index * 60000,
        assignedAt: now - index * 60000,
        completedAt: status === "Completed" ? now : null,
        updatedAt: now
      });
      await ctx.db.patch(jobId, { jobOrderId: `JO-${jobId.slice(-6).toUpperCase()}` });
      for (let noteIndex = 0; noteIndex < 3; noteIndex += 1) {
        await ctx.db.insert("jobNotes", {
          jobId,
          audience: "employee",
          body: `Stress note ${noteIndex + 1} for task ${index + 1}.`,
          createdBy: assignee,
          createdAt: now + noteIndex
        });
        notes += 1;
      }
    }
    return { seeded: true, users: args.userIds.length + 1, tasks: 100, notes };
  }
});
