import type { PermissionKey, UserDoc } from "./types";

export const permissionGroups: Array<{
  category: string;
  permissions: Array<{ key: PermissionKey; label: string }>;
}> = [
  {
    category: "Client Permissions",
    permissions: [
      { key: "clients.view", label: "View clients" },
      { key: "clients.add", label: "Add clients" },
      { key: "clients.edit", label: "Edit clients" },
      { key: "clients.archive", label: "Archive/delete clients" },
      { key: "clients.view_balance", label: "View client balance" }
    ]
  },
  {
    category: "Job Permissions",
    permissions: [
      { key: "jobs.view", label: "View jobs" },
      { key: "jobs.add", label: "Add jobs" },
      { key: "jobs.edit", label: "Edit jobs" },
      { key: "jobs.assign", label: "Assign jobs" },
      { key: "jobs.reassign", label: "Reassign jobs" },
      { key: "jobs.complete", label: "Mark jobs completed" },
      { key: "jobs.delete", label: "Delete/cancel jobs" }
    ]
  },
  {
    category: "Payment Permissions",
    permissions: [
      { key: "payments.view", label: "View payments" },
      { key: "payments.add", label: "Add payments" },
      { key: "payments.edit", label: "Edit payments" },
      { key: "payments.delete", label: "Delete payments" },
      { key: "payments.view_balances", label: "View balances" },
      { key: "payments.send_invoices", label: "Send invoices" }
    ]
  },
  {
    category: "Email Permissions",
    permissions: [
      { key: "emails.send_client", label: "Send client emails" },
      { key: "emails.send_invoice", label: "Send invoice emails" },
      { key: "emails.request_documents", label: "Send missing document requests" },
      { key: "emails.edit_templates", label: "Edit email templates" }
    ]
  },
  {
    category: "Report Permissions",
    permissions: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.employee_performance", label: "View employee performance" },
      { key: "reports.export", label: "Export reports" },
      { key: "reports.company_revenue", label: "View company revenue" }
    ]
  },
  {
    category: "Team Permissions",
    permissions: [
      { key: "team.view", label: "View team members" },
      { key: "team.add", label: "Add users" },
      { key: "team.edit", label: "Edit users" },
      { key: "team.suspend", label: "Suspend users" },
      { key: "team.delete", label: "Delete users" },
      { key: "team.change_roles", label: "Change roles" },
      { key: "team.change_permissions", label: "Change permissions" }
    ]
  },
  {
    category: "Admin Settings",
    permissions: [
      { key: "settings.manage_services", label: "Manage services" },
      { key: "settings.manage_tags", label: "Manage tags" },
      { key: "settings.manage_notifications", label: "Manage notification rules" },
      { key: "settings.manage_company", label: "Manage company settings" }
    ]
  }
];

export const permissionPresets = [
  { key: "full_admin", label: "Full Admin Access" },
  { key: "manager", label: "Manager Access" },
  { key: "supervisor", label: "Supervisor Access" },
  { key: "employee", label: "Employee Basic Access" },
  { key: "read_only", label: "Read Only Access" }
];

export function userCan(user: UserDoc | null | undefined, permissionKey: PermissionKey) {
  if (!user) return false;
  if (user.role === "owner") return true;
  return user.permissions?.includes(permissionKey) ?? false;
}

export function userCanAny(user: UserDoc | null | undefined, permissionKeys: PermissionKey[]) {
  return permissionKeys.some((permissionKey) => userCan(user, permissionKey));
}
