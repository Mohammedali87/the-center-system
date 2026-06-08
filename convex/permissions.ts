import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Role = "owner" | "manager" | "supervisor" | "employee" | "viewer";
type AuthCtx = QueryCtx | MutationCtx;

export const permissionDefinitions = [
  { key: "clients.view", label: "View clients", category: "Clients" },
  { key: "clients.add", label: "Add clients", category: "Clients" },
  { key: "clients.edit", label: "Edit clients", category: "Clients" },
  { key: "clients.archive", label: "Archive/delete clients", category: "Clients" },
  { key: "clients.view_balance", label: "View client balance", category: "Clients" },
  { key: "jobs.view", label: "View jobs", category: "Jobs" },
  { key: "jobs.add", label: "Add jobs", category: "Jobs" },
  { key: "jobs.edit", label: "Edit jobs", category: "Jobs" },
  { key: "jobs.assign", label: "Assign jobs", category: "Jobs" },
  { key: "jobs.reassign", label: "Reassign jobs", category: "Jobs" },
  { key: "jobs.complete", label: "Mark jobs completed", category: "Jobs" },
  { key: "jobs.delete", label: "Delete/cancel jobs", category: "Jobs" },
  { key: "payments.view", label: "View payments", category: "Payments" },
  { key: "payments.add", label: "Add payments", category: "Payments" },
  { key: "payments.edit", label: "Edit payments", category: "Payments" },
  { key: "payments.delete", label: "Delete payments", category: "Payments" },
  { key: "payments.view_balances", label: "View balances", category: "Payments" },
  { key: "payments.send_invoices", label: "Send invoices", category: "Payments" },
  { key: "emails.send_client", label: "Send client emails", category: "Email" },
  { key: "emails.send_invoice", label: "Send invoice emails", category: "Email" },
  { key: "emails.request_documents", label: "Send missing document requests", category: "Email" },
  { key: "emails.edit_templates", label: "Edit email templates", category: "Email" },
  { key: "reports.view", label: "View reports", category: "Reports" },
  { key: "reports.employee_performance", label: "View employee performance", category: "Reports" },
  { key: "reports.export", label: "Export reports", category: "Reports" },
  { key: "reports.company_revenue", label: "View company revenue", category: "Reports" },
  { key: "team.view", label: "View team members", category: "Team" },
  { key: "team.add", label: "Add users", category: "Team" },
  { key: "team.edit", label: "Edit users", category: "Team" },
  { key: "team.suspend", label: "Suspend users", category: "Team" },
  { key: "team.delete", label: "Delete users", category: "Team" },
  { key: "team.change_roles", label: "Change roles", category: "Team" },
  { key: "team.change_permissions", label: "Change permissions", category: "Team" },
  { key: "settings.manage_services", label: "Manage services", category: "Admin Settings" },
  { key: "settings.manage_tags", label: "Manage tags", category: "Admin Settings" },
  { key: "settings.manage_notifications", label: "Manage notification rules", category: "Admin Settings" },
  { key: "settings.manage_company", label: "Manage company settings", category: "Admin Settings" }
] as const;

export type PermissionKey = (typeof permissionDefinitions)[number]["key"];

export const permissionPresets = [
  { key: "full_admin", label: "Full Admin Access", permissions: permissionDefinitions.map((item) => item.key) },
  {
    key: "manager",
    label: "Manager Access",
    permissions: [
      "clients.view",
      "clients.add",
      "clients.edit",
      "clients.archive",
      "clients.view_balance",
      "jobs.view",
      "jobs.add",
      "jobs.edit",
      "jobs.assign",
      "jobs.reassign",
      "jobs.complete",
      "jobs.delete",
      "payments.view",
      "payments.add",
      "payments.edit",
      "payments.delete",
      "payments.view_balances",
      "payments.send_invoices",
      "emails.send_client",
      "emails.send_invoice",
      "emails.request_documents",
      "emails.edit_templates",
      "reports.view",
      "reports.employee_performance",
      "reports.export",
      "reports.company_revenue",
      "team.view",
      "team.edit",
      "team.suspend",
      "settings.manage_services",
      "settings.manage_tags",
      "settings.manage_notifications"
    ]
  },
  {
    key: "supervisor",
    label: "Supervisor Access",
    permissions: [
      "clients.view",
      "clients.view_balance",
      "jobs.view",
      "payments.view",
      "payments.view_balances",
      "reports.view",
      "reports.employee_performance",
      "team.view"
    ]
  },
  {
    key: "employee",
    label: "Employee Basic Access",
    permissions: ["clients.view", "jobs.view", "jobs.complete", "emails.request_documents"]
  },
  {
    key: "read_only",
    label: "Read Only Access",
    permissions: ["clients.view", "jobs.view", "payments.view", "reports.view", "team.view"]
  }
] as const;

