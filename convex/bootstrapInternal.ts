import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) =>
    await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.email)).unique()
});

export const activatePrimaryOwner = internalMutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      name: args.name,
      role: "owner",
      title: "Owner",
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now(),
      adminCreated: true,
      isDemo: false,
      mustChangePassword: false,
      passwordChangedAt: Date.now()
    });
    return null;
  }
});
