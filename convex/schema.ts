import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("supervisor"),
  v.literal("employee"),
  v.literal("viewer")
);
const accessStatus = v.union(v.literal("active"), v.literal("suspended"), v.literal("removed"));
const clientType = v.union(v.literal("Business"), v.literal("Individual"));
const jobStatus = v.union(
  v.literal("New"),
  v.literal("Assigned"),
  v.literal("In Progress"),
  v.literal("Waiting on Client"),
  v.literal("Waiting on Government"),
  v.literal("Completed"),
  v.literal("Completed With Balance"),
  v.literal("Overdue"),
  v.literal("Cancelled")
);
const priority = v.union(v.literal("Low"), v.literal("Medium"), v.literal("High"));
const jobActivityKind = v.union(
  v.literal("created"),
  v.literal("assigned"),
  v.literal("status"),
  v.literal("payment"),
  v.literal("email"),
  v.literal("note"),
  v.literal("document"),
  v.literal("completed")
);
const emailKind = v.union(
  v.literal("invoice"),
  v.literal("job_completion"),
  v.literal("balance_reminder"),
  v.literal("missing_document"),
  v.literal("payment_receipt"),
  v.literal("general"),
  v.literal("reminder"),
  v.literal("completion")
);
const emailDeliveryStatus = v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"));
const jobNoteAudience = v.union(v.literal("employee"), v.literal("manager"), v.literal("internal"));
const recurrenceType = v.union(
  v.literal("none"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly")
);
const notificationType = v.union(
  v.literal("assigned"),
  v.literal("dueSoon"),
  v.literal("dueToday"),
  v.literal("overdue"),
  v.literal("balance"),
  v.literal("managerAlert"),
  v.literal("report")
);
const notificationPriority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));
const notificationEmailStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped")
);
const reportPeriod = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("annual")
);
const bankAccountStatus = v.union(v.literal("active"), v.literal("inactive"));
const checkPaperSize = v.union(v.literal("Letter"), v.literal("A4"), v.literal("Custom"));
const checkPosition = v.union(v.literal("top"), v.literal("middle"), v.literal("bottom"), v.literal("fullPage"));
const checkDateOption = v.union(v.literal("blank"), v.literal("today"), v.literal("custom"));
const checkStatus = v.union(
  v.literal("draft"),
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("spoiled"),
  v.literal("voided"),
  v.literal("reprinted"),
  v.literal("cancelled")
);
const checkBatchStatus = v.union(
  v.literal("draft"),
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("partiallyCompleted"),
  v.literal("cancelled")
);
const sequenceEventAction = v.union(
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("spoiled"),
  v.literal("voided"),
  v.literal("cancelled"),
  v.literal("reprinted"),
  v.literal("skippedGap"),
  v.literal("sequenceChanged")
);
const templatePoint = v.object({
  x: v.number(),
  y: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number())
});
const templateLayout = v.object({
  businessName: templatePoint,
  businessAddress: templatePoint,
  bankName: templatePoint,
  checkNumber: templatePoint,
  date: templatePoint,
  payeeLine: templatePoint,
  amountBox: templatePoint,
  amountWordsLine: templatePoint,
  memoLine: templatePoint,
  signatureLine: templatePoint,
  micrLine: templatePoint,
  logo: templatePoint
});

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(role),
    title: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    accessStatus: v.optional(accessStatus),
    accessUpdatedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.union(v.number(), v.null())),
    mustChangePassword: v.optional(v.boolean()),
    passwordChangedAt: v.optional(v.union(v.number(), v.null())),
    adminCreated: v.optional(v.boolean()),
    isDemo: v.optional(v.boolean())
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"]),
  roles: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    permissions: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_key", ["key"]),
  permissions: defineTable({
    key: v.string(),
    label: v.string(),
    category: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_key", ["key"])
    .index("by_category", ["category"]),
  userPermissions: defineTable({
    userId: v.id("users"),
    permissionKey: v.string(),
    granted: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
    reason: v.optional(v.union(v.string(), v.null()))
  })
    .index("by_user_id", ["userId"])
    .index("by_permission_key", ["permissionKey"])
    .index("by_user_id_and_permission_key", ["userId", "permissionKey"]),
  customers: defineTable({
    businessName: v.string(),
    phoneNumber: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
    businessType: v.string(),
    openingBalance: v.number(),
    balance: v.number(),
    lastEmailSentAt: v.optional(v.union(v.number(), v.null())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_business_name", ["businessName"])
    .index("by_created_by", ["createdBy"]),
  jobs: defineTable({
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    jobOrderId: v.optional(v.string()),
    jobType: v.string(),
    fee: v.number(),
    amountPaid: v.number(),
    assignedEmployeeId: v.id("users"),
    status: jobStatus,
    dueDate: v.string(),
    deadlineAt: v.optional(v.union(v.number(), v.null())),
    reminder24hSentAt: v.optional(v.union(v.number(), v.null())),
    reminder3hSentAt: v.optional(v.union(v.number(), v.null())),
    priority,
    requestedBy: v.optional(v.union(v.string(), v.null())),
    clientContactPhone: v.optional(v.union(v.string(), v.null())),
    recurrenceType: v.optional(recurrenceType),
    nextDueDate: v.optional(v.union(v.string(), v.null())),
    autoCreateNextJob: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    assignedAt: v.optional(v.union(v.number(), v.null())),
    completedAt: v.optional(v.union(v.number(), v.null())),
    updatedAt: v.number()
  })
    .index("by_customer", ["customerId"])
    .index("by_client", ["clientId"])
    .index("by_job_order_id", ["jobOrderId"])
    .index("by_assigned_employee", ["assignedEmployeeId"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_due_date", ["dueDate"])
    .index("by_deadline_at", ["deadlineAt"]),
  payments: defineTable({
    jobId: v.id("jobs"),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    amount: v.number(),
    note: v.optional(v.string()),
    receivedBy: v.id("users"),
    paidAt: v.number()
  })
    .index("by_job", ["jobId"])
    .index("by_customer", ["customerId"])
    .index("by_client", ["clientId"])
    .index("by_received_by", ["receivedBy"]),
  jobDocuments: defineTable({
    jobId: v.id("jobs"),
    name: v.string(),
    fileType: v.string(),
    sizeLabel: v.optional(v.union(v.string(), v.null())),
    url: v.optional(v.union(v.string(), v.null())),
    uploadedBy: v.id("users"),
    uploadedAt: v.number()
  }).index("by_job", ["jobId"]),
  jobEmails: defineTable({
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    recipientEmail: v.optional(v.string()),
    recipientName: v.optional(v.union(v.string(), v.null())),
    emailType: emailKind,
    subject: v.string(),
    message: v.string(),
    html: v.optional(v.string()),
    sentBy: v.id("users"),
    sentAt: v.number(),
    deliveryStatus: v.optional(emailDeliveryStatus),
    provider: v.optional(v.union(v.string(), v.null())),
    providerMessageId: v.optional(v.union(v.string(), v.null())),
    errorMessage: v.optional(v.union(v.string(), v.null()))
  })
    .index("by_job", ["jobId"])
    .index("by_customer", ["customerId"])
    .index("by_client", ["clientId"]),
  emailTemplates: defineTable({
    emailType: emailKind,
    subject: v.string(),
    message: v.string(),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_email_type", ["emailType"]),
  jobNotes: defineTable({
    jobId: v.id("jobs"),
    audience: jobNoteAudience,
    body: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number()
  }).index("by_job", ["jobId"]),
  jobActivities: defineTable({
    jobId: v.id("jobs"),
    kind: jobActivityKind,
    title: v.string(),
    detail: v.optional(v.union(v.string(), v.null())),
    createdBy: v.optional(v.union(v.id("users"), v.null())),
    createdAt: v.number()
  }).index("by_job", ["jobId"]),
  notifications: defineTable({
    userId: v.id("users"),
    jobId: v.optional(v.union(v.id("jobs"), v.null())),
    type: notificationType,
    title: v.string(),
    message: v.string(),
    isRead: v.boolean(),
    priority: notificationPriority,
    link: v.optional(v.union(v.string(), v.null())),
    dedupeKey: v.optional(v.union(v.string(), v.null())),
    emailStatus: v.optional(notificationEmailStatus),
    emailSentAt: v.optional(v.union(v.number(), v.null())),
    emailError: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number()
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_is_read", ["userId", "isRead"])
    .index("by_job_id", ["jobId"])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_created_at", ["createdAt"]),
  chatProposals: defineTable({
    userId: v.id("users"),
    action: v.union(
      v.literal("add_note"),
      v.literal("complete_task"),
      v.literal("change_deadline"),
      v.literal("change_status"),
        v.literal("record_payment"),
        v.literal("create_client"),
        v.literal("create_service"),
        v.literal("create_scheduled_task"),
        v.literal("reassign_task")
      ),
    jobId: v.optional(v.union(v.id("jobs"), v.null())),
    payload: v.string(),
    summary: v.string(),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("cancelled"), v.literal("expired")),
    createdAt: v.number(),
    expiresAt: v.number(),
    confirmedAt: v.optional(v.union(v.number(), v.null()))
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_status", ["userId", "status"]),
  employeePerformanceSnapshots: defineTable({
    period: reportPeriod,
    periodStart: v.string(),
    periodEnd: v.string(),
    employeeId: v.id("users"),
    assignedJobs: v.number(),
    completedJobs: v.number(),
    pendingJobs: v.number(),
    overdueJobs: v.number(),
    completedLateJobs: v.number(),
    completedOnTimeJobs: v.number(),
    achievementPercentage: v.number(),
    notes: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number()
  })
    .index("by_period", ["period"])
    .index("by_employee_id", ["employeeId"])
    .index("by_period_and_employee_id", ["period", "employeeId"]),
  reportSnapshots: defineTable({
    period: reportPeriod,
    periodStart: v.string(),
    periodEnd: v.string(),
    totalJobsCreated: v.number(),
    totalJobsCompleted: v.number(),
    jobsInProgress: v.number(),
    jobsOverdue: v.number(),
    totalRevenueCollected: v.number(),
    totalRemainingBalance: v.number(),
    completedJobsWithBalance: v.number(),
    jobsNotCompletedByDueDate: v.number(),
    createdAt: v.number()
  })
    .index("by_period", ["period"])
    .index("by_created_at", ["createdAt"]),
  employeeNotes: defineTable({
    employeeId: v.id("users"),
    noteType: v.union(v.literal("performance"), v.literal("training"), v.literal("follow_up")),
    body: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number()
  })
    .index("by_employee_id", ["employeeId"])
    .index("by_created_by", ["createdBy"]),
  clients: defineTable({
    clientName: v.string(),
    clientType,
    businessLegalName: v.optional(v.union(v.string(), v.null())),
    dba: v.optional(v.union(v.string(), v.null())),
    businessCategory: v.optional(v.union(v.string(), v.null())),
    businessAddress: v.optional(v.union(v.string(), v.null())),
    mailingAddress: v.optional(v.union(v.string(), v.null())),
    phoneNumber: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    lastEmailSentAt: v.optional(v.union(v.number(), v.null())),
    ownerContactPerson: v.optional(v.union(v.string(), v.null())),
    taxId: v.optional(v.union(v.string(), v.null())),
    assignedTeamMemberId: v.optional(v.union(v.id("users"), v.null())),
    balanceDue: v.number(),
    notes: v.optional(v.union(v.string(), v.null())),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.number(), v.null())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_archived", ["archived"])
    .index("by_assigned_team_member", ["assignedTeamMemberId"])
    .index("by_client_type", ["clientType"])
    .index("by_client_name", ["clientName"]),
  tags: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    color: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index("by_normalized_name", ["normalizedName"]),
  clientTags: defineTable({
    clientId: v.id("clients"),
    tagId: v.id("tags"),
    createdBy: v.id("users"),
    createdAt: v.number()
  })
    .index("by_client", ["clientId"])
    .index("by_tag", ["tagId"])
    .index("by_client_and_tag", ["clientId", "tagId"]),
  services: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    defaultFee: v.optional(v.union(v.number(), v.null())),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_normalized_name", ["normalizedName"])
    .index("by_is_active", ["isActive"]),
  clientBankAccounts: defineTable({
    clientId: v.id("clients"),
    bankName: v.string(),
    accountNickname: v.string(),
    printBusinessName: v.string(),
    printBusinessAddress: v.string(),
    startingCheckNumber: v.number(),
    nextCheckNumber: v.number(),
    lastPrintedCheckNumber: v.optional(v.union(v.number(), v.null())),
    defaultTemplateId: v.optional(v.union(v.id("checkTemplates"), v.null())),
    routingNumberProtected: v.optional(v.union(v.string(), v.null())),
    routingNumberLast4: v.optional(v.union(v.string(), v.null())),
    accountNumberProtected: v.optional(v.union(v.string(), v.null())),
    accountNumberLast4: v.optional(v.union(v.string(), v.null())),
    micrEnabled: v.boolean(),
    signatureLineLabel: v.optional(v.union(v.string(), v.null())),
    logoUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageAuthorized: v.boolean(),
    status: bankAccountStatus,
    notes: v.optional(v.union(v.string(), v.null())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_client_id_and_status", ["clientId", "status"]),
  checkTemplates: defineTable({
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    bankAccountId: v.optional(v.union(v.id("clientBankAccounts"), v.null())),
    name: v.string(),
    paperSize: checkPaperSize,
    customWidthIn: v.optional(v.union(v.number(), v.null())),
    customHeightIn: v.optional(v.union(v.number(), v.null())),
    checkPosition,
    checksPerPage: v.number(),
    marginTop: v.number(),
    marginRight: v.number(),
    marginBottom: v.number(),
    marginLeft: v.number(),
    fontSize: v.number(),
    alignmentOffsetX: v.number(),
    alignmentOffsetY: v.number(),
    layout: templateLayout,
    isDefault: v.boolean(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_bank_account_id_and_is_active", ["bankAccountId", "isActive"]),
  checkBatches: defineTable({
    clientId: v.id("clients"),
    bankAccountId: v.id("clientBankAccounts"),
    templateId: v.id("checkTemplates"),
    startingCheckNumber: v.number(),
    endingCheckNumber: v.number(),
    quantity: v.number(),
    dateOption: checkDateOption,
    checkDate: v.optional(v.union(v.string(), v.null())),
    paperStockType: v.string(),
    memoText: v.optional(v.union(v.string(), v.null())),
    signatureImageEnabled: v.boolean(),
    alignmentOffsetX: v.number(),
    alignmentOffsetY: v.number(),
    status: checkBatchStatus,
    gapReason: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    createdBy: v.id("users"),
    printedBy: v.optional(v.union(v.id("users"), v.null())),
    createdAt: v.number(),
    printedAt: v.optional(v.union(v.number(), v.null())),
    updatedAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),
  checks: defineTable({
    clientId: v.id("clients"),
    bankAccountId: v.id("clientBankAccounts"),
    batchId: v.optional(v.union(v.id("checkBatches"), v.null())),
    checkNumber: v.number(),
    status: checkStatus,
    printDate: v.optional(v.union(v.number(), v.null())),
    createdBy: v.id("users"),
    printedBy: v.optional(v.union(v.id("users"), v.null())),
    spoiledVoidReason: v.optional(v.union(v.string(), v.null())),
    reprintCount: v.number(),
    notes: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_bank_account_id_and_check_number", ["bankAccountId", "checkNumber"])
    .index("by_bank_account_id_and_status", ["bankAccountId", "status"])
    .index("by_batch_id", ["batchId"])
    .index("by_status", ["status"])
    .index("by_print_date", ["printDate"]),
  checkSequenceEvents: defineTable({
    clientId: v.id("clients"),
    bankAccountId: v.id("clientBankAccounts"),
    batchId: v.optional(v.union(v.id("checkBatches"), v.null())),
    checkId: v.optional(v.union(v.id("checks"), v.null())),
    checkNumber: v.optional(v.union(v.number(), v.null())),
    rangeStart: v.optional(v.union(v.number(), v.null())),
    rangeEnd: v.optional(v.union(v.number(), v.null())),
    action: sequenceEventAction,
    oldNextCheckNumber: v.optional(v.union(v.number(), v.null())),
    newNextCheckNumber: v.optional(v.union(v.number(), v.null())),
    reason: v.optional(v.union(v.string(), v.null())),
    createdBy: v.id("users"),
    createdAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_batch_id", ["batchId"])
    .index("by_action", ["action"])
    .index("by_created_at", ["createdAt"]),
  auditLogs: defineTable({
    userId: v.optional(v.union(v.id("users"), v.null())),
    action: v.string(),
    targetUserId: v.optional(v.union(v.id("users"), v.null())),
    permissionKey: v.optional(v.union(v.string(), v.null())),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    bankAccountId: v.optional(v.union(v.id("clientBankAccounts"), v.null())),
    checkNumber: v.optional(v.union(v.number(), v.null())),
    checkRangeStart: v.optional(v.union(v.number(), v.null())),
    checkRangeEnd: v.optional(v.union(v.number(), v.null())),
    entityType: v.optional(v.union(v.string(), v.null())),
    entityId: v.optional(v.union(v.string(), v.null())),
    oldValue: v.optional(v.union(v.string(), v.null())),
    newValue: v.optional(v.union(v.string(), v.null())),
    reason: v.optional(v.union(v.string(), v.null())),
    ipDevice: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number()
  })
    .index("by_client_id", ["clientId"])
    .index("by_bank_account_id", ["bankAccountId"])
    .index("by_action", ["action"])
    .index("by_target_user_id", ["targetUserId"])
    .index("by_created_at", ["createdAt"])
});