type PresetKey = (typeof permissionPresets)[number]["key"];
const allPermissionKeys = permissionDefinitions.map((item) => item.key);
const validPermissionKeys = new Set<string>(allPermissionKeys);
const permissionLabels = new Map(permissionDefinitions.map((item) => [item.key, item.label]));

export function normalizeRole(role: unknown): Role {
  return role === "owner" ||
    role === "manager" ||
    role === "supervisor" ||
    role === "employee" ||
    role === "viewer"
    ? role
    : "employee";
}

export async function requireUser(ctx: AuthCtx): Promise<{
  userId: Doc<"users">["_id"];
  user: Doc<"users">;
  role: Role;
}> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User profile not found.");
  }
  if (user.isActive === false || user.accessStatus === "suspended" || user.accessStatus === "removed") {
    throw new Error("This account does not currently have access.");
  }
  return { userId, user, role: normalizeRole(user.role) };
}

export async function requireManager(ctx: AuthCtx) {
  const session = await requireUser(ctx);
  if (session.role === "owner") return session;
  if (session.role !== "manager" && session.role !== "supervisor") {
    throw new Error("Manager access required.");
  }
  const permissions = await getEffectivePermissionKeys(ctx, session.user);
  if (!permissions.some((permission) => permission.startsWith("clients.") || permission.startsWith("jobs."))) {
    throw new Error("Manager access required.");
  }
  return session;
}

export async function requireOwner(ctx: AuthCtx) {
  const session = await requireUser(ctx);
  if (session.role !== "owner") {
    throw new Error("Owner access required.");
  }
  return session;
}

export async function requirePermission(ctx: AuthCtx, permissionKey: PermissionKey) {
  const session = await requireUser(ctx);
  const permissions = await getEffectivePermissionKeys(ctx, session.user);
  if (!permissions.includes(permissionKey)) {
    throw new Error(`Permission required: ${permissionLabels.get(permissionKey) ?? permissionKey}.`);
  }
  return { ...session, permissions };
}

export async function hasPermission(ctx: AuthCtx, user: Doc<"users">, permissionKey: PermissionKey) {
  return (await getEffectivePermissionKeys(ctx, user)).includes(permissionKey);
}

export async function hasAnyPermission(ctx: AuthCtx, user: Doc<"users">, permissionKeys: PermissionKey[]) {
  const permissions = await getEffectivePermissionKeys(ctx, user);
  return permissionKeys.some((permissionKey) => permissions.includes(permissionKey));
}

export async function getEffectivePermissionKeys(ctx: AuthCtx, user: Doc<"users">) {
  const role = normalizeRole(user.role);
  const defaults = roleDefaultPermissions(role);
  if (role === "owner") return allPermissionKeys;

  const effective = new Set<string>(defaults);
  const overrides = await ctx.db
    .query("userPermissions")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .take(200);
  for (const override of overrides) {
    if (!validPermissionKeys.has(override.permissionKey)) continue;
    if (override.granted) {
      effective.add(override.permissionKey);
    } else {
      effective.delete(override.permissionKey);
    }
  }
  return allPermissionKeys.filter((permissionKey) => effective.has(permissionKey));
}

export function roleDefaultPermissions(role: Role) {
  if (role === "owner") return allPermissionKeys;
  if (role === "manager") return presetPermissions("manager");
  if (role === "supervisor") return presetPermissions("supervisor");
  if (role === "viewer") return presetPermissions("read_only");
  return presetPermissions("employee");
}

export function canManage(role: Role) {
  return role === "owner" || role === "manager" || role === "supervisor";
}

export async function requireCheckAdmin(ctx: AuthCtx) {
  const session = await requireUser(ctx);
  if (session.role !== "owner") {
    throw new Error("Owner access required.");
  }
  return session;
}

