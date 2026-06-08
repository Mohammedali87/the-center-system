import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("supervisor"),
  v.literal("employee"),
  v.literal("viewer")
);

export const accessStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("removed")
);

export const clientTypeValidator = v.union(
  v.literal("Business"),
  v.literal("Individual")
);

export const jobStatusValidator = v.union(
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

export const notificationTypeValidator = v.union(
  v.literal("assigned"),
  v.literal("dueSoon"),
  v.literal("dueToday"),
  v.literal("overdue"),
  v.literal("balance"),
  v.literal("managerAlert"),
  v.literal("report")
);

export const notificationPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

export const reportPeriodValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("annual")
);

export const recurrenceTypeValidator = v.union(
  v.literal("none"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly")
);

export const priorityValidator = v.union(
  v.literal("Low"),
  v.literal("Medium"),
  v.literal("High")
);

export const emailTypeValidator = v.union(
  v.literal("invoice"),
  v.literal("job_completion"),
  v.literal("balance_reminder"),
  v.literal("missing_document"),
  v.literal("payment_receipt"),
  v.literal("general"),
  v.literal("reminder"),
  v.literal("completion")
);

export const deliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed")
);

export const bankAccountStatusValidator = v.union(v.literal("active"), v.literal("inactive"));

export const checkPaperSizeValidator = v.union(
  v.literal("Letter"),
  v.literal("A4"),
  v.literal("Custom")
);

export const checkPositionValidator = v.union(
  v.literal("top"),
  v.literal("middle"),
  v.literal("bottom"),
  v.literal("fullPage")
);

export const checkDateOptionValidator = v.union(
  v.literal("blank"),
  v.literal("today"),
  v.literal("custom")
);

export const checkStatusValidator = v.union(
  v.literal("draft"),
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("spoiled"),
  v.literal("voided"),
  v.literal("reprinted"),
  v.literal("cancelled")
);

export const checkBatchStatusValidator = v.union(
  v.literal("draft"),
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("partiallyCompleted"),
  v.literal("cancelled")
);

export const checkSequenceActionValidator = v.union(
  v.literal("reserved"),
  v.literal("printed"),
  v.literal("spoiled"),
  v.literal("voided"),
  v.literal("cancelled"),
  v.literal("reprinted"),
  v.literal("skippedGap"),
  v.literal("sequenceChanged")
);

export const checkTemplatePointValidator = v.object({
  x: v.number(),
  y: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number())
});

export const checkTemplateLayoutValidator = v.object({
  businessName: checkTemplatePointValidator,
  businessAddress: checkTemplatePointValidator,
  bankName: checkTemplatePointValidator,
  checkNumber: checkTemplatePointValidator,
  date: checkTemplatePointValidator,
  payeeLine: checkTemplatePointValidator,
  amountBox: checkTemplatePointValidator,
  amountWordsLine: checkTemplatePointValidator,
  memoLine: checkTemplatePointValidator,
  signatureLine: checkTemplatePointValidator,
  micrLine: checkTemplatePointValidator,
  logo: checkTemplatePointValidator
});

export const customerFields = {
  businessName: v.string(),
  phoneNumber: v.string(),
  email: v.optional(v.union(v.string(), v.null())),
  businessType: v.string(),
  balance: v.number()
};

export const jobFields = {
  customerId: v.id("customers"),
  jobType: v.string(),
  fee: v.number(),
  amountPaid: v.number(),
  assignedEmployeeId: v.id("users"),
  status: jobStatusValidator,
  dueDate: v.string(),
  priority: priorityValidator,
  requestedBy: v.optional(v.string()),
  clientContactPhone: v.optional(v.string()),
  notes: v.optional(v.string())
};
