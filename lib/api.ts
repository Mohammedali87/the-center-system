import { makeFunctionReference } from "convex/server";
import type {
  ClientDoc,
  ClientType,
  CustomerDoc,
  DashboardMetrics,
  EmailDraft,
  EmailTemplateDoc,
  EmailType,
  EmployeeDetailDoc,
  EmployeeNoteType,
  Id,
  JobDetailsDoc,
  JobEmailDoc,
  JobDoc,
  JobStatus,
  NotificationDoc,
  PaymentDoc,
  PermissionAuditLogDoc,
  PermissionDefinition,
  PermissionKey,
  PermissionPreset,
  Priority,
  RecurrenceType,
  ReportDashboard,
  ReportPeriod,
  Role,
  AccessStatus,
  BalanceFilter,
  BankAccountStatus,
  CheckAuditLogDoc,
  CheckBatchDoc,
  CheckBatchPreview,
  CheckDateOption,
  CheckDoc,
  CheckPaperSize,
  CheckPosition,
  CheckStatus,
  CheckTemplateDoc,
  CheckTemplateLayout,
  CompletionFilter,
  ServiceDoc,
  ClientBankAccountDoc,
  SequenceGapDoc,
  TagDoc,
  UserDoc
} from "./types";

type EmptyArgs = Record<string, never>;
type ApiArgs = Record<string, unknown>;

const q = <Args extends ApiArgs, Return>(name: string) =>
  makeFunctionReference<"query", Args, Return>(name);
const m = <Args extends ApiArgs, Return>(name: string) =>
  makeFunctionReference<"mutation", Args, Return>(name);
const a = <Args extends ApiArgs, Return>(name: string) =>
  makeFunctionReference<"action", Args, Return>(name);

type ClientPayload = {
  clientName: string;
  clientType: ClientType;
  businessLegalName?: string | null;
  dba?: string | null;
  businessCategory?: string | null;
  businessAddress?: string | null;
  mailingAddress?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  ownerContactPerson?: string | null;
  taxId?: string | null;
  assignedTeamMemberId?: Id | null;
  balanceDue: number;
  notes?: string | null;
  tagIds?: Id[];
};

type BankAccountPayload = {
  clientId: Id;
  bankName: string;
  accountNickname: string;
  printBusinessName: string;
  printBusinessAddress: string;
  startingCheckNumber: number;
  routingNumber?: string | null;
  accountNumber?: string | null;
  micrEnabled: boolean;
  signatureLineLabel?: string | null;
  logoUrl?: string | null;
  signatureImageUrl?: string | null;
  signatureImageAuthorized: boolean;
  notes?: string | null;
};

type TemplatePayload = {
  clientId?: Id | null;
  bankAccountId?: Id | null;
  name: string;
  paperSize: CheckPaperSize;
  customWidthIn?: number | null;
  customHeightIn?: number | null;
  checkPosition: CheckPosition;
  checksPerPage: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontSize: number;
  alignmentOffsetX: number;
  alignmentOffsetY: number;
  layout: CheckTemplateLayout;
  isDefault: boolean;
};

type ReserveBatchPayload = {
  clientId: Id;
  bankAccountId: Id;
  templateId: Id;
  startingCheckNumber: number;
  quantity: number;
  dateOption: CheckDateOption;
  checkDate?: string | null;
  paperStockType: string;
  memoText?: string | null;
  signatureImageEnabled: boolean;
  alignmentOffsetX: number;
  alignmentOffsetY: number;
  gapReason?: string | null;
  overrideReason?: string | null;
  notes?: string | null;
};