export async function requireCheckManager(ctx: AuthCtx) {
  const session = await requireUser(ctx);
  if (session.role !== "owner" && session.role !== "manager" && session.role !== "supervisor") {
    throw new Error("Manager access required.");
  }
  return session;
}

export async function requireCheckStaff(ctx: AuthCtx) {
  const session = await requireUser(ctx);
  if (session.role === "viewer") {
    throw new Error("Staff access required.");
  }
  return session;
}

export function canFinalizeChecks(role: Role) {
  return role === "owner" || role === "manager" || role === "supervisor";
}

export function canAdministerChecks(role: Role) {
  return role === "owner";
}

export const getCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "team.change_permissions");
    return {
      permissions: permissionDefinitions,
      presets: permissionPresets,
      roleDefaults: {
        owner: roleDefaultPermissions("owner"),
        manager: roleDefaultPermissions("manager"),
        supervisor: roleDefaultPermissions("supervisor"),
        employee: roleDefaultPermissions("employee"),
        viewer: roleDefaultPermissions("viewer")
      }
    };
  }
});

export const getForUser = query({
  args: {
    userId: v.id("users")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "team.change_permissions");
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const overrides = await ctx.db
      .query("userPermissions")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .take(200);
    return {
      userId: args.userId,
      role: normalizeRole(user.role),
      defaultPermissions: roleDefaultPermissions(normalizeRole(user.role)),
      permissions: await getEffectivePermissionKeys(ctx, user),
      overrides
    };
  }
});

export const updateUserPermissions = mutation({
  args: {
    userId: v.id("users"),
    permissions: v.array(v.string()),
    reason: v.optional(v.string()),
    confirmedOwnerChange: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const { userId: actorId } = await requirePermission(ctx, "team.change_permissions");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Team member not found.");
    protectOwnerPermissions(target, actorId, args.confirmedOwnerChange === true);
    const nextPermissions = validatePermissionSelection(args.permissions);
    await setUserPermissions(ctx, {
      actorId,
      target,
      nextPermissions,
      reason: cleanReason(args.reason),
      action: "permission.update"
    });
    return { permissions: nextPermissions };
  }
});

export const applyPreset = mutation({
  args: {
    userId: v.id("users"),
    presetKey: v.string(),
    reason: v.optional(v.string()),
    confirmedOwnerChange: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const { userId: actorId } = await requirePermission(ctx, "team.change_permissions");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Team member not found.");
    protectOwnerPermissions(target, actorId, args.confirmedOwnerChange === true);
    const nextPermissions = presetPermissions(args.presetKey as PresetKey);
    await setUserPermissions(ctx, {
      actorId,
      target,
      nextPermissions,
      reason: cleanReason(args.reason),
      action: `permission.apply_preset.${args.presetKey}`
    });
    return { permissions: nextPermissions };
  }
});

export const listAuditLogs = query({
  args: {
    targetUserId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "team.change_permissions");
    const rows =
      args.targetUserId !== undefined
        ? await ctx.db
            .query("auditLogs")
            .withIndex("by_target_user_id", (q) => q.eq("targetUserId", args.targetUserId))
            .take(200)
        : await ctx.db.query("auditLogs").withIndex("by_created_at").order("desc").take(200);
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      sorted.map(async (row) => ({
        ...row,
        actor: row.userId ? await ctx.db.get(row.userId) : null,
        targetUser: row.targetUserId ? await ctx.db.get(row.targetUserId) : null
      }))
    );
  }
});

export const seedPermissionCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePermission(ctx, "team.change_permissions");
    const now = Date.now();
    for (const definition of permissionDefinitions) {
      const existing = await ctx.db
        .query("permissions")
        .withIndex("by_key", (q) => q.eq("key", definition.key))
        .first();
      const row = {
        key: definition.key,
        label: definition.label,
        category: definition.category,
        description: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("permissions", row);
      }
    }

    const roles: Array<{ key: Role; label: string; description: string }> = [
      { key: "owner", label: "Admin / Owner", description: "Full system access." },
      { key: "manager", label: "Manager", description: "Office management access." },
      { key: "supervisor", label: "Star / Supervisor", description: "Read-only team progress access." },
      { key: "employee", label: "Staff / Employee", description: "Assigned work access." },
      { key: "viewer", label: "Read Only", description: "View-only access." }
    ];
    for (const role of roles) {
      const existing = await ctx.db.query("roles").withIndex("by_key", (q) => q.eq("key", role.key)).first();
      const row = {
        key: role.key,
        label: role.label,
        description: role.description,
        permissions: roleDefaultPermissions(role.key),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("roles", row);
      }
    }

    await ctx.db.insert("auditLogs", {
      userId,
      action: "permission.catalog_synced",
      targetUserId: null,
      permissionKey: null,
      clientId: null,
      bankAccountId: null,
      checkNumber: null,
      checkRangeStart: null,
      checkRangeEnd: null,
      entityType: "permissions",
      entityId: null,
      oldValue: null,
      newValue: "Permission catalog synchronized",
      reason: null,
      ipDevice: null,
      createdAt: now
    });
    return null;
  }
});

