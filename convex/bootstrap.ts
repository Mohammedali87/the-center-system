"use node";

import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

export const createPrimaryOwner = action({
  args: {
    bootstrapSecret: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string()
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!configuredSecret || args.bootstrapSecret !== configuredSecret) {
      throw new Error("Primary owner bootstrap is disabled.");
    }

    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    validateEmailAndPassword(email, args.password);
    if (!name) throw new Error("Name is required.");

    const existing: Doc<"users"> | null = await ctx.runQuery(internal.bootstrapInternal.findUserByEmail, { email });
    if (existing) {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: args.password }
      });
      await ctx.runMutation(internal.bootstrapInternal.activatePrimaryOwner, { userId: existing._id, name });
      return existing._id;
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        emailVerificationTime: Date.now(),
        name,
        role: "owner",
        title: "Owner",
        isActive: true,
        accessStatus: "active",
        accessUpdatedAt: Date.now(),
        adminCreated: true
      }
    });
    await ctx.runMutation(internal.bootstrapInternal.activatePrimaryOwner, { userId: created.user._id, name });
    return created.user._id;
  }
});

function validateEmailAndPassword(email: string, password: string) {
  if (!email.includes("@")) throw new Error("Enter a valid email address.");
  if (password.length < 14 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must be at least 14 characters and include uppercase, lowercase, a number, and a symbol.");
  }
}
