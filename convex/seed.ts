import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { roleValidator } from "./validators";

const demoUsers = [
  {
    key: "owner",
    email: "owner@centerbusiness.test",
    password: "OwnerDemo123!",
    name: "Avery Center",
    role: "owner",
    title: "Owner"
  },
  {
    key: "manager",
    email: "manager@centerbusiness.test",
    password: "ManagerDemo123!",
    name: "Maya Patel",
    role: "manager",
    title: "Office Manager"
  },
  {
    key: "employee",
    email: "employee@centerbusiness.test",
    password: "EmployeeDemo123!",
    name: "Jordan Ellis",
    role: "employee",
    title: "Business Services Specialist"
  }
] as const;
type DemoUserKey = (typeof demoUsers)[number]["key"];
type SampleTemplate = {
  name: string;
  paperSize: "Letter" | "A4" | "Custom";
  customWidthIn?: number;
  customHeightIn?: number;
  checkPosition: "top" | "middle" | "bottom" | "fullPage";
  checksPerPage: number;
  marginTop: number;
  fontSize: number;
  alignmentOffsetX: number;
  alignmentOffsetY: number;
  xShift: number;
  yShift: number;
  isDefault: boolean;
};
type SampleAccount = {
  bankName: string;
  accountNickname: string;
  startingCheckNumber: number;
  routingNumber: string;
  accountNumber: string;
  micrEnabled: boolean;
  templates: SampleTemplate[];
};
type SampleCheckBusiness = {
  clientName: string;
  legalName: string;
  dba: string | null;
  category: string;
  businessAddress: string;
  mailingAddress: string;
  phone: string;
  email: string;
  contact: string;
  taxId: string;
  accounts: SampleAccount[];
};

