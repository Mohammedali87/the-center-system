import { Password } from "@convex-dev/auth/providers/Password";
import {
  convexAuth,
  createAccount,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { accessStatusValidator, roleValidator } from "./validators";
import { getEffectivePermissionKeys, normalizeRole, requireOwner, requirePermission, requireUser } from "./permissions";

const CustomPassword = Password({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    const name = String(params.name ?? email.split("@")[0] ?? "Team member").trim();

    if (!email.includes("@")) {
      throw new ConvexError("Enter a valid email address.");
    }

    return {
      email,
      name,
      role: "employee",
      title: "Employee",
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now()
    };
  },
  validatePasswordRequirements(password: string) {
    validatePassword(password);
  }
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [CustomPassword],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.existingUserId) return;
      const role =
        args.profile.role === "owner" ||
        args.profile.role === "manager" ||
        args.profile.role === "supervisor" ||
        args.profile.role === "employee" ||
        args.profile.role === "viewer"
          ? args.profile.role
          : "employee";
      const ownerRows = (await ctx.db.query("users").take(100)).filter((user) => user.role === "owner");
      const hasOtherOwner = ownerRows.some((user) => user._id !== args.userId);
      if (hasOtherOwner && args.profile.isDemo !== true && args.profile.adminCreated !== true) {
        throw new ConvexError("New accounts must be created by an admin.");
      }
      const finalRole = args.profile.isDemo === true ? role : hasOtherOwner ? "employee" : "owner";

      await ctx.db.patch(args.userId, {
        role: finalRole,
        title: roleTitle(finalRole),
        isActive: true,
        accessStatus: "active",
        accessUpdatedAt: Date.now()
      });
    }
  }
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { ...user, permissions: await getEffectivePermissionKeys(ctx, user) };
  }
});

export const listEmployees = query({
  args: {
    includeInactive: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "team.view");
    const users = await ctx.db.query("users").take(100);
    const visibleUsers = users
      .filter((user) =>
        args.includeInactive === true
          ? true
          : user.isActive !== false && user.accessStatus !== "suspended" && user.accessStatus !== "removed"
      )
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    return await Promise.all(
      visibleUsers.map(async (user) => ({
        ...user,
        permissions: await getEffectivePermissionKeys(ctx, user)
      }))
    );
  }
});

export const requireTeamAddForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePermission(ctx, "team.add");
    return userId;
  }
});

export const authorizeTeamUserCreation = internalQuery({
  args: { role: roleValidator },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "team.add");
    if (args.role !== "employee") {
      await requirePermission(ctx, "team.change_roles");
    }
    return userId;
  }
});

export const getPasswordAccountForCurrentUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);
    if (!user.email) throw new Error("This account does not have an email address.");
    return { userId, email: user.email };
  }
});

export const getPasswordAccountForReset = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireOwner(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user?.email) throw new Error("Team member or email address not found.");
    return { actorId, userId: user._id, email: user.email };
  }
});

export const createTeamUser = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    role: roleValidator,
    title: v.optional(v.string()),
    phone: v.optional(v.string())
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const actorId = await ctx.runQuery(internal.auth.authorizeTeamUserCreation, {
      role: args.role
    });
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    const title = args.title?.trim() || roleTitle(args.role);
    const phone = cleanOptional(args.phone);

    if (!email.includes("@")) {
      throw new Error("Enter a valid email address.");
    }
    if (name.length === 0) {
      throw new Error("Name is required.");
    }
    validatePassword(args.password);

    const existing: Doc<"users"> | null = await ctx.runQuery(internal.auth.findUserByEmail, {
      email
    });
    if (existing) {
      throw new Error("A team member with that email already exists.");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: {
        id: email,
        secret: args.password
      },
      profile: {
        email,
        emailVerificationTime: Date.now(),
        name,
        phone: phone ?? undefined,
        role: "employee",
        title,
        isActive: true,
        accessStatus: "active",
        accessUpdatedAt: Date.now(),
        adminCreated: true
      }
    });

    await ctx.runMutation(internal.auth.patchTeamUser, {
      userId: created.user._id,
      name,
      phone,
      role: args.role,
      title,
      accessStatus: "active"
    });
    await ctx.runMutation(internal.auth.recordUserCreated, {
      actorId,
      userId: created.user._id,
      role: args.role
    });

    return created.user._id;
  }
});

