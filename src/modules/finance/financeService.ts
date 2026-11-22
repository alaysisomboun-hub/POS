import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { buildAuditLogPayload } from '../../core/firebase/auditService';
import { generateSafeId } from '../../core/utils/id';
import type {
  Customer,
  ExpenseCategory,
  IncomeCategory,
  JournalEntry,
  JournalLine,
  PurchaseOrder,
  SaleOrder,
  Supplier,
  UserProfile,
} from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

export const CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}[] = [
  { code: '1110', name: 'ເງິນສົດໃນມື', type: 'asset' },
  { code: '1120', name: 'ເງິນຝາກທະນາຄານ / QR', type: 'asset' },
  { code: '1130', name: 'ລູກໜີ້ການຄ້າ', type: 'asset' },
  { code: '1140', name: 'ສິນຄ້າຄົງເຫຼືອ', type: 'asset' },
  { code: '1210', name: 'ອຸປະກອນ ແລະ ຊັບສິນຮ້ານ', type: 'asset' },
  { code: '2110', name: 'ເຈົ້າໜີ້ການຄ້າ', type: 'liability' },
  { code: '2120', name: 'ພາສີຂາຍຄ້າງຈ່າຍ', type: 'liability' },
  { code: '3100', name: 'ທຶນຂອງເຈົ້າຂອງກິດຈະການ', type: 'equity' },
  { code: '4100', name: 'ລາຍໄດ້ຈາກການຂາຍສິນຄ້າ', type: 'revenue' },
  { code: '4200', name: 'ລາຍໄດ້ອື່ນໆ', type: 'revenue' },
  { code: '5100', name: 'ຕົ້ນທຶນຂາຍ (COGS)', type: 'expense' },
  { code: '5210', name: 'ຄ່າເຊົ່າສະຖານທີ່', type: 'expense' },
  { code: '5220', name: 'ຄ່ານ້ຳ-ຄ່າໄຟ-ສາທາລະນູປະໂພກ', type: 'expense' },
  { code: '5230', name: 'ເງິນເດືອນ ແລະ ຄ່າແຮງພະນັກງານ', type: 'expense' },
  { code: '5240', name: 'ຄ່າຂົນສົ່ງສິນຄ້າ', type: 'expense' },
  { code: '5250', name: 'ຄ່າການຕະຫຼາດ ແລະ ສົ່ງເສີມການຂາຍ', type: 'expense' },
  { code: '5260', name: 'ຄ່າສ້ອມແປງ ແລະ ຄ່າໃຊ້ຈ່າຍອື່ນ', type: 'expense' },
];

export const EXPENSE_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; accountCode: string; accountName: string }
> = {
  inventory_purchase: { label: 'ຊື້ສິນຄ້າເຂົ້າສາງ', accountCode: '1140', accountName: 'ສິນຄ້າຄົງເຫຼືອ' },
  rent: { label: 'ຄ່າເຊົ່າສະຖານທີ່', accountCode: '5210', accountName: 'ຄ່າເຊົ່າສະຖານທີ່' },
  utilities: { label: 'ຄ່ານ້ຳ-ຄ່າໄຟ-ສາທາລະນູປະໂພກ', accountCode: '5220', accountName: 'ຄ່ານ້ຳ-ຄ່າໄຟ-ສາທາລະນູປະໂພກ' },
  salary: { label: 'ເງິນເດືອນ ແລະ ຄ່າແຮງ', accountCode: '5230', accountName: 'ເງິນເດືອນ ແລະ ຄ່າແຮງພະນັກງານ' },
  transport: { label: 'ຄ່າຂົນສົ່ງ ແລະ ເດີນທາງ', accountCode: '5240', accountName: 'ຄ່າຂົນສົ່ງສິນຄ້າ' },
  marketing: { label: 'ຄ່າການຕະຫຼາດ ແລະ ໂປຣໂມດ', accountCode: '5250', accountName: 'ຄ່າການຕະຫຼາດ ແລະ ສົ່ງເສີມການຂາຍ' },
  maintenance_other: { label: 'ສ້ອມແປງ ແລະ ຄ່າໃຊ້ຈ່າຍອື່ນໆ', accountCode: '5260', accountName: 'ຄ່າສ້ອມແປງ ແລະ ຄ່າໃຊ້ຈ່າຍອື່ນ' },
};

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  sales: 'ລາຍໄດ້ຈາກການຂາຍສິນຄ້າ',
  ar_collection: 'ຮັບຊຳລະໜີ້ລູກໜີ້ການຄ້າ',
  other_income: 'ລາຍຮັບອື່ນໆ',
};