const checkPrintingSamples: SampleCheckBusiness[] = [
  {
    clientName: "Harbor & Vine Catering",
    legalName: "Harbor & Vine Catering LLC",
    dba: "Harbor & Vine",
    category: "Catering",
    businessAddress: "1420 Market Row, Nashville, TN 37203",
    mailingAddress: "PO Box 1420, Nashville, TN 37202",
    phone: "(615) 555-2104",
    email: "office@harborvine.example",
    contact: "Nora Wells",
    taxId: "88-1042104",
    accounts: [
      {
        bankName: "Pinnacle Bank",
        accountNickname: "Operating Account",
        startingCheckNumber: 1201,
        routingNumber: "064008637",
        accountNumber: "4100259183",
        micrEnabled: true,
        templates: [
          sampleTemplate("Letter Top - Standard Business", "Letter", "top", 1, 0.25, 10, 0, 0, true),
          sampleTemplate("Letter Middle - Voucher Stock", "Letter", "middle", 1, 3.75, 10, 0.02, -0.01, false),
          sampleTemplate("Three-Up Letter Check Stock", "Letter", "top", 3, 0.15, 9.5, -0.03, 0.02, false)
        ]
      }
    ]
  },
  {
    clientName: "Blue Ridge Dental Group",
    legalName: "Blue Ridge Dental Group PLLC",
    dba: "Blue Ridge Dental",
    category: "Dental Office",
    businessAddress: "801 Wellness Pkwy, Franklin, TN 37064",
    mailingAddress: "801 Wellness Pkwy, Franklin, TN 37064",
    phone: "(615) 555-3308",
    email: "admin@blueridgedental.example",
    contact: "Dr. Lena Brooks",
    taxId: "62-3308011",
    accounts: [
      {
        bankName: "First Horizon Bank",
        accountNickname: "Vendor Disbursement Account",
        startingCheckNumber: 2400,
        routingNumber: "084000026",
        accountNumber: "2204410789",
        micrEnabled: true,
        templates: [
          sampleTemplate("A4 Full Page Check", "A4", "fullPage", 1, 0.35, 10.5, 0, 0.02, true),
          sampleTemplate("Letter Bottom - Remittance Stub", "Letter", "bottom", 1, 7.1, 10, 0.01, 0, false)
        ]
      }
    ]
  },
  {
    clientName: "Miller Creek Auto Repair",
    legalName: "Miller Creek Auto Repair LLC",
    dba: "Miller Creek Auto",
    category: "Automotive Repair",
    businessAddress: "515 Mechanic Ave, Murfreesboro, TN 37130",
    mailingAddress: "515 Mechanic Ave, Murfreesboro, TN 37130",
    phone: "(615) 555-7712",
    email: "books@millercreekauto.example",
    contact: "Eli Miller",
    taxId: "92-7712515",
    accounts: [
      {
        bankName: "Regions Bank",
        accountNickname: "Parts and Vendors Account",
        startingCheckNumber: 9050,
        routingNumber: "062005690",
        accountNumber: "7011905622",
        micrEnabled: false,
        templates: [
          sampleTemplate("Preprinted Stock - No MICR", "Letter", "top", 1, 0.28, 10, 0.04, 0.01, true),
          sampleTemplate("Custom 8.5 x 3.5 Check Only", "Custom", "fullPage", 1, 0.1, 9.5, 0, 0, false, 8.5, 3.5)
        ]
      }
    ]
  },
  {
    clientName: "Northstar Property Management",
    legalName: "Northstar Property Management Inc.",
    dba: "Northstar Properties",
    category: "Property Management",
    businessAddress: "300 Ledger Ln, Memphis, TN 38103",
    mailingAddress: "300 Ledger Ln, Memphis, TN 38103",
    phone: "(901) 555-4410",
    email: "payables@northstarproperties.example",
    contact: "Camila Ortiz",
    taxId: "71-4410300",
    accounts: [
      {
        bankName: "Truist",
        accountNickname: "Owner Distribution Account",
        startingCheckNumber: 5100,
        routingNumber: "061000104",
        accountNumber: "8842017736",
        micrEnabled: true,
        templates: [
          sampleTemplate("Letter Top - Owner Distributions", "Letter", "top", 1, 0.25, 10, 0, 0, true),
          sampleTemplate("Letter Bottom - Contractor Payments", "Letter", "bottom", 1, 7.0, 10, -0.02, 0.03, false)
        ]
      },
      {
        bankName: "Truist",
        accountNickname: "Maintenance Reserve Account",
        startingCheckNumber: 7001,
        routingNumber: "061000104",
        accountNumber: "8842018812",
        micrEnabled: true,
        templates: [
          sampleTemplate("Reserve Account Letter Top", "Letter", "top", 1, 0.25, 10, 0.01, 0, true)
        ]
      }
    ]
  }
];

