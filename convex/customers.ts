import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recalculateCustomerBalance } from "./balances";
import { canManage, requirePermission } from "./permissions";

function isCustomer(customer: Doc<"customers"> | null): customer is Doc<"customers"> {
  return customer !== null;
}

export const list = query({
  args: {
    search: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requirePermission(ctx, "clients.view");
    const search = args.search?.trim().toLowerCase();

    if (!canManage(role)) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", userId))
        .take(200);
      const customerIds = [
        ...new Set(
          jobs
            .map((job) => job.customerId)
            .filter((customerId): customerId is Id<"customers"> => customerId !== undefined)
        )
      ];
      const customers = (await Promise.all(customerIds.map((id) => ctx.db.get(id)))).filter(isCustomer);
      return customers
        .filter((customer) =>
          search
            ? `${customer.businessName} ${customer.phoneNumber} ${customer.email ?? ""} ${customer.businessType}`
                .toLowerCase()
                .includes(search)
            : true
        )
        .sort((a, b) => a.businessName.localeCompare(b.businessName));
    }

    const customers = await ctx.db.query("customers").take(200);
    return customers
      .filter((customer) =>
        search
          ? `${customer.businessName} ${customer.phoneNumber} ${customer.email ?? ""} ${customer.businessType}`
              .toLowerCase()
              .includes(search)
          : true
      )
      .sort((a, b) => a.businessName.localeCompare(b.businessName));
  }
});

export const create = mutation({
  args: {
    businessName: v.string(),
    phoneNumber: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    businessType: v.string(),
    balance: v.number()
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "clients.add");
    const now = Date.now();
    return await ctx.db.insert("customers", {
      businessName: args.businessName.trim(),
      phoneNumber: args.phoneNumber.trim(),
      email: cleanOptional(args.email),
      businessType: args.businessType.trim(),
      openingBalance: args.balance,
      balance: args.balance,
      lastEmailSentAt: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: {
    customerId: v.id("customers"),
    businessName: v.string(),
    phoneNumber: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    businessType: v.string(),
    balance: v.number()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "clients.edit");
    const existing = await ctx.db.get(args.customerId);
    if (!existing) throw new Error("Customer not found.");

    await ctx.db.patch(args.customerId, {
      businessName: args.businessName.trim(),
      phoneNumber: args.phoneNumber.trim(),
      email: cleanOptional(args.email),
      businessType: args.businessType.trim(),
      openingBalance: args.balance,
      updatedAt: Date.now()
    });
    await recalculateCustomerBalance(ctx, args.customerId);
    return null;
  }
});

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export const remove = mutation({
  args: {
    customerId: v.id("customers")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "clients.archive");
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .take(200);

    for (const job of jobs) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(200);
      for (const payment of payments) {
        await ctx.db.delete(payment._id);
      }
      await ctx.db.delete(job._id);
    }

    await ctx.db.delete(args.customerId);
    return null;
  }
});
