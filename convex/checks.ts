import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  bankAccountStatusValidator,
  checkDateOptionValidator,
  checkPaperSizeValidator,
  checkPositionValidator,
  checkStatusValidator,
  checkTemplateLayoutValidator
} from "./validators";
import {
  canAdministerChecks,
  canFinalizeChecks,
  canManage,
  requireCheckAdmin,
  requireCheckManager,
  requireCheckStaff,
  requireUser,
  type Role
} from "./permissions";

type DbCtx = QueryCtx | MutationCtx;

type BankAccountSafe = Omit<Doc<"clientBankAccounts">, "routingNumberProtected" | "accountNumberProtected"> & {
  routingNumberMasked: string | null;
  accountNumberMasked: string | null;
  canViewSensitive: boolean;
};

const registerLimit = 500;
const maxBatchQuantity = 100;

export const listBankAccounts = query({
  args: {
    clientId: v.id("clients"),
    includeInactive: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    await assertClientVisible(ctx, args.clientId, session.userId, session.role);
    const rows = args.includeInactive
      ? await ctx.db
          .query("clientBankAccounts")
          .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
          .take(200)
      : await ctx.db
          .query("clientBankAccounts")
          .withIndex("by_client_id_and_status", (q) => q.eq("clientId", args.clientId).eq("status", "active"))
          .take(200);
    return rows.map((row) => maskBankAccount(row, canAdministerChecks(session.role)));
  }
});

export const getBankAccount = query({
  args: {
    bankAccountId: v.id("clientBankAccounts")
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    const bankAccount = await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
    return maskBankAccount(bankAccount, canAdministerChecks(session.role));
  }
});

export const revealBankData = mutation({
  args: {
    bankAccountId: v.id("clientBankAccounts"),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckAdmin(ctx);
    const bankAccount = await getRequiredBankAccount(ctx, args.bankAccountId);
    const reason = cleanRequired(args.reason, "Reason");
    await logAudit(ctx, {
      userId,
      action: "bankDataViewed",
      clientId: bankAccount.clientId,
      bankAccountId: bankAccount._id,
      entityType: "clientBankAccounts",
      entityId: bankAccount._id,
      reason
    });
    return {
      routingNumber: bankAccount.routingNumberProtected ?? "",
      accountNumber: bankAccount.accountNumberProtected ?? ""
    };
  }
});