export async function recordArPayment(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  customer: Customer;
  sale?: SaleOrder | null;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  notes: string;
}): Promise<void> {
  const { db, user, branchId, customer, sale = null, amountLak, paymentMethod, notes } = params;
  const safeAmount = Math.round(amountLak);
  if (safeAmount <= 0) throw new Error('ຈຳນວນເງິນຮັບຊຳລະຕ້ອງຫຼາຍກວ່າ 0');

  const paymentId = generateSafeId('arp');
  const entryDate = todayYmd();

  await runTransaction(db, async (tx) => {
    const custRef = doc(db, 'customers', customer.customerId);
    const custSnap = await tx.get(custRef);
    if (!custSnap.exists()) throw new Error('ບໍ່ພົບຂໍ້ມູນລູກຄ້າ');
    const latestCust = custSnap.data() as Customer;

    let saleRef: ReturnType<typeof doc> | null = null;
    let latestSale: SaleOrder | null = null;
    if (sale) {
      saleRef = doc(db, 'sales', sale.saleId);
      const saleSnap = await tx.get(saleRef);
      if (saleSnap.exists()) latestSale = saleSnap.data() as SaleOrder;
    }

    const appliedToSale = latestSale ? Math.min(safeAmount, latestSale.creditDueLak) : 0;
    const invoiceNumber = latestSale?.invoiceNumber ?? 'AR-DIRECT';

    tx.update(custRef, {
      creditBalanceLak: Math.max(0, latestCust.creditBalanceLak - safeAmount),
      updatedAt: serverTimestamp(),
    });

    if (saleRef && latestSale && appliedToSale > 0) {
      tx.update(saleRef, {
        paidAmountLak: latestSale.paidAmountLak + appliedToSale,
        creditDueLak: Math.max(0, latestSale.creditDueLak - appliedToSale),
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(doc(db, 'arPayments', paymentId), {
      paymentId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      customerId: latestCust.customerId,
      customerName: latestCust.name.slice(0, 120),
      saleId: latestSale?.saleId ?? null,
      invoiceNumber: invoiceNumber.slice(0, 40),
      amountLak: safeAmount,
      paymentMethod,
      notes: notes.trim().slice(0, 300),
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const incId = generateSafeId('inc');
    tx.set(doc(db, 'incomeEntries', incId), {
      entryId: incId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      category: 'ar_collection',
      title: `ຮັບຊຳລະໜີ້ລູກໜີ້ ${latestCust.name} (${invoiceNumber})`.slice(0, 160),
      amountLak: safeAmount,
      paymentMethod,
      referenceNo: invoiceNumber.slice(0, 60),
      notes: notes.trim().slice(0, 300),
      entryDate,
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const debitAcc =
      paymentMethod === 'cash'
        ? { code: '1110', name: 'ເງິນສົດໃນມື' }
        : { code: '1120', name: 'ເງິນຝາກທະນາຄານ / QR' };
    const jnlId = generateSafeId('jnl');
    tx.set(doc(db, 'journalEntries', jnlId), {
      journalId: jnlId,
      entryNumber: `JV-AR-${Date.now().toString().slice(-6)}`,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      entryDate,
      description: `ຮັບຊຳລະໜີ້ລູກໜີ້ ${latestCust.name} (${invoiceNumber})`.slice(0, 300),
      sourceType: 'ar_payment',
      referenceNo: invoiceNumber.slice(0, 60),
      lines: [
        { accountCode: debitAcc.code, accountName: debitAcc.name, debitLak: safeAmount, creditLak: 0 },
        { accountCode: '1130', accountName: 'ລູກໜີ້ການຄ້າ', debitLak: 0, creditLak: safeAmount },
      ],
      totalDebitLak: safeAmount,
      totalCreditLak: safeAmount,
      createdByUid: user.uid,
      createdByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'RECORD_AR_PAYMENT',
      entityType: 'arPayments',
      entityId: paymentId,
      before: { creditBalanceLak: latestCust.creditBalanceLak },
      after: { amountLak: safeAmount, customerName: latestCust.name, invoiceNumber },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function recordApPayment(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  supplier: Supplier;
  po?: PurchaseOrder | null;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  notes: string;
}): Promise<void> {
  const { db, user, branchId, supplier, po = null, amountLak, paymentMethod, notes } = params;
  const safeAmount = Math.round(amountLak);
  if (safeAmount <= 0) throw new Error('ຈຳນວນເງິນຈ່າຍຊຳລະຕ້ອງຫຼາຍກວ່າ 0');

  const paymentId = generateSafeId('app');
  const entryDate = todayYmd();

  await runTransaction(db, async (tx) => {
    const supRef = doc(db, 'suppliers', supplier.supplierId);
    const supSnap = await tx.get(supRef);
    if (!supSnap.exists()) throw new Error('ບໍ່ພົບຂໍ້ມູນຜູ້ສະໜອງ');
    const latestSup = supSnap.data() as Supplier;

    let poRef: ReturnType<typeof doc> | null = null;
    let latestPo: PurchaseOrder | null = null;
    if (po) {
      poRef = doc(db, 'purchaseOrders', po.poId);
      const poSnap = await tx.get(poRef);
      if (poSnap.exists()) latestPo = poSnap.data() as PurchaseOrder;
    }

    const appliedToPo = latestPo ? Math.min(safeAmount, latestPo.creditDueLak) : 0;
    const poNumber = latestPo?.poNumber ?? 'AP-DIRECT';

    tx.update(supRef, {
      payableBalanceLak: Math.max(0, latestSup.payableBalanceLak - safeAmount),
      updatedAt: serverTimestamp(),
    });

    if (poRef && latestPo && appliedToPo > 0) {
      tx.update(poRef, {
        paidAmountLak: latestPo.paidAmountLak + appliedToPo,
        creditDueLak: Math.max(0, latestPo.creditDueLak - appliedToPo),
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(doc(db, 'apPayments', paymentId), {
      paymentId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      supplierId: latestSup.supplierId,
      supplierName: latestSup.name.slice(0, 140),
      poId: latestPo?.poId ?? null,
      poNumber: poNumber.slice(0, 40),
      amountLak: safeAmount,
      paymentMethod,
      notes: notes.trim().slice(0, 300),
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const expId = generateSafeId('exp');
    tx.set(doc(db, 'expenseEntries', expId), {
      entryId: expId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      category: 'inventory_purchase',
      title: `ຈ່າຍຊຳລະໜີ້ຜູ້ສະໜອງ ${latestSup.name} (${poNumber})`.slice(0, 160),
      amountLak: safeAmount,
      paymentMethod,
      referenceNo: poNumber.slice(0, 60),
      notes: notes.trim().slice(0, 300),
      entryDate,
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const creditAcc =
      paymentMethod === 'cash'
        ? { code: '1110', name: 'ເງິນສົດໃນມື' }
        : { code: '1120', name: 'ເງິນຝາກທະນາຄານ / QR' };
    const jnlId = generateSafeId('jnl');
    tx.set(doc(db, 'journalEntries', jnlId), {
      journalId: jnlId,
      entryNumber: `JV-AP-${Date.now().toString().slice(-6)}`,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      entryDate,
      description: `ຈ່າຍຊຳລະໜີ້ຜູ້ສະໜອງ ${latestSup.name} (${poNumber})`.slice(0, 300),
      sourceType: 'ap_payment',
      referenceNo: poNumber.slice(0, 60),
      lines: [
        { accountCode: '2110', accountName: 'ເຈົ້າໜີ້ການຄ້າ', debitLak: safeAmount, creditLak: 0 },
        { accountCode: creditAcc.code, accountName: creditAcc.name, debitLak: 0, creditLak: safeAmount },
      ],
      totalDebitLak: safeAmount,
      totalCreditLak: safeAmount,
      createdByUid: user.uid,
      createdByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'RECORD_AP_PAYMENT',
      entityType: 'apPayments',
      entityId: paymentId,
      before: { payableBalanceLak: latestSup.payableBalanceLak },
      after: { amountLak: safeAmount, supplierName: latestSup.name, poNumber },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function recordIncomeEntry(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  category: IncomeCategory;
  title: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  referenceNo: string;
  notes: string;
  entryDate: string;
}): Promise<void> {
  const { db, user, branchId, category, title, amountLak, paymentMethod, referenceNo, notes, entryDate } =
    params;
  const safeAmount = Math.round(amountLak);
  if (safeAmount <= 0) throw new Error('ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0');
  if (!title.trim()) throw new Error('ກະລຸນາລະບຸຊື່ລາຍການລາຍຮັບ');

  const entryId = generateSafeId('inc');
  const cleanTitle = title.trim().slice(0, 160);
  const cleanDate = entryDate.slice(0, 20) || todayYmd();

  await runTransaction(db, async (tx) => {
    tx.set(doc(db, 'incomeEntries', entryId), {
      entryId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      category,
      title: cleanTitle,
      amountLak: safeAmount,
      paymentMethod,
      referenceNo: referenceNo.trim().slice(0, 60),
      notes: notes.trim().slice(0, 300),
      entryDate: cleanDate,
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const debitAcc =
      paymentMethod === 'cash'
        ? { code: '1110', name: 'ເງິນສົດໃນມື' }
        : { code: '1120', name: 'ເງິນຝາກທະນາຄານ / QR' };
    const jnlId = generateSafeId('jnl');
    tx.set(doc(db, 'journalEntries', jnlId), {
      journalId: jnlId,
      entryNumber: `JV-INC-${Date.now().toString().slice(-6)}`,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      entryDate: cleanDate,
      description: cleanTitle,
      sourceType: 'income',
      referenceNo: referenceNo.trim().slice(0, 60),
      lines: [
        { accountCode: debitAcc.code, accountName: debitAcc.name, debitLak: safeAmount, creditLak: 0 },
        { accountCode: '4200', accountName: 'ລາຍໄດ້ອື່ນໆ', debitLak: 0, creditLak: safeAmount },
      ],
      totalDebitLak: safeAmount,
      totalCreditLak: safeAmount,
      createdByUid: user.uid,
      createdByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'RECORD_INCOME',
      entityType: 'incomeEntries',
      entityId: entryId,
      before: null,
      after: { title: cleanTitle, amountLak: safeAmount, category },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function recordExpenseEntry(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  category: ExpenseCategory;
  title: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  referenceNo: string;
  notes: string;
  entryDate: string;
}): Promise<void> {
  const { db, user, branchId, category, title, amountLak, paymentMethod, referenceNo, notes, entryDate } =
    params;
  const safeAmount = Math.round(amountLak);
  if (safeAmount <= 0) throw new Error('ຈຳນວນເງິນລາຍຈ່າຍຕ້ອງຫຼາຍກວ່າ 0');
  if (!title.trim()) throw new Error('ກະລຸນາລະບຸຊື່ລາຍການລາຍຈ່າຍ');

  const entryId = generateSafeId('exp');
  const cleanTitle = title.trim().slice(0, 160);
  const cleanDate = entryDate.slice(0, 20) || todayYmd();
  const catMeta = EXPENSE_CATEGORY_META[category];

  await runTransaction(db, async (tx) => {
    tx.set(doc(db, 'expenseEntries', entryId), {
      entryId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      category,
      title: cleanTitle,
      amountLak: safeAmount,
      paymentMethod,
      referenceNo: referenceNo.trim().slice(0, 60),
      notes: notes.trim().slice(0, 300),
      entryDate: cleanDate,
      recordedByUid: user.uid,
      recordedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const creditAcc =
      paymentMethod === 'cash'
        ? { code: '1110', name: 'ເງິນສົດໃນມື' }
        : { code: '1120', name: 'ເງິນຝາກທະນາຄານ / QR' };
    const jnlId = generateSafeId('jnl');
    tx.set(doc(db, 'journalEntries', jnlId), {
      journalId: jnlId,
      entryNumber: `JV-EXP-${Date.now().toString().slice(-6)}`,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      entryDate: cleanDate,
      description: `${catMeta.label}: ${cleanTitle}`.slice(0, 300),
      sourceType: 'expense',
      referenceNo: referenceNo.trim().slice(0, 60),
      lines: [
        {
          accountCode: catMeta.accountCode,
          accountName: catMeta.accountName,
          debitLak: safeAmount,
          creditLak: 0,
        },
        { accountCode: creditAcc.code, accountName: creditAcc.name, debitLak: 0, creditLak: safeAmount },
      ],
      totalDebitLak: safeAmount,
      totalCreditLak: safeAmount,
      createdByUid: user.uid,
      createdByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'RECORD_EXPENSE',
      entityType: 'expenseEntries',
      entityId: entryId,
      before: null,
      after: { title: cleanTitle, amountLak: safeAmount, category },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function createManualJournalEntry(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  entryDate: string;
  description: string;
  referenceNo: string;
  lines: JournalLine[];
}): Promise<JournalEntry | void> {
  const { db, user, branchId, entryDate, description, referenceNo, lines } = params;
  const cleanLines = lines
    .map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName,
      debitLak: Math.max(0, Math.round(l.debitLak)),
      creditLak: Math.max(0, Math.round(l.creditLak)),
    }))
    .filter((l) => l.debitLak > 0 || l.creditLak > 0);

  if (cleanLines.length < 2) {
    throw new Error('ລາຍການບັນຊີຕ້ອງມີຢ່າງໜ້ອຍ 2 ແຖວ (ເດບິດ ແລະ ເຄຣດິດ)');
  }
  const totalDebitLak = cleanLines.reduce((s, l) => s + l.debitLak, 0);
  const totalCreditLak = cleanLines.reduce((s, l) => s + l.creditLak, 0);
  if (totalDebitLak <= 0 || totalDebitLak !== totalCreditLak) {
    throw new Error('ຍອດລວມເດບິດ ແລະ ເຄຣດິດຕ້ອງເທົ່າກັນ ແລະ ຫຼາຍກວ່າ 0');
  }
  if (!description.trim()) {
    throw new Error('ກະລຸນາລະບຸຄຳອະທິບາຍລາຍການບັນຊີ');
  }

  const journalId = generateSafeId('jnl');
  const entryNumber = `JV-MAN-${Date.now().toString().slice(-6)}`;

  await runTransaction(db, async (tx) => {
    tx.set(doc(db, 'journalEntries', journalId), {
      journalId,
      entryNumber,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      entryDate: entryDate.slice(0, 20) || todayYmd(),
      description: description.trim().slice(0, 300),
      sourceType: 'manual',
      referenceNo: referenceNo.trim().slice(0, 60),
      lines: cleanLines.slice(0, 30),
      totalDebitLak,
      totalCreditLak,
      createdByUid: user.uid,
      createdByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'CREATE_MANUAL_JOURNAL',
      entityType: 'journalEntries',
      entityId: journalId,
      before: null,
      after: { entryNumber, totalDebitLak, description: description.trim().slice(0, 120) },
    });
    tx.set(audit.ref, audit.data);
  });
}