export const findUserByEmail = query({
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

export const installDemo = action({
  args: {},
  handler: async (ctx): Promise<{
    seeded: boolean;
    users: { email: string; password: string; role: string }[];
  }> => {
    const ids: Partial<Record<DemoUserKey, Id<"users">>> = {};

    for (const demo of demoUsers) {
      const existing: Doc<"users"> | null = await ctx.runQuery(api.seed.findUserByEmail, {
        email: demo.email
      });
      if (existing?._id) {
        ids[demo.key] = existing._id;
        await modifyAccountCredentials(ctx, {
          provider: "password",
          account: {
            id: demo.email,
            secret: demo.password
          }
        });
        await ctx.runMutation(internal.seed.ensureDemoUserProfile, {
          userId: existing._id,
          name: demo.name,
          role: demo.role,
          title: demo.title
        });
        continue;
      }

      const created = await createAccount(ctx, {
        provider: "password",
        account: {
          id: demo.email,
          secret: demo.password
        },
        profile: {
          email: demo.email,
          emailVerificationTime: Date.now(),
          name: demo.name,
          role: demo.role,
          title: demo.title,
          isActive: true,
          accessStatus: "active",
          accessUpdatedAt: Date.now(),
          isDemo: true
        }
      });
      ids[demo.key] = created.user._id;
    }

    if (!ids.owner || !ids.manager || !ids.employee) {
      throw new Error("Unable to create all demo users.");
    }

    const result: { seeded: boolean } = await ctx.runMutation(api.seed.seedWorkspace, {
      ownerId: ids.owner,
      managerId: ids.manager,
      employeeId: ids.employee
    });
    await ctx.runMutation(internal.services.seedDefaultsInternal, {
      createdBy: ids.owner
    });
    await ctx.runMutation(internal.clients.seedDemoClients, {
      ownerId: ids.owner,
      managerId: ids.manager,
      employeeId: ids.employee
    });

    return {
      seeded: result.seeded,
      users: demoUsers.map(({ email, password, role }) => ({ email, password, role }))
    };
  }
});

export const installCheckPrintingDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const owner =
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "owner"))
        .take(20)).find(isActiveUser) ??
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "manager"))
        .take(20)).find(isActiveUser);

    if (!owner) {
      throw new Error("Create an active admin or manager user before installing check-printing samples.");
    }

    const now = Date.now();
    let clientsCreated = 0;
    let bankAccountsCreated = 0;
    let templatesCreated = 0;

    for (const sample of checkPrintingSamples) {
      let client = await ctx.db
        .query("clients")
        .withIndex("by_client_name", (q) => q.eq("clientName", sample.clientName))
        .first();
      let clientId: Id<"clients">;

      if (client) {
        clientId = client._id;
      } else {
        clientId = await ctx.db.insert("clients", {
          clientName: sample.clientName,
          clientType: "Business",
          businessLegalName: sample.legalName,
          dba: sample.dba,
          businessCategory: sample.category,
          businessAddress: sample.businessAddress,
          mailingAddress: sample.mailingAddress,
          phoneNumber: sample.phone,
          email: sample.email,
          ownerContactPerson: sample.contact,
          taxId: sample.taxId,
          assignedTeamMemberId: null,
          balanceDue: 0,
          notes: "Sample check-printing business.",
          archived: false,
          archivedAt: null,
          createdBy: owner._id,
          createdAt: now,
          updatedAt: now
        });
        client = await ctx.db.get(clientId);
        clientsCreated += 1;
      }

      for (const account of sample.accounts) {
        const existingAccounts = await ctx.db
          .query("clientBankAccounts")
          .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
          .take(50);
        let bankAccount = existingAccounts.find(
          (row) => row.bankName === account.bankName && row.accountNickname === account.accountNickname
        );
        let bankAccountId: Id<"clientBankAccounts">;

        if (bankAccount) {
          bankAccountId = bankAccount._id;
        } else {
          bankAccountId = await ctx.db.insert("clientBankAccounts", {
            clientId,
            bankName: account.bankName,
            accountNickname: account.accountNickname,
            printBusinessName: sample.legalName,
            printBusinessAddress: sample.businessAddress.replace(", ", "\n"),
            startingCheckNumber: account.startingCheckNumber,
            nextCheckNumber: account.startingCheckNumber,
            lastPrintedCheckNumber: null,
            defaultTemplateId: null,
            routingNumberProtected: account.routingNumber,
            routingNumberLast4: account.routingNumber.slice(-4),
            accountNumberProtected: account.accountNumber,
            accountNumberLast4: account.accountNumber.slice(-4),
            micrEnabled: account.micrEnabled,
            signatureLineLabel: "Authorized Signature",
            logoUrl: null,
            signatureImageUrl: null,
            signatureImageAuthorized: false,
            status: "active",
            notes: "Sample bank account for check printing.",
            createdBy: owner._id,
            createdAt: now,
            updatedAt: now
          });
          bankAccount = (await ctx.db.get(bankAccountId)) ?? undefined;
          bankAccountsCreated += 1;
        }

        const existingTemplates = await ctx.db
          .query("checkTemplates")
          .withIndex("by_bank_account_id", (q) => q.eq("bankAccountId", bankAccountId))
          .take(50);
        let defaultTemplateId = bankAccount?.defaultTemplateId ?? null;

        for (const template of account.templates) {
          const existing = existingTemplates.find((row) => row.name === template.name);
          if (existing) {
            if (template.isDefault) defaultTemplateId = existing._id;
            continue;
          }

          const templateId = await ctx.db.insert("checkTemplates", {
            clientId,
            bankAccountId,
            name: template.name,
            paperSize: template.paperSize,
            customWidthIn: template.paperSize === "Custom" ? template.customWidthIn : null,
            customHeightIn: template.paperSize === "Custom" ? template.customHeightIn : null,
            checkPosition: template.checkPosition,
            checksPerPage: template.checksPerPage,
            marginTop: template.marginTop,
            marginRight: 0.25,
            marginBottom: 0.25,
            marginLeft: 0.25,
            fontSize: template.fontSize,
            alignmentOffsetX: template.alignmentOffsetX,
            alignmentOffsetY: template.alignmentOffsetY,
            layout: shiftedLayout(template.xShift, template.yShift),
            isDefault: template.isDefault,
            isActive: true,
            createdBy: owner._id,
            createdAt: now,
            updatedAt: now
          });
          if (template.isDefault || !defaultTemplateId) defaultTemplateId = templateId;
          templatesCreated += 1;
        }

        if (defaultTemplateId && bankAccount?.defaultTemplateId !== defaultTemplateId) {
          await ctx.db.patch(bankAccountId, {
            defaultTemplateId,
            updatedAt: now
          });
        }
      }
    }

    return { clientsCreated, bankAccountsCreated, templatesCreated };
  }
});

