export type Id = string;
export type Role = "owner" | "manager" | "supervisor" | "employee" | "viewer";
export type AccessStatus = "active" | "suspended" | "removed";
export type PermissionKey =
  | "clients.view"
  | "clients.add"
  | "clients.edit"
  | "clients.archive"
  | "clients.view_balance"
  | "jobs.view"
  | "jobs.add"
  | "jobs.edit"
  | "jobs.assign"
  | "jobs.reassign"
  | "jobs.complete"
  | "jobs.delete"
  | "payments.view"
  | "payments.add"
  | "payments.edit"
  | "payments.delete"
  | "payments.view_balances"
  | "payments.send_invoices"
  | "emails.send_client"
  | "emails.send_invoice"
  | "emails.request_documents"
  | "emails.edit_templates"
  | "reports.view"
  | "reports.employee_performance"
  | "reports.export"
  | "reports.company_revenue"
  | "team.view"
  | "team.add"
  | "team.edit"
  | "team.suspend"
  | "team.delete"
  | "team.change_roles"
  | "team.change_permissions"
  | "settings.manage_services"
  | "settings.manage_tags"
  | "settings.manage_notifications"
  | "settings.manage_company";
export type ClientType = "Business" | "Individual";
export type JobStatus =
  | "New"
  | "Assigned"
  | "In Progress"
  | "Waiting on Client"
  | "Waiting on Government"
  | "Completed"
  | "Completed With Balance"
  | "Overdue"
  | "Cancelled";
export type Priority = "Low" | "Medium" | "High";
export type RecurrenceType = "none" | "monthly" | "quarterly" | "yearly";
export type NotificationType =
  | "assigned"
  | "dueSoon"
  | "dueToday"
  | "overdue"
  | "balance"
  | "managerAlert"
  | "report";
export type NotificationPriority = "low" | "medium" | "high";
export type NotificationEmailStatus = "queued" | "sent" | "failed" | "skipped";
export type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type BalanceFilter = "all" | "withBalance" | "paid";
export type CompletionFilter = "all" | "completed" | "notCompleted";
export type EmployeeNoteType = "performance" | "training" | "follow_up";
export type EmailType =
  | "invoice"
  | "job_completion"
  | "balance_reminder"
  | "missing_document"
  | "payment_receipt"
  | "general"
  | "reminder"
  | "completion";
export type DeliveryStatus = "queued" | "sent" | "failed";
export type BankAccountStatus = "active" | "inactive";
export type CheckPaperSize = "Letter" | "A4" | "Custom";
export type CheckPosition = "top" | "middle" | "bottom" | "fullPage";
export type CheckDateOption = "blank" | "today" | "custom";
export type CheckStatus = "draft" | "reserved" | "printed" | "spoiled" | "voided" | "reprinted" | "cancelled";
export type CheckBatchStatus = "draft" | "reserved" | "printed" | "partiallyCompleted" | "cancelled";

export type CheckTemplatePoint = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type CheckTemplateLayout = {
  businessName: CheckTemplatePoint;
  businessAddress: CheckTemplatePoint;
  bankName: CheckTemplatePoint;
  checkNumber: CheckTemplatePoint;
  date: CheckTemplatePoint;
  payeeLine: CheckTemplatePoint;
  amountBox: CheckTemplatePoint;
  amountWordsLine: CheckTemplatePoint;
  memoLine: CheckTemplatePoint;
  signatureLine: CheckTemplatePoint;
  micrLine: CheckTemplatePoint;
  logo: CheckTemplatePoint;
};

export type UserDoc = {
  _id: Id;
  _creationTime?: number;
  name?: string;
  email?: string;
  phone?: string;
  role?: Role;
  title?: string;
  permissions?: PermissionKey[];
  isActive?: boolean;
  accessStatus?: AccessStatus;
  accessUpdatedAt?: number;
  lastLoginAt?: number | null;
  mustChangePassword?: boolean;
  passwordChangedAt?: number | null;
  isDemo?: boolean;
};

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  category: string;
};

export type PermissionPreset = {
  key: string;
  label: string;
  permissions: PermissionKey[];
};

export type PermissionAuditLogDoc = {
  _id: Id;
  userId?: Id | null;
  action: string;
  targetUserId?: Id | null;
  permissionKey?: PermissionKey | string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  createdAt: number;
  actor?: UserDoc | null;
  targetUser?: UserDoc | null;
};

