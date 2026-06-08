import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertMoney,
  recalculateClientBalance,
  recalculateCustomerBalance,
  roundMoney
} from "./balances";
import { canManage, requirePermission } from "./permissions";

type PaymentWithRelations = Omit<Doc<"payments">, "receivedBy"> & {
  job: Doc<"jobs"> | null;
  customer: Doc<"customers"> | null;
  client: Doc<"clients"> | null;
  receivedBy: Doc<"users"> | null;
};

type JobStatus = Doc<"jobs">["status"];

function isCompletedStatus(status: JobStatus) {
  return status === "Completed" || status === "Completed With Balance";
}

function statusAfterPayment(job: Doc<"jobs">, nextPaid: number): JobStatus {
  if (nextPaid >= job.fee) return "Completed";
  if (isCompletedStatus(job.status)) return "Completed With Balance";
  return job.status;
}

async function enrichPayment(
  ctx: QueryCtx | MutationCtx,
  payment: Doc<"payments">
): Promise<PaymentWithRelations> {
  const [job, customer, client, receivedBy] = await Promise.all([
    ctx.db.get(payment.jobId),
    payment.customerId ? ctx.db.get(payment.customerId) : Promise.resolve(null),
    payment.clientId ? ctx.db.get(payment.clientId) : Promise.resolve(null),
    ctx.db.get(payment.receivedBy)
  ]);

  return {
    ...payment,
    job,
    customer,
    client,
    receivedBy
  };
}

export const list = query({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients"))
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requirePermission(ctx, "payments.view");
    let payments: Doc<"payments">[];

    if (args.jobId !== undefined) {
      const jobId = args.jobId;
      payments = await ctx.db
        .query("payments")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .take(200);
    } else if (args.customerId !== undefined) {
      const customerId = args.customerId;
      payments = await ctx.db
        .query("payments")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .take(200);
    } else if (args.clientId !== undefined) {
      const clientId = args.clientId;
      payments = await ctx.db
        .query("payments")
        .withIndex("by_client", (q) => q.eq("clientId", clientId))
        .take(200);
    } else {
      payments = await ctx.db.query("payments").take(200);
    }

    if (!canManage(role)) {
      const visible: Doc<"payments">[] = [];
      for (const payment of payments) {
        const job = await ctx.db.get(payment.jobId);
        if (job?.assignedEmployeeId === userId) visible.push(payment);
      }
      payments = visible;
    }

    const enriched = await Promise.all(payments.map((payment) => enrichPayment(ctx, payment)));
    return enriched.sort((a, b) => b.paidAt - a.paidAt);
  }
});

export const record = mutation({
  args: {
    jobId: v.id("jobs"),
    amount: v.number(),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "payments.add");
    assertMoney(args.amount, "Payment");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");

    const nextPaid = roundMoney(job.amountPaid + args.amount);
    if (nextPaid > job.fee) {
      throw new Error("Payment exceeds the remaining job balance.");
    }

    await ctx.db.insert("payments", {
      jobId: args.jobId,
      customerId: job.customerId,
      clientId: job.clientId,
      amount: roundMoney(args.amount),
      note: args.note?.trim() ?? "",
      receivedBy: userId,
      paidAt: Date.now()
    });
    await ctx.db.insert("jobActivities", {
      jobId: args.jobId,
      kind: "payment",
      title: "Payment received",
      detail: `${roundMoney(args.amount)} received`,
      createdBy: userId,
      createdAt: Date.now()
    });

    const now = Date.now();
    const nextStatus = statusAfterPayment(job, nextPaid);
    await ctx.db.patch(args.jobId, {
      amountPaid: nextPaid,
      status: nextStatus,
      completedAt: isCompletedStatus(nextStatus) ? job.completedAt ?? now : null,
      updatedAt: now
    });
    if (job.customerId) {
      await recalculateCustomerBalance(ctx, job.customerId);
    }
    if (job.clientId) {
      await recalculateClientBalance(ctx, job.clientId);
    }
    return null;
  }
});

export const update = mutation({
  args: {
    paymentId: v.id("payments"),
    amount: v.number(),
    note: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "payments.edit");
    assertMoney(args.amount, "Payment");

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found.");

    const job = await ctx.db.get(payment.jobId);
    if (!job) throw new Error("Job not found.");

    const nextPaid = roundMoney(job.amountPaid - payment.amount + args.amount);
    if (nextPaid < 0 || nextPaid > job.fee) {
      throw new Error("Updated payment would put the job outside its allowed balance.");
    }

    await ctx.db.patch(args.paymentId, {
      amount: roundMoney(args.amount),
      note: args.note?.trim() ?? ""
    });
    await ctx.db.insert("jobActivities", {
      jobId: payment.jobId,
      kind: "payment",
      title: "Payment updated",
      detail: `${roundMoney(args.amount)} recorded`,
      createdBy: userId,
      createdAt: Date.now()
    });
    const nextStatus = statusAfterPayment(job, nextPaid);
    await ctx.db.patch(payment.jobId, {
      amountPaid: nextPaid,
      status: nextStatus,
      completedAt: isCompletedStatus(nextStatus) ? job.completedAt ?? Date.now() : null,
      updatedAt: Date.now()
    });
    if (job.customerId) {
      await recalculateCustomerBalance(ctx, job.customerId);
    }
    if (job.clientId) {
      await recalculateClientBalance(ctx, job.clientId);
    }
    return null;
  }
});

export const remove = mutation({
  args: {
    paymentId: v.id("payments")
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "payments.delete");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;

    const job = await ctx.db.get(payment.jobId);
    await ctx.db.delete(args.paymentId);

    if (job) {
      await ctx.db.insert("jobActivities", {
        jobId: payment.jobId,
        kind: "payment",
        title: "Payment removed",
        detail: `${roundMoney(payment.amount)} removed`,
        createdBy: userId,
        createdAt: Date.now()
      });
      const nextPaid = roundMoney(Math.max(0, job.amountPaid - payment.amount));
      const nextStatus = statusAfterPayment(job, nextPaid);
      await ctx.db.patch(payment.jobId, {
        amountPaid: nextPaid,
        status: nextStatus,
        completedAt: isCompletedStatus(nextStatus) ? job.completedAt ?? Date.now() : null,
        updatedAt: Date.now()
      });
      if (job.customerId) {
        await recalculateCustomerBalance(ctx, job.customerId);
      }
      if (job.clientId) {
        await recalculateClientBalance(ctx, job.clientId);
      }
    }

    return null;
  }
});