export const ensureDemoUserProfile = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
    title: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      name: args.name,
      role: args.role,
      title: args.title,
      isActive: true,
      accessStatus: "active",
      accessUpdatedAt: Date.now(),
      isDemo: true
    });
    return null;
  }
});

function isActiveUser(user: Doc<"users">) {
  return user.isActive !== false && user.accessStatus !== "suspended" && user.accessStatus !== "removed";
}

function sampleTemplate(
  name: string,
  paperSize: "Letter" | "A4" | "Custom",
  checkPosition: "top" | "middle" | "bottom" | "fullPage",
  checksPerPage: number,
  marginTop: number,
  fontSize: number,
  alignmentOffsetX: number,
  alignmentOffsetY: number,
  isDefault: boolean,
  customWidthIn?: number,
  customHeightIn?: number
): SampleTemplate {
  const yShift = checkPosition === "middle" ? 3.35 : checkPosition === "bottom" ? 6.75 : 0;
  return {
    name,
    paperSize,
    customWidthIn,
    customHeightIn,
    checkPosition,
    checksPerPage,
    marginTop,
    fontSize,
    alignmentOffsetX,
    alignmentOffsetY,
    xShift: 0,
    yShift,
    isDefault
  };
}

function shiftedLayout(xShift: number, yShift: number) {
  return {
    businessName: { x: 0.55 + xShift, y: 0.38 + yShift, width: 2.8, height: 0.22 },
    businessAddress: { x: 0.55 + xShift, y: 0.68 + yShift, width: 3.2, height: 0.35 },
    bankName: { x: 3.55 + xShift, y: 0.45 + yShift, width: 2.1, height: 0.24 },
    checkNumber: { x: 6.8 + xShift, y: 0.34 + yShift, width: 1.0, height: 0.22 },
    date: { x: 6.25 + xShift, y: 0.86 + yShift, width: 1.4, height: 0.22 },
    payeeLine: { x: 0.8 + xShift, y: 1.55 + yShift, width: 4.8, height: 0.2 },
    amountBox: { x: 6.05 + xShift, y: 1.45 + yShift, width: 1.45, height: 0.35 },
    amountWordsLine: { x: 0.55 + xShift, y: 2.02 + yShift, width: 6.2, height: 0.2 },
    memoLine: { x: 0.55 + xShift, y: 2.75 + yShift, width: 2.3, height: 0.2 },
    signatureLine: { x: 5.05 + xShift, y: 2.7 + yShift, width: 2.2, height: 0.2 },
    micrLine: { x: 1.4 + xShift, y: 3.2 + yShift, width: 5.2, height: 0.24 },
    logo: { x: 0.25 + xShift, y: 0.35 + yShift, width: 0.24, height: 0.24 }
  };
}

