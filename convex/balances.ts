import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function recalculateCustomerBalance(ctx: MutationCtx, customerId: Id<"customers">) {
  const customer = await ctx.db.get(customerId);
  if (!customer) return;

  let jobBalance = 0;
  for await (const job of ctx.db
    .query("jobs")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))) {
    jobBalance += Math.max(0, Number(job.fee) - Number(job.amountPaid));
  }

  await ctx.db.patch(customerId, {
    balance: roundMoney(Number(customer.openingBalance ?? 0) + jobBalance),
    updatedAt: Date.now()
  });
}

export async function recalculateClientBalance(ctx: MutationCtx, clientId: Id<"clients">) {
  const client = await ctx.db.get(clientId);
  if (!client) return;

  let jobBalance = 0;
  for await (const job of ctx.db
    .query("jobs")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))) {
    jobBalance += Math.max(0, Number(job.fee) - Number(job.amountPaid));
  }

  await ctx.db.patch(clientId, {
    balanceDue: roundMoney(jobBalance),
    updatedAt: Date.now()
  });
}

export function assertMoney(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a positive amount.`);
  }
}