export const recordUserCreated = internalMutation({
  args: { actorId: v.id("users"), userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.actorId,
      action: "team.user_created",
      targetUserId: args.userId,
      entityType: "users",
      entityId: args.userId,
      newValue: args.role,
      createdAt: Date.now()
    });
    return null;
  }
});

export const changeOwnPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    validatePassword(args.password);
    const account = await ctx.runQuery(internal.auth.getPasswordAccountForCurrentUser, {});
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.email, secret: args.password }
    });
    await invalidateSessions(ctx, { userId: account.userId });
    await ctx.runMutation(internal.auth.recordPasswordChange, {
      userId: account.userId,
      actorId: account.userId,
      action: "auth.password_changed"
    });
    return null;
  }
});

export const resetUserPassword = action({
  args: { userId: v.id("users"), temporaryPassword: v.string() },
  handler: async (ctx, args) => {
    validatePassword(args.temporaryPassword);
    const account = await ctx.runQuery(internal.auth.getPasswordAccountForReset, { userId: args.userId });
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: account.email, secret: args.temporaryPassword }
    });
    await invalidateSessions(ctx, { userId: account.userId });
    await ctx.runMutation(internal.auth.recordPasswordChange, {
      userId: account.userId,
      actorId: account.actorId,
      action: "auth.password_reset"
    });
    return null;
  }
});

export const recordPasswordChange = internalMutation({
  args: {
    userId: v.id("users"),
    actorId: v.id("users"),
    action: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      mustChangePassword: args.action === "auth.password_reset",
      passwordChangedAt: args.action === "auth.password_changed" ? now : null,
      accessUpdatedAt: now
    });
    await ctx.db.insert("auditLogs", {
      userId: args.actorId,
      action: args.action,
      targetUserId: args.userId,
      entityType: "users",
      entityId: args.userId,
      newValue: args.action === "auth.password_reset" ? "Temporary password issued" : "Password changed",
      createdAt: now
    });
    return null;
  }
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: roleValidator
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "team.change_roles");
    await assertCanChangeAccess(ctx, args.userId, userId, args.role, "active");
    await ctx.db.patch(args.userId, {
      role: args.role,
      title: roleTitle(args.role),
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now()
    });
    await ctx.db.insert("auditLogs", {
      userId,
      action: "team.role_changed",
      targetUserId: args.userId,
      entityType: "users",
      entityId: args.userId,
      newValue: args.role,
      createdAt: Date.now()
    });
    return null;
  }
});

export const updateTeamUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
    title: v.string(),
    phone: v.optional(v.string()),
    accessStatus: accessStatusValidator
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "team.edit");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Team member not found.");
    if (normalizeRole(target.role) !== args.role) {
      await requirePermission(ctx, "team.change_roles");
    }
    const currentStatus = target.accessStatus ?? (target.isActive === false ? "suspended" : "active");
    if (currentStatus !== args.accessStatus) {
      if (args.accessStatus === "removed") {
        await requirePermission(ctx, "team.delete");
      } else {
        await requirePermission(ctx, "team.suspend");
      }
    }
    await assertCanChangeAccess(ctx, args.userId, userId, args.role, args.accessStatus);
    await ctx.db.patch(args.userId, {
      name: args.name.trim(),
      phone: cleanOptionalString(args.phone),
      role: args.role,
      title: args.title.trim() || roleTitle(args.role),
      isActive: args.accessStatus === "active",
      accessStatus: args.accessStatus,
      accessUpdatedAt: Date.now()
    });
    await ctx.db.insert("auditLogs", {
      userId,
      action: "team.user_updated",
      targetUserId: args.userId,
      permissionKey: null,
      clientId: null,
      bankAccountId: null,
      checkNumber: null,
      checkRangeStart: null,
      checkRangeEnd: null,
      entityType: "users",
      entityId: args.userId,
      oldValue: JSON.stringify({
        role: target.role,
        title: target.title,
        accessStatus: currentStatus
      }),
      newValue: JSON.stringify({
        role: args.role,
        title: args.title.trim() || roleTitle(args.role),
        accessStatus: args.accessStatus
      }),
      reason: null,
      ipDevice: null,
      createdAt: Date.now()
    });
    return null;
  }
});