export const seedWorkspace = mutation({
  args: {
    ownerId: v.id("users"),
    managerId: v.id("users"),
    employeeId: v.id("users")
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_business_name", (q) => q.eq("businessName", "Luna Market"))
      .first();
    if (existing) {
      return { seeded: false };
    }

    const now = Date.now();
    const lunaMarket = await ctx.db.insert("customers", {
      businessName: "Luna Market",
      phoneNumber: "(615) 555-0184",
      businessType: "Convenience Store",
      openingBalance: 0,
      balance: 0,
      createdBy: args.ownerId,
      createdAt: now,
      updatedAt: now
    });
    const riverbend = await ctx.db.insert("customers", {
      businessName: "Riverbend Deli",
      phoneNumber: "(615) 555-0112",
      businessType: "Restaurant",
      openingBalance: 125,
      balance: 125,
      createdBy: args.managerId,
      createdAt: now,
      updatedAt: now
    });
    const oakSupply = await ctx.db.insert("customers", {
      businessName: "Oak Supply Co.",
      phoneNumber: "(901) 555-0199",
      businessType: "Wholesale",
      openingBalance: 0,
      balance: 0,
      createdBy: args.managerId,
      createdAt: now,
      updatedAt: now
    });

    const einJob = await ctx.db.insert("jobs", {
      customerId: lunaMarket,
      jobType: "EIN Application",
      fee: 150,
      amountPaid: 150,
      assignedEmployeeId: args.employeeId,
      status: "Completed",
      dueDate: "2026-05-08",
      priority: "Medium",
      notes: "Confirmation letter delivered to client.",
      createdBy: args.managerId,
      createdAt: now - 86400000 * 4,
      assignedAt: now - 86400000 * 4,
      completedAt: now - 86400000,
      updatedAt: now - 86400000
    });
    await ctx.db.patch(einJob, { jobOrderId: `JO-${einJob.slice(-6).toUpperCase()}` });
    await ctx.db.insert("payments", {
      jobId: einJob,
      customerId: lunaMarket,
      amount: 150,
      note: "Paid in full",
      receivedBy: args.managerId,
      paidAt: now - 86400000 * 3
    });

    const licenseJob = await ctx.db.insert("jobs", {
      customerId: riverbend,
      jobType: "Business License",
      fee: 325,
      amountPaid: 100,
      assignedEmployeeId: args.employeeId,
      status: "In Progress",
      dueDate: "2026-05-12",
      priority: "High",
      notes: "Waiting on lease copy from client.",
      createdBy: args.managerId,
      createdAt: now - 86400000 * 2,
      assignedAt: now - 86400000 * 2,
      completedAt: null,
      updatedAt: now - 3600000 * 8
    });
    await ctx.db.patch(licenseJob, { jobOrderId: `JO-${licenseJob.slice(-6).toUpperCase()}` });
    await ctx.db.insert("payments", {
      jobId: licenseJob,
      customerId: riverbend,
      amount: 100,
      note: "Deposit",
      receivedBy: args.ownerId,
      paidAt: now - 86400000 * 2
    });

    const annualReportJob = await ctx.db.insert("jobs", {
      customerId: oakSupply,
      jobType: "Annual Report Filing",
      fee: 225,
      amountPaid: 0,
      assignedEmployeeId: args.managerId,
      status: "New",
      dueDate: "2026-05-20",
      priority: "Low",
      notes: "Confirm SOS control number before filing.",
      createdBy: args.ownerId,
      createdAt: now - 3600000 * 12,
      assignedAt: now - 3600000 * 12,
      completedAt: null,
      updatedAt: now - 3600000 * 12
    });
    await ctx.db.patch(annualReportJob, { jobOrderId: `JO-${annualReportJob.slice(-6).toUpperCase()}` });

    await ctx.db.patch(lunaMarket, { balance: 0, updatedAt: now });
    await ctx.db.patch(riverbend, { balance: 350, updatedAt: now });
    await ctx.db.patch(oakSupply, { balance: 225, updatedAt: now });

    return { seeded: true };
  }
});