export type ServiceDoc = {
  _id: Id;
  name: string;
  normalizedName: string;
  defaultFee?: number | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CustomerDoc = {
  _id: Id;
  businessName: string;
  phoneNumber: string;
  email?: string | null;
  businessType: string;
  openingBalance: number;
  balance: number;
  lastEmailSentAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TagDoc = {
  _id: Id;
  name: string;
  normalizedName: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

export type ClientDoc = {
  _id: Id;
  clientName: string;
  clientType: ClientType;
  businessLegalName?: string | null;
  dba?: string | null;
  businessCategory?: string | null;
  businessAddress?: string | null;
  mailingAddress?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  lastEmailSentAt?: number | null;
  ownerContactPerson?: string | null;
  taxId?: string | null;
  assignedTeamMemberId?: Id | null;
  balanceDue: number;
  notes?: string | null;
  archived: boolean;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  tags: TagDoc[];
  assignedTeamMember?: UserDoc | null;
};

export type ClientBankAccountDoc = {
  _id: Id;
  clientId: Id;
  bankName: string;
  accountNickname: string;
  printBusinessName: string;
  printBusinessAddress: string;
  startingCheckNumber: number;
  nextCheckNumber: number;
  lastPrintedCheckNumber?: number | null;
  defaultTemplateId?: Id | null;
  routingNumberLast4?: string | null;
  accountNumberLast4?: string | null;
  routingNumberMasked?: string | null;
  accountNumberMasked?: string | null;
  micrEnabled: boolean;
  signatureLineLabel?: string | null;
  logoUrl?: string | null;
  signatureImageUrl?: string | null;
  signatureImageAuthorized: boolean;
  status: BankAccountStatus;
  notes?: string | null;
  canViewSensitive?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CheckTemplateDoc = {
  _id: Id;
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
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CheckBatchDoc = {
  _id: Id;
  clientId: Id;
  bankAccountId: Id;
  templateId: Id;
  startingCheckNumber: number;
  endingCheckNumber: number;
  quantity: number;
  dateOption: CheckDateOption;
  checkDate?: string | null;
  paperStockType: string;
  memoText?: string | null;
  signatureImageEnabled: boolean;
  alignmentOffsetX: number;
  alignmentOffsetY: number;
  status: CheckBatchStatus;
  gapReason?: string | null;
  notes?: string | null;
  createdBy: Id;
  printedBy?: Id | null;
  createdAt: number;
  printedAt?: number | null;
  updatedAt: number;
  client?: ClientDoc | null;
  bankAccount?: ClientBankAccountDoc | null;
};

export type CheckDoc = {
  _id: Id;
  clientId: Id;
  bankAccountId: Id;
  batchId?: Id | null;
  checkNumber: number;
  status: CheckStatus;
  printDate?: number | null;
  createdBy: Id;
  printedBy?: Id | null;
  spoiledVoidReason?: string | null;
  reprintCount: number;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
  client?: ClientDoc | null;
  bankAccount?: ClientBankAccountDoc | null;
};

export type CheckAuditLogDoc = {
  _id: Id;
  userId?: Id | null;
  action: string;
  clientId?: Id | null;
  bankAccountId?: Id | null;
  checkNumber?: number | null;
  checkRangeStart?: number | null;
  checkRangeEnd?: number | null;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  ipDevice?: string | null;
  createdAt: number;
};

export type SequenceGapDoc = {
  _id: Id;
  clientId: Id;
  bankAccountId: Id;
  rangeStart?: number | null;
  rangeEnd?: number | null;
  reason?: string | null;
  createdAt: number;
  missingCheckNumber: string;
  gapKind: string;
  client?: ClientDoc | null;
  bankAccount?: ClientBankAccountDoc | null;
};

export type CheckBatchPreview = {
  batch: CheckBatchDoc;
  client: ClientDoc;
  bankAccount: ClientBankAccountDoc;
  template: CheckTemplateDoc | null;
  checks: CheckDoc[];
  canFinalize: boolean;
};

export type JobDoc = {
  _id: Id;
  jobOrderId: string;
  customerId?: Id;
  clientId?: Id;
  jobType: string;
  fee: number;
  amountPaid: number;
  remainingBalance: number;
  assignedEmployeeId: Id;
  status: JobStatus;
  dueDate: string;
  deadlineAt?: number | null;
  reminder24hSentAt?: number | null;
  reminder3hSentAt?: number | null;
  priority: Priority;
  requestedBy?: string | null;
  clientContactPhone?: string | null;
  recurrenceType?: RecurrenceType;
  nextDueDate?: string | null;
  autoCreateNextJob?: boolean;
  notes?: string;
  createdAt: number;
  assignedAt?: number | null;
  completedAt?: number | null;
  updatedAt: number;
  customer?: CustomerDoc | null;
  client?: ClientDoc | null;
  assignedEmployee?: UserDoc | null;
};

export type NotificationDoc = {
  _id: Id;
  userId: Id;
  jobId?: Id | null;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  priority: NotificationPriority;
  link?: string | null;
  dedupeKey?: string | null;
  emailStatus?: NotificationEmailStatus;
  emailSentAt?: number | null;
  emailError?: string | null;
  createdAt: number;
};

export type ReportJobRow = {
  _id: Id;
  jobOrderId: string;
  jobType: string;
  customerName: string;
  assignedEmployeeName: string;
  status: JobStatus;
  priority: Priority;
  dueDate: string;
  createdAt: number;
  completedAt?: number | null;
  remainingBalance: number;
  link: string;
};

export type EmployeePerformanceRow = {
  employeeId: Id;
  employeeName: string;
  assignedJobs: number;
  completedJobs: number;
  pendingJobs: number;
  overdueJobs: number;
  completedLateJobs: number;
  completedOnTimeJobs: number;
  achievementPercentage: number;
  unfinishedJobs: ReportJobRow[];
  managerNotes: string;
};

export type ReportDashboard = {
  period: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  totalJobsCreated: number;
  totalJobsCompleted: number;
  jobsInProgress: number;
  jobsOverdue: number;
  totalRevenueCollected: number;
  totalRemainingBalance: number;
  completedJobsWithBalance: number;
  jobsNotCompletedByDueDate: number;
  lateJobs: ReportJobRow[];
  balanceDueJobs: ReportJobRow[];
  employeePerformance: EmployeePerformanceRow[];
};

export type EmployeeAssignedJobRow = {
  _id: Id;
  jobOrderId: string;
  customerName: string;
  jobType: string;
  status: JobStatus;
  priority: Priority;
  dueDate: string;
  completedAt?: number | null;
  remainingBalance: number;
  notes?: string | null;
  link: string;
};

export type EmployeePerformanceSummary = {
  totalAssignedJobs: number;
  completedJobs: number;
  pendingJobs: number;
  inProgressJobs: number;
  overdueJobs: number;
  completedWithBalance: number;
  completedOnTime: number;
  completedLate: number;
  achievementPercentage: number;
};

export type EmployeePeriodReport = {
  period: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  jobsAssignedDuringPeriod: number;
  jobsCompletedDuringPeriod: number;
  jobsNotCompleted: number;
  jobsOverdue: number;
  averageCompletionTimeDays: number;
  balanceDueFromCompletedJobs: number;
};

export type EmployeeActivityRow = {
  id: string;
  type: "assigned" | "status" | "completed" | "payment" | "email" | "reminder" | "manager_note";
  title: string;
  detail?: string | null;
  jobOrderId?: string | null;
  link?: string | null;
  createdAt: number;
};

export type EmployeeManagerNoteDoc = {
  _id: Id;
  employeeId: Id;
  noteType: EmployeeNoteType;
  body: string;
  createdBy: UserDoc | null;
  createdAt: number;
};

export type EmployeeDetailDoc = {
  profile: UserDoc;
  permissions: PermissionKey[];
  canEditAccess: boolean;
  canChangeRoles: boolean;
  canChangePermissions: boolean;
  canAddManagerNotes: boolean;
  jobs: EmployeeAssignedJobRow[];
  summary: EmployeePerformanceSummary;
  reports: EmployeePeriodReport[];
  activity: EmployeeActivityRow[];
  notes: EmployeeManagerNoteDoc[];
  reminders: NotificationDoc[];
};

export type JobDocumentDoc = {
  _id: Id;
  jobId: Id;
  name: string;
  fileType: string;
  sizeLabel?: string | null;
  url?: string | null;
  uploadedBy: UserDoc | null;
  uploadedAt: number;
};

export type JobEmailDoc = {
  _id: Id;
  jobId?: Id;
  customerId?: Id;
  clientId?: Id;
  recipientEmail?: string;
  recipientName?: string | null;
  emailType: EmailType;
  subject: string;
  message: string;
  html?: string;
  sentBy: UserDoc | null;
  sentAt: number;
  deliveryStatus?: DeliveryStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
};

export type EmailTemplateDoc = {
  _id?: Id;
  emailType: EmailType;
  label: string;
  subject: string;
  message: string;
  updatedAt?: number;
};

export type EmailDraft = {
  emailType: EmailType;
  label: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  message: string;
};

export type JobNoteDoc = {
  _id: Id;
  jobId: Id;
  audience: "employee" | "manager" | "internal";
  body: string;
  createdBy: UserDoc | null;
  createdAt: number;
};

export type JobActivityDoc = {
  _id: Id | string;
  jobId: Id;
  kind: "created" | "assigned" | "status" | "payment" | "email" | "note" | "document" | "completed";
  title: string;
  detail?: string | null;
  createdBy?: UserDoc | null;
  createdAt: number;
};

export type PaymentDoc = {
  _id: Id;
  jobId: Id;
  customerId?: Id;
  clientId?: Id;
  amount: number;
  note?: string;
  paidAt: number;
  job?: JobDoc | null;
  customer?: CustomerDoc | null;
  client?: ClientDoc | null;
  receivedBy?: UserDoc | null;
};

export type WorkloadSummary = {
  userId: Id;
  name: string;
  role: Role;
  totalJobs: number;
  pendingJobs: number;
  completedJobs: number;
  highPriorityJobs: number;
};

export type DashboardAlert = {
  kind: "dueDate" | "unpaidInvoice";
  severity: "medium" | "high";
  title: string;
  detail: string;
  jobId: Id;
};

export type DashboardMetrics = {
  totalJobs: number;
  pendingJobs: number;
  completedJobs: number;
  totalRevenue: number;
  outstandingBalances: number;
  highPriorityJobs: number;
  employeeWorkload: WorkloadSummary[];
  alerts: DashboardAlert[];
  recentJobs: JobDoc[];
};

export type JobDetailsDoc = {
  job: JobDoc;
  payments: PaymentDoc[];
  documents: JobDocumentDoc[];
  emails: JobEmailDoc[];
  notes: JobNoteDoc[];
  activities: JobActivityDoc[];
};
