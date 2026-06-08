/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestHarness = ReturnType<typeof convexTest>;
type TestActor = Pick<TestHarness, "query" | "mutation">;

describe("blank check printing", () => {
  test("creates a client", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);

    const clientId = await asOwner.mutation(api.clients.create, clientPayload());
    const client = await asOwner.query(api.clients.get, { clientId });

    expect(client?.clientName).toBe("Acme Hardware");
    expect(client?.businessLegalName).toBe("Acme Hardware LLC");
  });

  test("creates a bank account with starting check number and a default template", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId } = await seedClientAndBank(asOwner);

    const accounts = await asOwner.query(api.checks.listBankAccounts, { clientId, includeInactive: true });
    const templates = await asOwner.query(api.checks.listTemplates, { bankAccountId, includeInactive: true });

    expect(accounts).toHaveLength(1);
    expect(accounts[0].startingCheckNumber).toBe(1001);
    expect(accounts[0].nextCheckNumber).toBe(1001);
    expect(templates[0].name).toBe("Standard business check");
  });

  test("prints a blank check batch, advances sequence, and prevents duplicates", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner);

    const { batchId } = await reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 1001, quantity: 3 });
    const result = await asOwner.mutation(api.checks.confirmBatchAllPrinted, { batchId });
    const account = await asOwner.query(api.checks.getBankAccount, { bankAccountId });
    const register = await asOwner.query(api.checks.listRegister, { bankAccountId });

    expect(result.nextCheckNumber).toBe(1004);
    expect(account.nextCheckNumber).toBe(1004);
    expect(account.lastPrintedCheckNumber).toBe(1003);
    expect(register.map((check) => check.checkNumber).sort()).toEqual([1001, 1002, 1003]);
    await expect(
      reserveBatch(asOwner, {
        clientId,
        bankAccountId,
        templateId,
        startingCheckNumber: 1002,
        quantity: 1,
        overrideReason: "Testing overlap"
      })
    ).rejects.toThrow(/already printed/);
  });

  test("cancels a print attempt without consuming check numbers", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner, 2001);

    const first = await reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 2001, quantity: 2 });
    await asOwner.mutation(api.checks.cancelBatch, { batchId: first.batchId, reason: "Printer was offline" });

    const account = await asOwner.query(api.checks.getBankAccount, { bankAccountId });
    const register = await asOwner.query(api.checks.listRegister, { bankAccountId });
    const second = await reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 2001, quantity: 2 });

    expect(account.nextCheckNumber).toBe(2001);
    expect(register).toHaveLength(0);
    expect(second.checkIds).toHaveLength(2);
  });

  test("records spoiled checks and returns truly unprinted checks to availability", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner, 3001);

    const { batchId } = await reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 3001, quantity: 3 });
    const result = await asOwner.mutation(api.checks.resolveBatchAfterPrint, {
      batchId,
      outcomes: [
        { checkNumber: 3001, outcome: "printed" },
        { checkNumber: 3002, outcome: "spoiled", reason: "Misaligned" },
        { checkNumber: 3003, outcome: "notPrinted" }
      ],
      notes: "Mixed outcome"
    });
    const account = await asOwner.query(api.checks.getBankAccount, { bankAccountId });
    const register = await asOwner.query(api.checks.listRegister, { bankAccountId });

    expect(result).toMatchObject({ printed: 1, spoiled: 1, notPrinted: 1, nextCheckNumber: 3003 });
    expect(account.nextCheckNumber).toBe(3003);
    expect(register.map((check) => [check.checkNumber, check.status]).sort()).toEqual([
      [3001, "printed"],
      [3002, "spoiled"]
    ]);
  });

  test("requires a reason for skipped check-number gaps and reports the gap", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner, 4001);

    await expect(
      reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 4005, quantity: 1 })
    ).rejects.toThrow(/gap reason/);

    const { batchId } = await reserveBatch(asOwner, {
      clientId,
      bankAccountId,
      templateId,
      startingCheckNumber: 4005,
      quantity: 1,
      gapReason: "Client confirmed checks 4001-4004 were never in stock"
    });
    await asOwner.mutation(api.checks.confirmBatchAllPrinted, { batchId });
    const gaps = await asOwner.query(api.checks.sequenceGapReport, { bankAccountId });
    const account = await asOwner.query(api.checks.getBankAccount, { bankAccountId });

    expect(gaps[0].missingCheckNumber).toBe("4001-4004");
    expect(gaps[0].reason).toContain("never in stock");
    expect(account.nextCheckNumber).toBe(4006);
  });

  test("allows only admin reprints and prevents staff from finalizing print", async () => {
    const t = convexTest(schema, modules);
    const { asOwner, asManager, asStaff } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner, 5001);
    const { batchId } = await reserveBatch(asOwner, { clientId, bankAccountId, templateId, startingCheckNumber: 5001, quantity: 1 });

    await expect(asStaff.mutation(api.checks.confirmBatchAllPrinted, { batchId })).rejects.toThrow(/Manager access/);
    await asManager.mutation(api.checks.confirmBatchAllPrinted, { batchId });
    const [printed] = await asOwner.query(api.checks.listRegister, { bankAccountId });

    await expect(asManager.mutation(api.checks.reprintCheck, { checkId: printed._id, reason: "Manager test" })).rejects.toThrow(
      /Owner access/
    );
    await asOwner.mutation(api.checks.reprintCheck, { checkId: printed._id, reason: "Client requested replacement stock" });
    const [reprinted] = await asOwner.query(api.checks.listRegister, { bankAccountId });

    expect(reprinted.status).toBe("reprinted");
    expect(reprinted.reprintCount).toBe(1);
  });

  test("test print preview does not consume real check numbers", async () => {
    const t = convexTest(schema, modules);
    const { asOwner } = await seedUsers(t);
    const { clientId, bankAccountId, templateId } = await seedClientAndBank(asOwner, 6001);

    const preview = await asOwner.query(api.checks.testPrintPreview, { clientId, bankAccountId, templateId });
    const account = await asOwner.query(api.checks.getBankAccount, { bankAccountId });
    const register = await asOwner.query(api.checks.listRegister, { bankAccountId });

    expect(preview.isTestPrint).toBe(true);
    expect(preview.checkNumber).toBe(6001);
    expect(account.nextCheckNumber).toBe(6001);
    expect(register).toHaveLength(0);
  });
});