export const requirePermissionForAction = internalQuery({
  args: {
    permissionKey: v.string()
  },
  handler: async (ctx, args) => {
    if (!isPermissionKey(args.permissionKey)) throw new Error("Unknown permission.");
    const { userId } = await requirePermission(ctx, args.permissionKey);
    return userId;
  }
});

function presetPermissions(presetKey: PresetKey | string) {
  const preset = permissionPresets.find((item) => item.key === presetKey);
  if (!preset) throw new Error("Permission preset not found.");
  const presetKeys = new Set<string>(preset.permissions);
  return allPermissionKeys.filter((permissionKey) => presetKeys.has(permissionKey));
}

function validatePermissionSelection(permissions: string[]) {
  const unique = Array.from(new Set(permissions));
  for (const permission of unique) {
    if (!validPermissionKeys.has(permission)) {
      throw new Error(`Unknown permission: ${permission}.`);
    }
  }
  return allPermissionKeys.filter((permissionKey) => unique.includes(permissionKey));
}

async function setUserPermissions(
  ctx: MutationCtx,
  args: {
    actorId: Id<"users">;
    target: Doc<"users">;
    nextPermissions: PermissionKey[];
    reason?: string | null;
    action: string;
  }
) {
  const role = normalizeRole(args.target.role);
  const defaults = new Set(roleDefaultPermissions(role));
  const previous = new Set(await getEffectivePermissionKeys(ctx, args.target));
  const next = new Set(args.nextPermissions);
  const existingRows = await ctx.db
    .query("userPermissions")
    .withIndex("by_user_id", (q) => q.eq("userId", args.target._id))
    .take(200);
  const existingByKey = new Map(existingRows.map((row) => [row.permissionKey, row]));
  const now = Date.now();

  for (const permissionKey of allPermissionKeys) {
    const shouldHave = next.has(permissionKey);
    const defaultHas = defaults.has(permissionKey);
    const existing = existingByKey.get(permissionKey);
    if (shouldHave === defaultHas) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, {
        granted: shouldHave,
        updatedBy: args.actorId,
        updatedAt: now,
        reason: args.reason ?? null
      });
    } else {
      await ctx.db.insert("userPermissions", {
        userId: args.target._id,
        permissionKey,
        granted: shouldHave,
        updatedBy: args.actorId,
        updatedAt: now,
        reason: args.reason ?? null
      });
    }

    const oldHas = previous.has(permissionKey);
    if (oldHas !== shouldHave) {
      await ctx.db.insert("auditLogs", {
        userId: args.actorId,
        action: args.action,
        targetUserId: args.target._id,
        permissionKey,
        clientId: null,
        bankAccountId: null,
        checkNumber: null,
        checkRangeStart: null,
        checkRangeEnd: null,
        entityType: "userPermissions",
        entityId: args.target._id,
        oldValue: oldHas ? "granted" : "removed",
        newValue: shouldHave ? "granted" : "removed",
        reason: args.reason ?? null,
        ipDevice: null,
        createdAt: now
      });
    }
  }

  await ctx.db.patch(args.target._id, {
    permissions: args.nextPermissions,
    accessUpdatedAt: now
  });
}

function protectOwnerPermissions(target: Doc<"users">, actorId: Id<"users">, confirmedOwnerChange: boolean) {
  if (target.role !== "owner") return;
  if (target._id === actorId) {
    throw new Error("Admin owner permissions are always full and cannot be removed from your own account.");
  }
  if (!confirmedOwnerChange) {
    throw new Error("Confirm that you want to change another owner account's permissions.");
  }
}

function cleanReason(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function isPermissionKey(value: string): value is PermissionKey {
  return validPermissionKeys.has(value);
}
