import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requirePermission, requireUser } from "./permissions";

const defaultServices = [
  "EIN Application",
  "Business License",
  "Sales Tax Registration",
  "Franchise & Excise Tax",
  "Payroll Setup",
  "Bookkeeping",
  "Tax Return Filing",
  "EBT / SNAP Application",
  "Food Permit",
  "Tobacco License",
  "Annual Report Filing",
  "Certificate of Occupancy"
] as const;

export const list = query({
  args: {
    includeInactive: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const services = args.includeInactive === true
      ? await ctx.db.query("services").take(200)
      : await ctx.db
          .query("services")
          .withIndex("by_is_active", (q) => q.eq("isActive", true))
          .take(200);

    return services.sort((a, b) => a.name.localeCompare(b.name));
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    defaultFee: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "settings.manage_services");
    await ensureDefaultServices(ctx, userId);
    const name = cleanServiceName(args.name);
    const normalizedName = normalizeServiceName(name);
    const defaultFee = sanitizeDefaultFee(args.defaultFee);

    const existing = await ctx.db
      .query("services")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        defaultFee,
        isActive: true,
        updatedAt: Date.now()
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("services", {
      name,
      normalizedName,
      defaultFee,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.string(),
    defaultFee: v.optional(v.number()),
    isActive: v.boolean()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_services");
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found.");

    const name = cleanServiceName(args.name);
    const normalizedName = normalizeServiceName(name);
    const duplicate = await ctx.db
      .query("services")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();
    if (duplicate && duplicate._id !== args.serviceId) {
      throw new Error("Another service already uses that name.");
    }

    await ctx.db.patch(args.serviceId, {
      name,
      normalizedName,
      defaultFee: sanitizeDefaultFee(args.defaultFee),
      isActive: args.isActive,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const updateStatus = mutation({
  args: {
    serviceId: v.id("services"),
    isActive: v.boolean()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_services");
    await ctx.db.patch(args.serviceId, {
      isActive: args.isActive,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const remove = mutation({
  args: {
    serviceId: v.id("services")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_services");
    await ctx.db.delete(args.serviceId);
    return null;
  }
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePermission(ctx, "settings.manage_services");
    await ensureDefaultServices(ctx, userId);
    return null;
  }
});

export const seedDefaultsInternal = internalMutation({
  args: {
    createdBy: v.id("users")
  },
  handler: async (ctx, args) => {
    await ensureDefaultServices(ctx, args.createdBy);
    return null;
  }
});

async function ensureDefaultServices(ctx: MutationCtx, createdBy: Id<"users">) {
  const now = Date.now();
  for (const name of defaultServices) {
    const normalizedName = normalizeServiceName(name);
    const existing = await ctx.db
      .query("services")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();
    if (existing) {
      continue;
    }
    await ctx.db.insert("services", {
      name,
      normalizedName,
      isActive: true,
      createdBy,
      createdAt: now,
      updatedAt: now
    });
  }
}

function cleanServiceName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new Error("Service name is required.");
  }
  return name;
}

function normalizeServiceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sanitizeDefaultFee(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Default fee must be a positive amount.");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