export const createBankAccount = mutation({
  args: {
    clientId: v.id("clients"),
    bankName: v.string(),
    accountNickname: v.string(),
    printBusinessName: v.string(),
    printBusinessAddress: v.string(),
    startingCheckNumber: v.number(),
    routingNumber: v.optional(v.union(v.string(), v.null())),
    accountNumber: v.optional(v.union(v.string(), v.null())),
    micrEnabled: v.boolean(),
    signatureLineLabel: v.optional(v.union(v.string(), v.null())),
    logoUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageAuthorized: v.boolean(),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckAdmin(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client not found.");

    const startingCheckNumber = cleanCheckNumber(args.startingCheckNumber);
    const now = Date.now();
    const bankAccountId = await ctx.db.insert("clientBankAccounts", {
      clientId: args.clientId,
      bankName: cleanRequired(args.bankName, "Bank name"),
      accountNickname: cleanRequired(args.accountNickname, "Account nickname"),
      printBusinessName: cleanRequired(args.printBusinessName, "Business name to print"),
      printBusinessAddress: cleanRequired(args.printBusinessAddress, "Business address to print"),
      startingCheckNumber,
      nextCheckNumber: startingCheckNumber,
      lastPrintedCheckNumber: null,
      defaultTemplateId: null,
      routingNumberProtected: cleanOptional(args.routingNumber),
      routingNumberLast4: last4(args.routingNumber),
      accountNumberProtected: cleanOptional(args.accountNumber),
      accountNumberLast4: last4(args.accountNumber),
      micrEnabled: args.micrEnabled,
      signatureLineLabel: cleanOptional(args.signatureLineLabel),
      logoUrl: cleanOptional(args.logoUrl),
      signatureImageUrl: cleanOptional(args.signatureImageUrl),
      signatureImageAuthorized: args.signatureImageAuthorized,
      status: "active",
      notes: cleanOptional(args.notes),
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });

    const templateId = await insertDefaultTemplate(ctx, {
      clientId: args.clientId,
      bankAccountId,
      userId,
      now
    });
    await ctx.db.patch(bankAccountId, { defaultTemplateId: templateId, updatedAt: now });

    await logAudit(ctx, {
      userId,
      action: "bankAccountCreated",
      clientId: args.clientId,
      bankAccountId,
      entityType: "clientBankAccounts",
      entityId: bankAccountId,
      newValue: JSON.stringify({
        bankName: args.bankName,
        accountNickname: args.accountNickname,
        startingCheckNumber
      })
    });
    return bankAccountId;
  }
});

export const updateBankAccount = mutation({
  args: {
    bankAccountId: v.id("clientBankAccounts"),
    bankName: v.string(),
    accountNickname: v.string(),
    printBusinessName: v.string(),
    printBusinessAddress: v.string(),
    nextCheckNumber: v.number(),
    routingNumber: v.optional(v.union(v.string(), v.null())),
    accountNumber: v.optional(v.union(v.string(), v.null())),
    micrEnabled: v.boolean(),
    signatureLineLabel: v.optional(v.union(v.string(), v.null())),
    logoUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageUrl: v.optional(v.union(v.string(), v.null())),
    signatureImageAuthorized: v.boolean(),
    status: bankAccountStatusValidator,
    notes: v.optional(v.union(v.string(), v.null())),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckAdmin(ctx);
    const bankAccount = await getRequiredBankAccount(ctx, args.bankAccountId);
    const nextCheckNumber = cleanCheckNumber(args.nextCheckNumber);
    const reason = cleanRequired(args.reason, "Reason");
    const now = Date.now();

    await ctx.db.patch(args.bankAccountId, {
      bankName: cleanRequired(args.bankName, "Bank name"),
      accountNickname: cleanRequired(args.accountNickname, "Account nickname"),
      printBusinessName: cleanRequired(args.printBusinessName, "Business name to print"),
      printBusinessAddress: cleanRequired(args.printBusinessAddress, "Business address to print"),
      nextCheckNumber,
      routingNumberProtected: cleanOptional(args.routingNumber),
      routingNumberLast4: last4(args.routingNumber),
      accountNumberProtected: cleanOptional(args.accountNumber),
      accountNumberLast4: last4(args.accountNumber),
      micrEnabled: args.micrEnabled,
      signatureLineLabel: cleanOptional(args.signatureLineLabel),
      logoUrl: cleanOptional(args.logoUrl),
      signatureImageUrl: cleanOptional(args.signatureImageUrl),
      signatureImageAuthorized: args.signatureImageAuthorized,
      status: args.status,
      notes: cleanOptional(args.notes),
      updatedAt: now
    });

    if (bankAccount.nextCheckNumber !== nextCheckNumber) {
      await logSequenceEvent(ctx, {
        userId,
        clientId: bankAccount.clientId,
        bankAccountId: bankAccount._id,
        action: "sequenceChanged",
        oldNextCheckNumber: bankAccount.nextCheckNumber,
        newNextCheckNumber: nextCheckNumber,
        reason
      });
    }
    await logAudit(ctx, {
      userId,
      action: "bankAccountEdited",
      clientId: bankAccount.clientId,
      bankAccountId: bankAccount._id,
      entityType: "clientBankAccounts",
      entityId: bankAccount._id,
      oldValue: JSON.stringify({
        bankName: bankAccount.bankName,
        accountNickname: bankAccount.accountNickname,
        nextCheckNumber: bankAccount.nextCheckNumber,
        micrEnabled: bankAccount.micrEnabled,
        status: bankAccount.status
      }),
      newValue: JSON.stringify({
        bankName: args.bankName,
        accountNickname: args.accountNickname,
        nextCheckNumber,
        micrEnabled: args.micrEnabled,
        status: args.status
      }),
      reason
    });
    return null;
  }
});

export const listTemplates = query({
  args: {
    clientId: v.optional(v.id("clients")),
    bankAccountId: v.optional(v.id("clientBankAccounts")),
    includeInactive: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    if (args.bankAccountId) {
      const bankAccount = await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
      const rows = args.includeInactive
        ? await ctx.db
            .query("checkTemplates")
            .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", args.bankAccountId))
            .take(200)
        : await ctx.db
            .query("checkTemplates")
            .withIndex("by_bank_account_id_and_is_active", (q) =>
              q.eq("bankAccountId", args.bankAccountId).eq("isActive", true)
            )
            .take(200);
      return rows.filter((row) => row.clientId === bankAccount.clientId || row.clientId === null);
    }
    if (args.clientId) {
      await assertClientVisible(ctx, args.clientId, session.userId, session.role);
      return await ctx.db
        .query("checkTemplates")
        .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
        .take(200);
    }
    return await ctx.db.query("checkTemplates").take(200);
  }
});

export const createTemplate = mutation({
  args: {
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    bankAccountId: v.optional(v.union(v.id("clientBankAccounts"), v.null())),
    name: v.string(),
    paperSize: checkPaperSizeValidator,
    customWidthIn: v.optional(v.union(v.number(), v.null())),
    customHeightIn: v.optional(v.union(v.number(), v.null())),
    checkPosition: checkPositionValidator,
    checksPerPage: v.number(),
    marginTop: v.number(),
    marginRight: v.number(),
    marginBottom: v.number(),
    marginLeft: v.number(),
    fontSize: v.number(),
    alignmentOffsetX: v.number(),
    alignmentOffsetY: v.number(),
    layout: checkTemplateLayoutValidator,
    isDefault: v.boolean()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckManager(ctx);
    const now = Date.now();
    if (args.bankAccountId) {
      await getRequiredBankAccount(ctx, args.bankAccountId);
    }
    const templateId = await ctx.db.insert("checkTemplates", {
      clientId: args.clientId ?? null,
      bankAccountId: args.bankAccountId ?? null,
      name: cleanRequired(args.name, "Template name"),
      paperSize: args.paperSize,
      customWidthIn: args.paperSize === "Custom" ? cleanPositiveNumber(args.customWidthIn, "Custom width") : null,
      customHeightIn: args.paperSize === "Custom" ? cleanPositiveNumber(args.customHeightIn, "Custom height") : null,
      checkPosition: args.checkPosition,
      checksPerPage: cleanTemplateChecksPerPage(args.checksPerPage),
      marginTop: cleanNonNegative(args.marginTop, "Top margin"),
      marginRight: cleanNonNegative(args.marginRight, "Right margin"),
      marginBottom: cleanNonNegative(args.marginBottom, "Bottom margin"),
      marginLeft: cleanNonNegative(args.marginLeft, "Left margin"),
      fontSize: cleanPositiveNumber(args.fontSize, "Font size"),
      alignmentOffsetX: args.alignmentOffsetX,
      alignmentOffsetY: args.alignmentOffsetY,
      layout: args.layout,
      isDefault: args.isDefault,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });
    if (args.isDefault && args.bankAccountId) {
      await ctx.db.patch(args.bankAccountId, { defaultTemplateId: templateId, updatedAt: now });
    }
    await logAudit(ctx, {
      userId,
      action: "templateCreated",
      clientId: args.clientId ?? null,
      bankAccountId: args.bankAccountId ?? null,
      entityType: "checkTemplates",
      entityId: templateId,
      newValue: args.name
    });
    return templateId;
  }
});

export const updateTemplate = mutation({
  args: {
    templateId: v.id("checkTemplates"),
    name: v.string(),
    paperSize: checkPaperSizeValidator,
    customWidthIn: v.optional(v.union(v.number(), v.null())),
    customHeightIn: v.optional(v.union(v.number(), v.null())),
    checkPosition: checkPositionValidator,
    checksPerPage: v.number(),
    marginTop: v.number(),
    marginRight: v.number(),
    marginBottom: v.number(),
    marginLeft: v.number(),
    fontSize: v.number(),
    alignmentOffsetX: v.number(),
    alignmentOffsetY: v.number(),
    layout: checkTemplateLayoutValidator,
    isDefault: v.boolean(),
    isActive: v.boolean()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckManager(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found.");
    const now = Date.now();
    await ctx.db.patch(args.templateId, {
      name: cleanRequired(args.name, "Template name"),
      paperSize: args.paperSize,
      customWidthIn: args.paperSize === "Custom" ? cleanPositiveNumber(args.customWidthIn, "Custom width") : null,
      customHeightIn: args.paperSize === "Custom" ? cleanPositiveNumber(args.customHeightIn, "Custom height") : null,
      checkPosition: args.checkPosition,
      checksPerPage: cleanTemplateChecksPerPage(args.checksPerPage),
      marginTop: cleanNonNegative(args.marginTop, "Top margin"),
      marginRight: cleanNonNegative(args.marginRight, "Right margin"),
      marginBottom: cleanNonNegative(args.marginBottom, "Bottom margin"),
      marginLeft: cleanNonNegative(args.marginLeft, "Left margin"),
      fontSize: cleanPositiveNumber(args.fontSize, "Font size"),
      alignmentOffsetX: args.alignmentOffsetX,
      alignmentOffsetY: args.alignmentOffsetY,
      layout: args.layout,
      isDefault: args.isDefault,
      isActive: args.isActive,
      updatedAt: now
    });
    if (args.isDefault && template.bankAccountId) {
      await ctx.db.patch(template.bankAccountId, { defaultTemplateId: args.templateId, updatedAt: now });
    }
    await logAudit(ctx, {
      userId,
      action: "templateEdited",
      clientId: template.clientId ?? null,
      bankAccountId: template.bankAccountId ?? null,
      entityType: "checkTemplates",
      entityId: args.templateId,
      oldValue: template.name,
      newValue: args.name
    });
    return null;
  }
});

export const reserveBlankCheckBatch = mutation({
  args: {
    clientId: v.id("clients"),
    bankAccountId: v.id("clientBankAccounts"),
    templateId: v.id("checkTemplates"),
    startingCheckNumber: v.number(),
    quantity: v.number(),
    dateOption: checkDateOptionValidator,
    checkDate: v.optional(v.union(v.string(), v.null())),
    paperStockType: v.string(),
    memoText: v.optional(v.union(v.string(), v.null())),
    signatureImageEnabled: v.boolean(),
    alignmentOffsetX: v.number(),
    alignmentOffsetY: v.number(),
    gapReason: v.optional(v.union(v.string(), v.null())),
    overrideReason: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const session = await requireCheckStaff(ctx);
    const client = await assertClientVisible(ctx, args.clientId, session.userId, session.role);
    const bankAccount = await getRequiredBankAccount(ctx, args.bankAccountId);
    if (bankAccount.clientId !== args.clientId) throw new Error("Bank account does not belong to the selected client.");
    if (bankAccount.status !== "active") throw new Error("Bank account is inactive.");
    const template = await ctx.db.get(args.templateId);
    if (!template || template.isActive === false) throw new Error("Template not found or inactive.");
    if (template.bankAccountId && template.bankAccountId !== bankAccount._id) {
      throw new Error("Template does not belong to the selected bank account.");
    }
    if (args.signatureImageEnabled && !bankAccount.signatureImageAuthorized) {
      throw new Error("Signature image printing is not authorized for this bank account.");
    }

    const quantity = cleanQuantity(args.quantity);
    const startingCheckNumber = cleanCheckNumber(args.startingCheckNumber);
    const endingCheckNumber = startingCheckNumber + quantity - 1;
    validateDateOption(args.dateOption, args.checkDate);
    await validateStartingNumber(ctx, bankAccount, startingCheckNumber, endingCheckNumber, session.role, {
      gapReason: args.gapReason,
      overrideReason: args.overrideReason
    });

    const now = Date.now();
    const batchId = await ctx.db.insert("checkBatches", {
      clientId: client._id,
      bankAccountId: bankAccount._id,
      templateId: template._id,
      startingCheckNumber,
      endingCheckNumber,
      quantity,
      dateOption: args.dateOption,
      checkDate: args.dateOption === "custom" ? cleanOptional(args.checkDate) : args.dateOption === "today" ? todayIso() : null,
      paperStockType: cleanRequired(args.paperStockType, "Paper/check stock type"),
      memoText: cleanOptional(args.memoText),
      signatureImageEnabled: args.signatureImageEnabled,
      alignmentOffsetX: args.alignmentOffsetX,
      alignmentOffsetY: args.alignmentOffsetY,
      status: "reserved",
      gapReason: cleanOptional(args.gapReason),
      notes: cleanOptional(args.notes),
      createdBy: session.userId,
      printedBy: null,
      createdAt: now,
      printedAt: null,
      updatedAt: now
    });

    const checkIds: Id<"checks">[] = [];
    for (let checkNumber = startingCheckNumber; checkNumber <= endingCheckNumber; checkNumber += 1) {
      await assertCheckNumberAvailable(ctx, bankAccount._id, checkNumber);
      checkIds.push(
        await ctx.db.insert("checks", {
          clientId: client._id,
          bankAccountId: bankAccount._id,
          batchId,
          checkNumber,
          status: "reserved",
          printDate: null,
          createdBy: session.userId,
          printedBy: null,
          spoiledVoidReason: null,
          reprintCount: 0,
          notes: null,
          createdAt: now,
          updatedAt: now
        })
      );
    }

    if (startingCheckNumber > bankAccount.nextCheckNumber) {
      await logSequenceEvent(ctx, {
        userId: session.userId,
        clientId: client._id,
        bankAccountId: bankAccount._id,
        batchId,
        action: "skippedGap",
        rangeStart: bankAccount.nextCheckNumber,
        rangeEnd: startingCheckNumber - 1,
        oldNextCheckNumber: bankAccount.nextCheckNumber,
        newNextCheckNumber: startingCheckNumber,
        reason: cleanOptional(args.gapReason)
      });
    }

    await logSequenceEvent(ctx, {
      userId: session.userId,
      clientId: client._id,
      bankAccountId: bankAccount._id,
      batchId,
      action: "reserved",
      rangeStart: startingCheckNumber,
      rangeEnd: endingCheckNumber,
      oldNextCheckNumber: bankAccount.nextCheckNumber,
      newNextCheckNumber: bankAccount.nextCheckNumber,
      reason: args.overrideReason ?? args.gapReason ?? null
    });
    await logAudit(ctx, {
      userId: session.userId,
      action: "blankCheckBatchCreated",
      clientId: client._id,
      bankAccountId: bankAccount._id,
      checkRangeStart: startingCheckNumber,
      checkRangeEnd: endingCheckNumber,
      entityType: "checkBatches",
      entityId: batchId,
      newValue: JSON.stringify({
        quantity,
        template: template.name,
        client: client.clientName,
        bankAccount: bankAccount.accountNickname
      }),
      reason: args.overrideReason ?? args.gapReason ?? null
    });
    await logAudit(ctx, {
      userId: session.userId,
      action: "printPreviewGenerated",
      clientId: client._id,
      bankAccountId: bankAccount._id,
      checkRangeStart: startingCheckNumber,
      checkRangeEnd: endingCheckNumber,
      entityType: "checkBatches",
      entityId: batchId
    });

    return { batchId, checkIds };
  }
});

export const getBatchPreview = query({
  args: {
    batchId: v.id("checkBatches")
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    const batch = await getRequiredBatch(ctx, args.batchId);
    const client = await assertClientVisible(ctx, batch.clientId, session.userId, session.role);
    const bankAccount = await getRequiredBankAccount(ctx, batch.bankAccountId);
    const template = await ctx.db.get(batch.templateId);
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_batch_id", (q) => q.eq("batchId", batch._id))
      .take(maxBatchQuantity);
    return {
      batch,
      client,
      bankAccount: maskBankAccount(bankAccount, canAdministerChecks(session.role)),
      template,
      checks: checks.sort((a, b) => a.checkNumber - b.checkNumber),
      canFinalize: canFinalizeChecks(session.role)
    };
  }
});

export const confirmBatchAllPrinted = mutation({
  args: {
    batchId: v.id("checkBatches"),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckManager(ctx);
    const batch = await getReservedBatch(ctx, args.batchId);
    const bankAccount = await getRequiredBankAccount(ctx, batch.bankAccountId);
    const checks = await getBatchChecks(ctx, batch._id);
    if (checks.length !== batch.quantity) {
      throw new Error("Batch reservation is incomplete.");
    }

    const now = Date.now();
    for (const check of checks) {
      await ctx.db.patch(check._id, {
        status: "printed",
        printDate: now,
        printedBy: userId,
        updatedAt: now
      });
    }
    await ctx.db.patch(batch._id, {
      status: "printed",
      printedBy: userId,
      printedAt: now,
      notes: cleanOptional(args.notes) ?? batch.notes ?? null,
      updatedAt: now
    });

    const newNextCheckNumber = await findNextAvailableCheckNumber(ctx, bankAccount, bankAccount.startingCheckNumber);
    await ctx.db.patch(bankAccount._id, {
      nextCheckNumber: newNextCheckNumber,
      lastPrintedCheckNumber: Math.max(bankAccount.lastPrintedCheckNumber ?? 0, batch.endingCheckNumber),
      updatedAt: now
    });
    await logSequenceEvent(ctx, {
      userId,
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      batchId: batch._id,
      action: "printed",
      rangeStart: batch.startingCheckNumber,
      rangeEnd: batch.endingCheckNumber,
      oldNextCheckNumber: bankAccount.nextCheckNumber,
      newNextCheckNumber
    });
    await logAudit(ctx, {
      userId,
      action: "checksPrinted",
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      checkRangeStart: batch.startingCheckNumber,
      checkRangeEnd: batch.endingCheckNumber,
      entityType: "checkBatches",
      entityId: batch._id
    });
    return { printed: checks.length, nextCheckNumber: newNextCheckNumber };
  }
});

export const resolveBatchAfterPrint = mutation({
  args: {
    batchId: v.id("checkBatches"),
    outcomes: v.array(
      v.object({
        checkNumber: v.number(),
        outcome: v.union(v.literal("printed"), v.literal("spoiled"), v.literal("notPrinted")),
        reason: v.optional(v.union(v.string(), v.null()))
      })
    ),
    notes: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckManager(ctx);
    const batch = await getReservedBatch(ctx, args.batchId);
    const bankAccount = await getRequiredBankAccount(ctx, batch.bankAccountId);
    const checks = await getBatchChecks(ctx, batch._id);
    const byNumber = new Map(checks.map((check) => [check.checkNumber, check]));
    const outcomeNumbers = new Set(args.outcomes.map((outcome) => cleanCheckNumber(outcome.checkNumber)));
    if (outcomeNumbers.size !== batch.quantity || args.outcomes.length !== batch.quantity) {
      throw new Error("Mark every check number in the batch exactly once.");
    }

    const now = Date.now();
    let printed = 0;
    let spoiled = 0;
    let notPrinted = 0;
    let highestPrinted = bankAccount.lastPrintedCheckNumber ?? 0;

    for (const outcome of args.outcomes) {
      const checkNumber = cleanCheckNumber(outcome.checkNumber);
      const check = byNumber.get(checkNumber);
      if (!check) throw new Error(`Check ${checkNumber} is not in this batch.`);
      if (outcome.outcome === "printed") {
        printed += 1;
        highestPrinted = Math.max(highestPrinted, checkNumber);
        await ctx.db.patch(check._id, {
          status: "printed",
          printDate: now,
          printedBy: userId,
          updatedAt: now
        });
      } else if (outcome.outcome === "spoiled") {
        const reason = cleanRequired(outcome.reason, `Spoiled reason for check ${checkNumber}`);
        spoiled += 1;
        await ctx.db.patch(check._id, {
          status: "spoiled",
          printDate: now,
          printedBy: userId,
          spoiledVoidReason: reason,
          updatedAt: now
        });
        await logSequenceEvent(ctx, {
          userId,
          clientId: batch.clientId,
          bankAccountId: batch.bankAccountId,
          batchId: batch._id,
          checkId: check._id,
          checkNumber,
          action: "spoiled",
          reason
        });
      } else {
        notPrinted += 1;
        await ctx.db.delete(check._id);
      }
    }

    const newNextCheckNumber = await findNextAvailableCheckNumber(ctx, bankAccount, bankAccount.startingCheckNumber);
    await ctx.db.patch(bankAccount._id, {
      nextCheckNumber: newNextCheckNumber,
      lastPrintedCheckNumber: highestPrinted > 0 ? highestPrinted : bankAccount.lastPrintedCheckNumber ?? null,
      updatedAt: now
    });
    await ctx.db.patch(batch._id, {
      status: spoiled > 0 || notPrinted > 0 ? "partiallyCompleted" : "printed",
      printedBy: userId,
      printedAt: now,
      notes: cleanOptional(args.notes) ?? batch.notes ?? null,
      updatedAt: now
    });
    await logSequenceEvent(ctx, {
      userId,
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      batchId: batch._id,
      action: printed > 0 || spoiled > 0 ? "printed" : "cancelled",
      rangeStart: batch.startingCheckNumber,
      rangeEnd: batch.endingCheckNumber,
      oldNextCheckNumber: bankAccount.nextCheckNumber,
      newNextCheckNumber,
      reason: cleanOptional(args.notes)
    });
    await logAudit(ctx, {
      userId,
      action: "printOutcomeRecorded",
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      checkRangeStart: batch.startingCheckNumber,
      checkRangeEnd: batch.endingCheckNumber,
      entityType: "checkBatches",
      entityId: batch._id,
      newValue: JSON.stringify({ printed, spoiled, notPrinted }),
      reason: cleanOptional(args.notes)
    });
    return { printed, spoiled, notPrinted, nextCheckNumber: newNextCheckNumber };
  }
});

export const cancelBatch = mutation({
  args: {
    batchId: v.id("checkBatches"),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    const session = await requireCheckStaff(ctx);
    const batch = await getReservedBatch(ctx, args.batchId);
    if (batch.createdBy !== session.userId && !canFinalizeChecks(session.role)) {
      throw new Error("Only the batch creator or a manager can cancel this batch.");
    }
    const reason = cleanRequired(args.reason, "Cancellation reason");
    const checks = await getBatchChecks(ctx, batch._id);
    for (const check of checks) {
      if (check.status !== "reserved") throw new Error("Only fully reserved batches can be cancelled.");
      await ctx.db.delete(check._id);
    }
    const now = Date.now();
    await ctx.db.patch(batch._id, {
      status: "cancelled",
      notes: reason,
      updatedAt: now
    });
    const bankAccount = await getRequiredBankAccount(ctx, batch.bankAccountId);
    await logSequenceEvent(ctx, {
      userId: session.userId,
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      batchId: batch._id,
      action: "cancelled",
      rangeStart: batch.startingCheckNumber,
      rangeEnd: batch.endingCheckNumber,
      oldNextCheckNumber: bankAccount.nextCheckNumber,
      newNextCheckNumber: bankAccount.nextCheckNumber,
      reason
    });
    await logAudit(ctx, {
      userId: session.userId,
      action: "blankCheckBatchCancelled",
      clientId: batch.clientId,
      bankAccountId: batch.bankAccountId,
      checkRangeStart: batch.startingCheckNumber,
      checkRangeEnd: batch.endingCheckNumber,
      entityType: "checkBatches",
      entityId: batch._id,
      reason
    });
    return { cancelled: checks.length };
  }
});

export const voidCheck = mutation({
  args: {
    checkId: v.id("checks"),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckManager(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!check) throw new Error("Check not found.");
    if (check.status === "reserved") throw new Error("Cancel the batch instead of voiding a reserved check.");
    const reason = cleanRequired(args.reason, "Void reason");
    const now = Date.now();
    await ctx.db.patch(check._id, {
      status: "voided",
      spoiledVoidReason: reason,
      updatedAt: now
    });
    await logSequenceEvent(ctx, {
      userId,
      clientId: check.clientId,
      bankAccountId: check.bankAccountId,
      batchId: check.batchId ?? null,
      checkId: check._id,
      checkNumber: check.checkNumber,
      action: "voided",
      reason
    });
    await logAudit(ctx, {
      userId,
      action: "checkVoided",
      clientId: check.clientId,
      bankAccountId: check.bankAccountId,
      checkNumber: check.checkNumber,
      entityType: "checks",
      entityId: check._id,
      reason
    });
    return null;
  }
});

export const reprintCheck = mutation({
  args: {
    checkId: v.id("checks"),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCheckAdmin(ctx);
    const check = await ctx.db.get(args.checkId);
    if (!check) throw new Error("Check not found.");
    if (check.status !== "printed" && check.status !== "reprinted") {
      throw new Error("Only printed checks can be reprinted.");
    }
    const reason = cleanRequired(args.reason, "Reprint reason");
    const now = Date.now();
    await ctx.db.patch(check._id, {
      status: "reprinted",
      reprintCount: check.reprintCount + 1,
      printedBy: userId,
      printDate: now,
      updatedAt: now
    });
    await logSequenceEvent(ctx, {
      userId,
      clientId: check.clientId,
      bankAccountId: check.bankAccountId,
      batchId: check.batchId ?? null,
      checkId: check._id,
      checkNumber: check.checkNumber,
      action: "reprinted",
      reason
    });
    await logAudit(ctx, {
      userId,
      action: "checkReprinted",
      clientId: check.clientId,
      bankAccountId: check.bankAccountId,
      checkNumber: check.checkNumber,
      entityType: "checks",
      entityId: check._id,
      reason
    });
    return null;
  }
});

export const listRegister = query({
  args: {
    clientId: v.optional(v.id("clients")),
    bankAccountId: v.optional(v.id("clientBankAccounts")),
    status: v.optional(checkStatusValidator),
    checkNumberFrom: v.optional(v.number()),
    checkNumberTo: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    let rows: Doc<"checks">[];
    if (args.bankAccountId) {
      const bankAccount = await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
      rows = await ctx.db
        .query("checks")
        .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", bankAccount._id))
        .take(registerLimit);
    } else if (args.clientId) {
      const clientId = args.clientId;
      await assertClientVisible(ctx, clientId, session.userId, session.role);
      rows = await ctx.db
        .query("checks")
        .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
        .take(registerLimit);
    } else {
      if (!canManage(session.role) && session.role !== "viewer") {
        throw new Error("Choose a client to view the register.");
      }
      rows = args.status
        ? await ctx.db.query("checks").withIndex("by_status", (q) => q.eq("status", args.status!)).take(registerLimit)
        : await ctx.db.query("checks").take(registerLimit);
    }
    const clients = await loadClientsById(ctx, rows.map((row) => row.clientId));
    const accounts = await loadBankAccountsById(ctx, rows.map((row) => row.bankAccountId), canAdministerChecks(session.role));
    return rows
      .filter((row) => (args.status ? row.status === args.status : true))
      .filter((row) => (args.checkNumberFrom ? row.checkNumber >= args.checkNumberFrom : true))
      .filter((row) => (args.checkNumberTo ? row.checkNumber <= args.checkNumberTo : true))
      .sort((a, b) => b.checkNumber - a.checkNumber)
      .map((row) => ({
        ...row,
        client: clients.get(row.clientId) ?? null,
        bankAccount: accounts.get(row.bankAccountId) ?? null
      }));
  }
});

export const listBatches = query({
  args: {
    clientId: v.optional(v.id("clients")),
    bankAccountId: v.optional(v.id("clientBankAccounts"))
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    let rows: Doc<"checkBatches">[];
    if (args.bankAccountId) {
      const bankAccount = await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
      rows = await ctx.db
        .query("checkBatches")
        .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", bankAccount._id))
        .take(200);
    } else if (args.clientId) {
      const clientId = args.clientId;
      await assertClientVisible(ctx, clientId, session.userId, session.role);
      rows = await ctx.db
        .query("checkBatches")
        .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
        .take(200);
    } else {
      if (!canManage(session.role) && session.role !== "viewer") {
        throw new Error("Choose a client to view batch history.");
      }
      rows = await ctx.db.query("checkBatches").withIndex("by_created_at").order("desc").take(200);
    }
    const clients = await loadClientsById(ctx, rows.map((row) => row.clientId));
    const accounts = await loadBankAccountsById(ctx, rows.map((row) => row.bankAccountId), canAdministerChecks(session.role));
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        ...row,
        client: clients.get(row.clientId) ?? null,
        bankAccount: accounts.get(row.bankAccountId) ?? null
      }));
  }
});