export const updateTeamAccess = mutation({
  args: {
    userId: v.id("users"),
    accessStatus: accessStatusValidator
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(
      ctx,
      args.accessStatus === "removed" ? "team.delete" : "team.suspend"
    );
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Team member not found.");
    const role = normalizeRole(target.role);

    await assertCanChangeAccess(ctx, args.userId, userId, role, args.accessStatus);
    await ctx.db.patch(args.userId, {
      isActive: args.accessStatus === "active",
      accessStatus: args.accessStatus,
      accessUpdatedAt: Date.now()
    });
    await ctx.db.insert("auditLogs", {
      userId,
      action: `team.access_${args.accessStatus}`,
      targetUserId: args.userId,
      entityType: "users",
      entityId: args.userId,
      newValue: args.accessStatus,
      createdAt: Date.now()
    });
    return null;
  }
});

export const findUserByEmail = internalQuery({
  args: {
    email: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
  }
});

export const patchTeamUser = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
    title: v.string(),
    phone: v.optional(v.union(v.string(), v.null())),
    accessStatus: accessStatusValidator
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      name: args.name,
      phone: cleanOptionalString(args.phone),
      role: args.role,
      title: args.title,
      isActive: args.accessStatus === "active",
      accessStatus: args.accessStatus,
      accessUpdatedAt: Date.now(),
      mustChangePassword: true,
      passwordChangedAt: null
    });
    return null;
  }
});

export const touchLastLogin = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    await ctx.db.patch(userId, {
      lastLoginAt: Date.now()
    });
    return null;
  }
});

function roleTitle(role: "owner" | "manager" | "supervisor" | "employee" | "viewer") {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "viewer") return "Viewer";
  return "Employee";
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function cleanOptionalString(value: string | null | undefined) {
  return cleanOptional(value) ?? undefined;
}

function validatePassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Password must be at least 10 characters and include uppercase, lowercase, and a number.");
  }
}

async function assertCanChangeAccess(
  ctx: MutationCtx,
  targetUserId: Id<"users">,
  actorUserId: Id<"users">,
  nextRole: "owner" | "manager" | "supervisor" | "employee" | "viewer",
  nextStatus: "active" | "suspended" | "removed"
) {
  const target = await ctx.db.get(targetUserId);
  if (!target) {
    throw new Error("Team member not found.");
  }
  if (targetUserId === actorUserId && nextStatus !== "active") {
    throw new Error("You cannot suspend or remove your own account.");
  }

  const activeOwners = (await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "owner"))
    .take(100)).filter((user) => user.isActive !== false && user.accessStatus !== "suspended" && user.accessStatus !== "removed");

  const targetIsActiveOwner =
    target.role === "owner" &&
    target.isActive !== false &&
    target.accessStatus !== "suspended" &&
    target.accessStatus !== "removed";
  const wouldStopBeingActiveOwner = nextRole !== "owner" || nextStatus !== "active";

  if (targetIsActiveOwner && wouldStopBeingActiveOwner && activeOwners.length <= 1) {
    throw new Error("At least one active owner is required.");
  }
}