async function seedUsers(t: TestHarness) {
  const ownerId = await insertUser(t, "owner", "owner@example.test");
  const managerId = await insertUser(t, "manager", "manager@example.test");
  const staffId = await insertUser(t, "employee", "staff@example.test");
  return {
    ownerId,
    managerId,
    staffId,
    asOwner: asUser(t, ownerId),
    asManager: asUser(t, managerId),
    asStaff: asUser(t, staffId)
  };
}

async function insertUser(
  t: TestHarness,
  role: "owner" | "manager" | "employee",
  email: string
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: role,
      email,
      role,
      title: role,
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now()
    });
  });
}

function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|session`,
    tokenIdentifier: `test|${userId}`,
    issuer: "test"
  });
}

async function seedClientAndBank(
  asOwner: TestActor,
  startingCheckNumber = 1001
) {
  const clientId = await asOwner.mutation(api.clients.create, clientPayload());
  const bankAccountId = await asOwner.mutation(api.checks.createBankAccount, {
    clientId,
    bankName: "First State Bank",
    accountNickname: "Operating Account",
    printBusinessName: "Acme Hardware LLC",
    printBusinessAddress: "100 Main St\nNashville, TN 37201",
    startingCheckNumber,
    routingNumber: "064000101",
    accountNumber: "123456789",
    micrEnabled: true,
    signatureLineLabel: "Authorized Signature",
    signatureImageAuthorized: false
  });
  const [template] = await asOwner.query(api.checks.listTemplates, { bankAccountId, includeInactive: true });
  return { clientId, bankAccountId, templateId: template._id };
}

function clientPayload() {
  return {
    clientName: "Acme Hardware",
    clientType: "Business" as const,
    businessLegalName: "Acme Hardware LLC",
    dba: "Acme Hardware",
    businessCategory: "Retail",
    businessAddress: "100 Main St, Nashville, TN 37201",
    mailingAddress: "PO Box 100, Nashville, TN 37202",
    phoneNumber: "(615) 555-0100",
    email: "office@acme.example",
    ownerContactPerson: "Alex Morgan",
    taxId: "12-3456789",
    balanceDue: 0,
    notes: ""
  };
}

function reserveBatch(
  actor: TestActor,
  args: {
    clientId: Id<"clients">;
    bankAccountId: Id<"clientBankAccounts">;
    templateId: Id<"checkTemplates">;
    startingCheckNumber: number;
    quantity: number;
    gapReason?: string;
    overrideReason?: string;
  }
) {
  return actor.mutation(api.checks.reserveBlankCheckBatch, {
    clientId: args.clientId,
    bankAccountId: args.bankAccountId,
    templateId: args.templateId,
    startingCheckNumber: args.startingCheckNumber,
    quantity: args.quantity,
    dateOption: "blank",
    checkDate: null,
    paperStockType: "Letter",
    memoText: "",
    signatureImageEnabled: false,
    alignmentOffsetX: 0,
    alignmentOffsetY: 0,
    gapReason: args.gapReason ?? "",
    overrideReason: args.overrideReason ?? "",
    notes: ""
  });
}