export const api = {
  auth: {
    getMe: q<EmptyArgs, UserDoc | null>("auth:getMe"),
    listEmployees: q<{ includeInactive?: boolean }, UserDoc[]>("auth:listEmployees"),
    createTeamUser: a<
      { name: string; email: string; password: string; role: Role; title?: string; phone?: string },
      Id
    >("auth:createTeamUser"),
    updateUserRole: m<{ userId: Id; role: Role }, null>("auth:updateUserRole"),
    updateTeamUser: m<
      { userId: Id; name: string; role: Role; title: string; phone?: string; accessStatus: AccessStatus },
      null
    >("auth:updateTeamUser"),
    updateTeamAccess: m<{ userId: Id; accessStatus: AccessStatus }, null>("auth:updateTeamAccess"),
    changeOwnPassword: a<{ password: string }, null>("auth:changeOwnPassword"),
    resetUserPassword: a<{ userId: Id; temporaryPassword: string }, null>("auth:resetUserPassword"),
    touchLastLogin: m<EmptyArgs, null>("auth:touchLastLogin")
  },
  employees: {
    getDetail: q<{ employeeId: Id }, EmployeeDetailDoc | null>("employees:getDetail"),
    addManagerNote: m<{ employeeId: Id; noteType: EmployeeNoteType; body: string }, Id>(
      "employees:addManagerNote"
    )
  },
  permissions: {
    getCatalog: q<
      EmptyArgs,
      {
        permissions: readonly PermissionDefinition[];
        presets: readonly PermissionPreset[];
        roleDefaults: Record<Role, PermissionKey[]>;
      }
    >("permissions:getCatalog"),
    getForUser: q<
      { userId: Id },
      {
        userId: Id;
        role: Role;
        defaultPermissions: PermissionKey[];
        permissions: PermissionKey[];
        overrides: unknown[];
      } | null
    >("permissions:getForUser"),
    updateUserPermissions: m<
      { userId: Id; permissions: PermissionKey[]; reason?: string; confirmedOwnerChange?: boolean },
      { permissions: PermissionKey[] }
    >("permissions:updateUserPermissions"),
    applyPreset: m<
      { userId: Id; presetKey: string; reason?: string; confirmedOwnerChange?: boolean },
      { permissions: PermissionKey[] }
    >("permissions:applyPreset"),
    listAuditLogs: q<{ targetUserId?: Id }, PermissionAuditLogDoc[]>("permissions:listAuditLogs"),
    seedPermissionCatalog: m<EmptyArgs, null>("permissions:seedPermissionCatalog")
  },
  dashboard: {
    metrics: q<EmptyArgs, DashboardMetrics>("dashboard:metrics")
  },
  notifications: {
    list: q<{ unreadOnly?: boolean }, NotificationDoc[]>("notifications:list"),
    unreadCount: q<EmptyArgs, number>("notifications:unreadCount"),
    markRead: m<{ notificationId: Id }, null>("notifications:markRead"),
    markAllRead: m<EmptyArgs, { updated: number }>("notifications:markAllRead"),
    create: m<
      {
        userId: Id;
        jobId?: Id | null;
        type: NotificationDoc["type"];
        title: string;
        message: string;
        priority: NotificationDoc["priority"];
        link?: string | null;
        dedupeKey?: string | null;
      },
      Id
    >("notifications:create")
  },
  reports: {
    dashboard: q<
      {
        period?: ReportPeriod;
        startDate?: string;
        endDate?: string;
        employeeId?: Id;
        jobType?: string;
        status?: JobStatus;
        customerId?: Id;
        clientId?: Id;
        balanceDue?: BalanceFilter;
        completion?: CompletionFilter;
      },
      ReportDashboard
    >("reports:dashboard")
  },
  services: {
    list: q<{ includeInactive?: boolean }, ServiceDoc[]>("services:list"),
    create: m<{ name: string; defaultFee?: number }, Id>("services:create"),
    update: m<
      { serviceId: Id; name: string; defaultFee?: number; isActive: boolean },
      null
    >("services:update"),
    updateStatus: m<{ serviceId: Id; isActive: boolean }, null>("services:updateStatus"),
    remove: m<{ serviceId: Id }, null>("services:remove"),
    seedDefaults: m<EmptyArgs, null>("services:seedDefaults")
  },
  customers: {
    list: q<{ search?: string }, CustomerDoc[]>("customers:list"),
    create: m<
      { businessName: string; phoneNumber: string; email?: string | null; businessType: string; balance: number },
      Id
    >("customers:create"),
    update: m<
      {
        customerId: Id;
        businessName: string;
        phoneNumber: string;
        email?: string | null;
        businessType: string;
        balance: number;
      },
      null
    >("customers:update"),
    remove: m<{ customerId: Id }, null>("customers:remove")
  },
  clients: {
    get: q<{ clientId: Id }, ClientDoc | null>("clients:get"),
    list: q<{ archived?: boolean; search?: string }, ClientDoc[]>("clients:list"),
    listTags: q<EmptyArgs, TagDoc[]>("clients:listTags"),
    create: m<ClientPayload, Id>("clients:create"),
    update: m<ClientPayload & { clientId: Id }, null>("clients:update"),
    archive: m<{ clientId: Id; archived: boolean }, null>("clients:archive"),
    bulkArchive: m<{ clientIds: Id[]; archived: boolean }, { updated: number }>("clients:bulkArchive"),
    bulkAssignEmployee: m<
      { clientIds: Id[]; assignedTeamMemberId: Id },
      { updated: number }
    >("clients:bulkAssignEmployee"),
    bulkAssignTags: m<{ clientIds: Id[]; tagIds: Id[] }, { updated: number }>("clients:bulkAssignTags"),
    bulkCreateJobs: m<
      {
        clientIds: Id[];
        jobType: string;
        fee: number;
        assignedEmployeeId: Id;
        dueDate: string;
        deadlineAt?: number;
        priority: Priority;
        requestedBy?: string;
        clientContactPhone?: string;
        amountPaid?: number;
        notes?: string;
        recurrenceType: RecurrenceType;
        nextDueDate?: string | null;
        autoCreateNextJob: boolean;
      },
      { created: number; jobIds: Id[] }
    >("clients:bulkCreateJobs"),
    createJobsForClient: m<
      {
        clientId: Id;
        jobs: {
          jobType: string;
          fee: number;
          assignedEmployeeId: Id;
          dueDate: string;
          priority: Priority;
          requestedBy?: string;
          clientContactPhone?: string;
          amountPaid?: number;
          notes?: string;
          recurrenceType: RecurrenceType;
          nextDueDate?: string | null;
          autoCreateNextJob: boolean;
        }[];
      },
      { created: number; jobIds: Id[] }
    >("clients:createJobsForClient"),
    bulkSendEmail: m<
      { clientIds: Id[]; subject: string; message: string },
      { queued: number; subject: string; messagePreview: string }
    >("clients:bulkSendEmail"),
    bulkCreateReminders: m<
      { clientIds: Id[]; reminderDate: string; message: string },
      { created: number; reminderDate: string; messagePreview: string }
    >("clients:bulkCreateReminders"),
    upsertTag: m<{ name: string; color?: string }, Id>("clients:upsertTag"),
    updateTag: m<{ tagId: Id; name: string; color: string }, null>("clients:updateTag"),
    removeTag: m<{ tagId: Id }, null>("clients:removeTag")
  },
  checks: {
    listBankAccounts: q<
      { clientId: Id; includeInactive?: boolean },
      ClientBankAccountDoc[]
    >("checks:listBankAccounts"),
    getBankAccount: q<{ bankAccountId: Id }, ClientBankAccountDoc>("checks:getBankAccount"),
    revealBankData: m<
      { bankAccountId: Id; reason: string },
      { routingNumber: string; accountNumber: string }
    >("checks:revealBankData"),
    createBankAccount: m<BankAccountPayload, Id>("checks:createBankAccount"),
    updateBankAccount: m<
      Omit<BankAccountPayload, "clientId" | "startingCheckNumber"> & {
        bankAccountId: Id;
        nextCheckNumber: number;
        status: BankAccountStatus;
        reason: string;
      },
      null
    >("checks:updateBankAccount"),
    listTemplates: q<
      { clientId?: Id; bankAccountId?: Id; includeInactive?: boolean },
      CheckTemplateDoc[]
    >("checks:listTemplates"),
    createTemplate: m<TemplatePayload, Id>("checks:createTemplate"),
    updateTemplate: m<TemplatePayload & { templateId: Id; isActive: boolean }, null>("checks:updateTemplate"),
    reserveBlankCheckBatch: m<ReserveBatchPayload, { batchId: Id; checkIds: Id[] }>("checks:reserveBlankCheckBatch"),
    getBatchPreview: q<{ batchId: Id }, CheckBatchPreview>("checks:getBatchPreview"),
    confirmBatchAllPrinted: m<
      { batchId: Id; notes?: string | null },
      { printed: number; nextCheckNumber: number }
    >("checks:confirmBatchAllPrinted"),
    resolveBatchAfterPrint: m<
      {
        batchId: Id;
        outcomes: { checkNumber: number; outcome: "printed" | "spoiled" | "notPrinted"; reason?: string | null }[];
        notes?: string | null;
      },
      { printed: number; spoiled: number; notPrinted: number; nextCheckNumber: number }
    >("checks:resolveBatchAfterPrint"),
    cancelBatch: m<{ batchId: Id; reason: string }, { cancelled: number }>("checks:cancelBatch"),
    voidCheck: m<{ checkId: Id; reason: string }, null>("checks:voidCheck"),
    reprintCheck: m<{ checkId: Id; reason: string }, null>("checks:reprintCheck"),
    listRegister: q<
      {
        clientId?: Id;
        bankAccountId?: Id;
        status?: CheckStatus;
        checkNumberFrom?: number;
        checkNumberTo?: number;
      },
      CheckDoc[]
    >("checks:listRegister"),
    listBatches: q<{ clientId?: Id; bankAccountId?: Id }, CheckBatchDoc[]>("checks:listBatches"),
    listAuditLogs: q<
      { clientId?: Id; bankAccountId?: Id; action?: string },
      CheckAuditLogDoc[]
    >("checks:listAuditLogs"),
    sequenceGapReport: q<
      { clientId?: Id; bankAccountId?: Id },
      SequenceGapDoc[]
    >("checks:sequenceGapReport"),
    testPrintPreview: q<
      { clientId: Id; bankAccountId: Id; templateId: Id; sampleCheckNumber?: number },
      {
        client: ClientDoc;
        bankAccount: ClientBankAccountDoc;
        template: CheckTemplateDoc;
        checkNumber: number;
        isTestPrint: true;
      }
    >("checks:testPrintPreview")
  },
  jobs: {
    get: q<{ id: string }, JobDetailsDoc | null>("jobs:get"),
    list: q<
      {
        status?: JobStatus;
        employeeId?: Id;
        priority?: Priority;
        customerId?: Id;
        clientId?: Id;
        search?: string;
      },
      JobDoc[]
    >("jobs:list"),
    create: m<
      {
        customerId: Id;
        jobType: string;
        fee: number;
        amountPaid: number;
        assignedEmployeeId: Id;
        status: JobStatus;
        dueDate: string;
        deadlineAt?: number;
        priority: Priority;
        requestedBy?: string;
        clientContactPhone?: string;
        notes?: string;
      },
      Id
    >("jobs:create"),
    update: m<
      {
        jobId: Id;
        customerId: Id;
        jobType: string;
        fee: number;
        assignedEmployeeId: Id;
        status: JobStatus;
        dueDate: string;
        deadlineAt?: number;
        priority: Priority;
        requestedBy?: string;
        clientContactPhone?: string;
        notes?: string;
      },
      null
    >("jobs:update"),
    updateStatus: m<{ jobId: Id; status: JobStatus }, null>("jobs:updateStatus"),
    addNote: m<{ jobId: Id; audience: "employee" | "manager" | "internal"; body: string }, Id>("jobs:addNote"),
    addDocumentRecord: m<
      { jobId: Id; name: string; fileType: string; sizeLabel?: string; url?: string },
      Id
    >("jobs:addDocumentRecord"),
    remove: m<{ jobId: Id }, null>("jobs:remove")
  },
  chatbot: {
    ask: a<{ message: string }, { text: string; proposalId?: Id }>("chatbot:ask"),
    listPending: q<EmptyArgs, Array<{ _id: Id; summary: string; expiresAt: number }>>("chatbot:listPending"),
    confirm: m<{ proposalId: Id; approved: boolean }, string>("chatbot:confirm")
  },
  emails: {
    list: q<{ jobId?: Id; customerId?: Id; clientId?: Id }, JobEmailDoc[]>("emails:list"),
    listTemplates: q<EmptyArgs, EmailTemplateDoc[]>("emails:listTemplates"),
    getDraft: q<
      { jobId?: Id; customerId?: Id; clientId?: Id; emailType: EmailType },
      EmailDraft
    >("emails:getDraft"),
    upsertTemplate: m<{ emailType: EmailType; subject: string; message: string }, Id>("emails:upsertTemplate"),
    send: a<
      {
        jobId?: Id;
        customerId?: Id;
        clientId?: Id;
        emailType: EmailType;
        recipientEmail?: string;
        subject: string;
        message: string;
        saveTemplate?: boolean;
      },
      { emailId: Id; providerMessageId?: string | null }
    >("emailActions:send")
  },
  payments: {
    list: q<{ jobId?: Id; customerId?: Id; clientId?: Id }, PaymentDoc[]>("payments:list"),
    record: m<{ jobId: Id; amount: number; note?: string }, null>("payments:record"),
    update: m<{ paymentId: Id; amount: number; note?: string }, null>("payments:update"),
    remove: m<{ paymentId: Id }, null>("payments:remove")
  },
  seed: {
    installDemo: a<
      EmptyArgs,
      { seeded: boolean; users: { email: string; password: string; role: string }[] }
    >("seed:installDemo")
  }
};