export const listAuditLogs = query({
  args: {
    clientId: v.optional(v.id("clients")),
    bankAccountId: v.optional(v.id("clientBankAccounts")),
    action: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    if (args.clientId) {
      await assertClientVisible(ctx, args.clientId, session.userId, session.role);
    }
    if (args.bankAccountId) {
      await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
    }
    let rows: Doc<"auditLogs">[];
    if (args.bankAccountId) {
      rows = await ctx.db
        .query("auditLogs")
        .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", args.bankAccountId))
        .take(300);
    } else if (args.clientId) {
      rows = await ctx.db.query("auditLogs").withIndex("by_client_id", (q) => q.eq("clientId", args.clientId)).take(300);
    } else if (args.action) {
      rows = await ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", args.action!)).take(300);
    } else {
      rows = await ctx.db.query("auditLogs").withIndex("by_created_at").order("desc").take(300);
    }
    return rows
      .filter((row) => (args.action ? row.action === args.action : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
});

export const sequenceGapReport = query({
  args: {
    clientId: v.optional(v.id("clients")),
    bankAccountId: v.optional(v.id("clientBankAccounts"))
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    if (args.clientId) {
      await assertClientVisible(ctx, args.clientId, session.userId, session.role);
    }
    if (args.bankAccountId) {
      await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
    }
    const rows = args.bankAccountId
      ? await ctx.db
          .query("checkSequenceEvents")
          .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", args.bankAccountId!))
          .take(300)
      : await ctx.db
          .query("checkSequenceEvents")
          .withIndex("by_action", (q) => q.eq("action", "skippedGap"))
          .take(300);
    const gaps = rows.filter((row) => row.action === "skippedGap");
    const clients = await loadClientsById(ctx, gaps.map((row) => row.clientId));
    const accounts = await loadBankAccountsById(ctx, gaps.map((row) => row.bankAccountId), canAdministerChecks(session.role));
    return gaps.map((gap) => ({
      ...gap,
      client: clients.get(gap.clientId) ?? null,
      bankAccount: accounts.get(gap.bankAccountId) ?? null,
      missingCheckNumber:
        gap.rangeStart === gap.rangeEnd
          ? String(gap.rangeStart ?? "")
          : `${gap.rangeStart ?? ""}-${gap.rangeEnd ?? ""}`,
      gapKind: "skipped"
    }));
  }
});

export const testPrintPreview = query({
  args: {
    clientId: v.id("clients"),
    bankAccountId: v.id("clientBankAccounts"),
    templateId: v.id("checkTemplates"),
    sampleCheckNumber: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx);
    const client = await assertClientVisible(ctx, args.clientId, session.userId, session.role);
    const bankAccount = await getBankAccountForAccess(ctx, args.bankAccountId, session.userId, session.role);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found.");
    return {
      client,
      bankAccount: maskBankAccount(bankAccount, canAdministerChecks(session.role)),
      template,
      checkNumber: args.sampleCheckNumber ?? bankAccount.nextCheckNumber,
      isTestPrint: true
    };
  }
});

async function assertClientVisible(ctx: DbCtx, clientId: Id<"clients">, userId: Id<"users">, role: Role) {
  const client = await ctx.db.get(clientId);
  if (!client) throw new Error("Client not found.");
  if (!canManage(role) && role !== "viewer" && client.assignedTeamMemberId !== userId) {
    throw new Error("You can only access clients assigned to you.");
  }
  return client;
}

async function getRequiredBankAccount(ctx: DbCtx, bankAccountId: Id<"clientBankAccounts">) {
  const bankAccount = await ctx.db.get(bankAccountId);
  if (!bankAccount) throw new Error("Bank account not found.");
  return bankAccount;
}

async function getBankAccountForAccess(
  ctx: DbCtx,
  bankAccountId: Id<"clientBankAccounts">,
  userId: Id<"users">,
  role: Role
) {
  const bankAccount = await getRequiredBankAccount(ctx, bankAccountId);
  await assertClientVisible(ctx, bankAccount.clientId, userId, role);
  return bankAccount;
}

async function getRequiredBatch(ctx: DbCtx, batchId: Id<"checkBatches">) {
  const batch = await ctx.db.get(batchId);
  if (!batch) throw new Error("Batch not found.");
  return batch;
}

async function getReservedBatch(ctx: DbCtx, batchId: Id<"checkBatches">) {
  const batch = await getRequiredBatch(ctx, batchId);
  if (batch.status !== "reserved") {
    throw new Error("Only reserved batches can be finalized or cancelled.");
  }
  return batch;
}

async function getBatchChecks(ctx: DbCtx, batchId: Id<"checkBatches">) {
  return (
    await ctx.db
      .query("checks")
      .withIndex("by_batch_id", (q) => q.eq("batchId", batchId))
      .take(maxBatchQuantity)
  ).sort((a, b) => a.checkNumber - b.checkNumber);
}

async function validateStartingNumber(
  ctx: DbCtx,
  bankAccount: Doc<"clientBankAccounts">,
  startingCheckNumber: number,
  endingCheckNumber: number,
  role: Role,
  reasons: { gapReason?: string | null; overrideReason?: string | null }
) {
  if (startingCheckNumber > bankAccount.nextCheckNumber && !cleanOptional(reasons.gapReason)) {
    throw new Error("Starting after the next available check number creates a gap. Enter a gap reason.");
  }
  if (startingCheckNumber < bankAccount.nextCheckNumber) {
    if (!canAdministerChecks(role)) {
      throw new Error("Starting before the next available check number requires Admin override.");
    }
    if (!cleanOptional(reasons.overrideReason)) {
      throw new Error("Admin override reason is required.");
    }
  }
  for (let checkNumber = startingCheckNumber; checkNumber <= endingCheckNumber; checkNumber += 1) {
    await assertCheckNumberAvailable(ctx, bankAccount._id, checkNumber);
  }
}

async function assertCheckNumberAvailable(ctx: DbCtx, bankAccountId: Id<"clientBankAccounts">, checkNumber: number) {
  const existing = await ctx.db
    .query("checks")
    .withIndex("by_bank_account_id_and_check_number", (q) =>
      q.eq("bankAccountId", bankAccountId).eq("checkNumber", checkNumber)
    )
    .first();
  if (existing) {
    throw new Error(`Check number ${checkNumber} is already ${statusLabel(existing.status)}.`);
  }
}

async function findNextAvailableCheckNumber(
  ctx: DbCtx,
  bankAccount: Doc<"clientBankAccounts">,
  floor: number
) {
  let candidate = Math.max(bankAccount.startingCheckNumber, floor);
  const limit = candidate + 10000;
  while (candidate <= limit) {
    const skippedUntil = await skippedGapEndFor(ctx, bankAccount._id, candidate);
    if (skippedUntil !== null) {
      candidate = skippedUntil + 1;
      continue;
    }
    const existing = await ctx.db
      .query("checks")
      .withIndex("by_bank_account_id_and_check_number", (q) =>
        q.eq("bankAccountId", bankAccount._id).eq("checkNumber", candidate)
      )
      .first();
    if (!existing) return candidate;
    candidate += 1;
  }
  throw new Error("Unable to find the next available check number.");
}

async function skippedGapEndFor(ctx: DbCtx, bankAccountId: Id<"clientBankAccounts">, checkNumber: number) {
  const gapEvents = await ctx.db
    .query("checkSequenceEvents")
    .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", bankAccountId))
    .take(500);
  const gap = gapEvents.find(
    (event) =>
      event.action === "skippedGap" &&
      event.rangeStart !== null &&
      event.rangeEnd !== null &&
      event.rangeStart !== undefined &&
      event.rangeEnd !== undefined &&
      event.rangeStart <= checkNumber &&
      event.rangeEnd >= checkNumber
  );
  return gap?.rangeEnd ?? null;
}

async function insertDefaultTemplate(
  ctx: MutationCtx,
  args: { clientId: Id<"clients">; bankAccountId: Id<"clientBankAccounts">; userId: Id<"users">; now: number }
) {
  return await ctx.db.insert("checkTemplates", {
    clientId: args.clientId,
    bankAccountId: args.bankAccountId,
    name: "Standard business check",
    paperSize: "Letter",
    customWidthIn: null,
    customHeightIn: null,
    checkPosition: "top",
    checksPerPage: 1,
    marginTop: 0.25,
    marginRight: 0.25,
    marginBottom: 0.25,
    marginLeft: 0.25,
    fontSize: 10,
    alignmentOffsetX: 0,
    alignmentOffsetY: 0,
    layout: defaultTemplateLayout(),
    isDefault: true,
    isActive: true,
    createdBy: args.userId,
    createdAt: args.now,
    updatedAt: args.now
  });
}

function defaultTemplateLayout() {
  return {
    businessName: { x: 0.55, y: 0.38, width: 2.8, height: 0.22 },
    businessAddress: { x: 0.55, y: 0.68, width: 3.2, height: 0.35 },
    bankName: { x: 3.55, y: 0.45, width: 2.1, height: 0.24 },
    checkNumber: { x: 6.8, y: 0.34, width: 1.0, height: 0.22 },
    date: { x: 6.25, y: 0.86, width: 1.4, height: 0.22 },
    payeeLine: { x: 0.8, y: 1.55, width: 4.8, height: 0.2 },
    amountBox: { x: 6.05, y: 1.45, width: 1.45, height: 0.35 },
    amountWordsLine: { x: 0.55, y: 2.02, width: 6.2, height: 0.2 },
    memoLine: { x: 0.55, y: 2.75, width: 2.3, height: 0.2 },
    signatureLine: { x: 5.05, y: 2.7, width: 2.2, height: 0.2 },
    micrLine: { x: 1.4, y: 3.2, width: 5.2, height: 0.24 },
    logo: { x: 0.25, y: 0.35, width: 0.24, height: 0.24 }
  };
}

async function loadClientsById(ctx: DbCtx, ids: Id<"clients">[]) {
  const map = new Map<Id<"clients">, Doc<"clients">>();
  for (const id of uniqueIds(ids)) {
    const doc = await ctx.db.get(id);
    if (doc) map.set(id, doc);
  }
  return map;
}

async function loadBankAccountsById(ctx: DbCtx, ids: Id<"clientBankAccounts">[], revealSensitive: boolean) {
  const map = new Map<Id<"clientBankAccounts">, BankAccountSafe>();
  for (const id of uniqueIds(ids)) {
    const doc = await ctx.db.get(id);
    if (doc) map.set(id, maskBankAccount(doc, revealSensitive));
  }
  return map;
}

function uniqueIds<T extends string>(ids: T[]) {
  return [...new Set(ids)];
}

function maskBankAccount(row: Doc<"clientBankAccounts">, canViewSensitive: boolean): BankAccountSafe {
  const { routingNumberProtected, accountNumberProtected, ...safe } = row;
  return {
    ...safe,
    routingNumberMasked: canViewSensitive ? routingNumberProtected ?? null : masked(row.routingNumberLast4),
    accountNumberMasked: canViewSensitive ? accountNumberProtected ?? null : masked(row.accountNumberLast4),
    canViewSensitive
  };
}

function masked(lastFour: string | null | undefined) {
  return lastFour ? `****${lastFour}` : null;
}

function cleanRequired(value: string | null | undefined, label: string) {
  const clean = value?.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function cleanCheckNumber(value: number) {
  if (!Number.isInteger(value) || value <= 0) throw new Error("Check number must be a positive whole number.");
  return value;
}

function cleanQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0 || value > maxBatchQuantity) {
    throw new Error(`Quantity must be between 1 and ${maxBatchQuantity}.`);
  }
  return value;
}

function cleanPositiveNumber(value: number | null | undefined, label: string) {
  if (typeof value !== "number" || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function cleanNonNegative(value: number, label: string) {
  if (value < 0) throw new Error(`${label} cannot be negative.`);
  return value;
}

function cleanTemplateChecksPerPage(value: number) {
  if (![1, 2, 3].includes(value)) throw new Error("Checks per page must be 1, 2, or 3.");
  return value;
}

function validateDateOption(option: "blank" | "today" | "custom", checkDate?: string | null) {
  if (option === "custom" && !cleanOptional(checkDate)) {
    throw new Error("Custom date is required.");
  }
}

function last4(value: string | null | undefined) {
  const clean = value?.replace(/\D/g, "") ?? "";
  return clean ? clean.slice(-4) : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: Doc<"checks">["status"]) {
  if (status === "reserved") return "reserved";
  if (status === "printed") return "printed";
  if (status === "spoiled") return "spoiled";
  if (status === "voided") return "voided";
  if (status === "reprinted") return "reprinted";
  if (status === "cancelled") return "cancelled";
  return "draft";
}

async function logSequenceEvent(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    clientId: Id<"clients">;
    bankAccountId: Id<"clientBankAccounts">;
    batchId?: Id<"checkBatches"> | null;
    checkId?: Id<"checks"> | null;
    checkNumber?: number | null;
    rangeStart?: number | null;
    rangeEnd?: number | null;
    action: Doc<"checkSequenceEvents">["action"];
    oldNextCheckNumber?: number | null;
    newNextCheckNumber?: number | null;
    reason?: string | null;
  }
) {
  await ctx.db.insert("checkSequenceEvents", {
    clientId: args.clientId,
    bankAccountId: args.bankAccountId,
    batchId: args.batchId ?? null,
    checkId: args.checkId ?? null,
    checkNumber: args.checkNumber ?? null,
    rangeStart: args.rangeStart ?? null,
    rangeEnd: args.rangeEnd ?? null,
    action: args.action,
    oldNextCheckNumber: args.oldNextCheckNumber ?? null,
    newNextCheckNumber: args.newNextCheckNumber ?? null,
    reason: cleanOptional(args.reason),
    createdBy: args.userId,
    createdAt: Date.now()
  });
}

async function logAudit(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    action: string;
    clientId?: Id<"clients"> | null;
    bankAccountId?: Id<"clientBankAccounts"> | null;
    checkNumber?: number | null;
    checkRangeStart?: number | null;
    checkRangeEnd?: number | null;
    entityType?: string | null;
    entityId?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
    ipDevice?: string | null;
  }
) {
  await ctx.db.insert("auditLogs", {
    userId: args.userId,
    action: args.action,
    clientId: args.clientId ?? null,
    bankAccountId: args.bankAccountId ?? null,
    checkNumber: args.checkNumber ?? null,
    checkRangeStart: args.checkRangeStart ?? null,
    checkRangeEnd: args.checkRangeEnd ?? null,
    entityType: args.entityType ?? null,
    entityId: args.entityId ?? null,
    oldValue: args.oldValue ?? null,
    newValue: args.newValue ?? null,
    reason: cleanOptional(args.reason),
    ipDevice: args.ipDevice ?? null,
    createdAt: Date.now()
  });
}
