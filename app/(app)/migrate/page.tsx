'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { getCachedBusiness, setCachedBusiness } from '@/lib/offlineStore';

export type MigrationCategory =
  | 'inventory'
  | 'invoices'
  | 'assets'
  | 'customers'
  | 'transactions'
  | 'suppliers'
  | 'opening_balances'
  | 'payroll';

interface FieldMapping {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'number';
  matchedHeader: string | null;
}

const CATEGORY_CONFIG: Record<
  MigrationCategory,
  { label: string; icon: string; description: string; destination: string; fields: FieldMapping[] }
> = {
  inventory: {
    label: 'Inventory & Stock',
    icon: '📦',
    description: 'Product catalog, barcode/SKUs, unit costs, selling prices, and quantities.',
    destination: 'Inventory Catalog (inventory_items)',
    fields: [
      { key: 'name', label: 'Item Name / Description', required: true, type: 'text', matchedHeader: null },
      { key: 'barcode', label: 'Barcode / SKU', required: false, type: 'text', matchedHeader: null },
      { key: 'quantity', label: 'Quantity on Hand', required: true, type: 'number', matchedHeader: null },
      { key: 'unit_cost', label: 'Unit Cost (Buying Price)', required: false, type: 'number', matchedHeader: null },
      { key: 'unit_price', label: 'Unit Price (Selling Price)', required: true, type: 'number', matchedHeader: null },
    ],
  },
  invoices: {
    label: 'Invoices & Billing',
    icon: '🧾',
    description: 'Historical customer invoices, invoice numbers, due dates, amounts, and settlement status.',
    destination: 'Invoicing & Receivables (invoices)',
    fields: [
      { key: 'invoice_number', label: 'Invoice # / Ref', required: false, type: 'text', matchedHeader: null },
      { key: 'customer_name', label: 'Customer / Client Name', required: true, type: 'text', matchedHeader: null },
      { key: 'customer_phone', label: 'Customer Phone / WhatsApp', required: false, type: 'text', matchedHeader: null },
      { key: 'customer_email', label: 'Customer Email', required: false, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Invoice Total Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'due_date', label: 'Due Date (YYYY-MM-DD)', required: false, type: 'text', matchedHeader: null },
      { key: 'status', label: 'Status (paid / sent / draft)', required: false, type: 'text', matchedHeader: null },
      { key: 'description', label: 'Description / Line Items', required: false, type: 'text', matchedHeader: null },
    ],
  },
  assets: {
    label: 'Fixed Assets & Machinery',
    icon: '🏢',
    description: 'Capital assets, plant & machinery, vehicles, office equipment, purchase costs, and acquisition dates.',
    destination: 'Fixed Assets & Capital Allowances (transactions & balance sheet)',
    fields: [
      { key: 'name', label: 'Asset Description / Name', required: true, type: 'text', matchedHeader: null },
      { key: 'category', label: 'Asset Class (Vehicles, Machinery, IT, Furniture)', required: false, type: 'text', matchedHeader: null },
      { key: 'cost', label: 'Purchase / Acquisition Cost', required: true, type: 'number', matchedHeader: null },
      { key: 'acquisition_date', label: 'Purchase Date (YYYY-MM-DD)', required: false, type: 'text', matchedHeader: null },
      { key: 'serial_number', label: 'Serial / Tag #', required: false, type: 'text', matchedHeader: null },
      { key: 'depreciation_rate', label: 'Annual Depreciation % (e.g. 20%)', required: false, type: 'number', matchedHeader: null },
    ],
  },
  customers: {
    label: 'Customer Debt Book',
    icon: '👥',
    description: 'Client contact directory, WhatsApp numbers, email addresses, and uncollected debt balances.',
    destination: 'Customer Directory & Accounts (customers & receivables)',
    fields: [
      { key: 'name', label: 'Customer Name', required: true, type: 'text', matchedHeader: null },
      { key: 'phone', label: 'WhatsApp / Phone Number', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'balance', label: 'Outstanding Debt / Balance', required: false, type: 'number', matchedHeader: null },
      { key: 'notes', label: 'Location / Notes', required: false, type: 'text', matchedHeader: null },
    ],
  },
  suppliers: {
    label: 'Suppliers & Vendor Payables',
    icon: '🏭',
    description: 'Supplier directory, credit balances owed (Short-Term Liabilities), payment terms, and due dates.',
    destination: 'Suppliers & Creditor Debt Book (suppliers & payables)',
    fields: [
      { key: 'name', label: 'Supplier / Vendor Name', required: true, type: 'text', matchedHeader: null },
      { key: 'phone', label: 'Phone / WhatsApp', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'category', label: 'Category / Supply Type', required: false, type: 'text', matchedHeader: null },
      { key: 'balance_owed', label: 'Outstanding Debt Owed (Liability)', required: false, type: 'number', matchedHeader: null },
      { key: 'payment_terms', label: 'Payment Terms (e.g. Net 30, COD)', required: false, type: 'text', matchedHeader: null },
      { key: 'due_date', label: 'Payment Due Date (YYYY-MM-DD)', required: false, type: 'text', matchedHeader: null },
      { key: 'notes', label: 'Location / Terms / Notes', required: false, type: 'text', matchedHeader: null },
    ],
  },
  opening_balances: {
    label: 'Opening Starting Balances',
    icon: '🏦',
    description: 'Starting cash in till, bank account balances, MoMo merchant wallets, owner equity, and start-up loans.',
    destination: 'General Ledger Baseline (transactions & balance sheet)',
    fields: [
      { key: 'account_name', label: 'Account Name (Cash Till, Bank, MoMo, Capital)', required: true, type: 'text', matchedHeader: null },
      { key: 'account_type', label: 'Type (asset, liability, equity)', required: true, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Opening Balance Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'as_of_date', label: 'As-Of Date (YYYY-MM-DD)', required: false, type: 'text', matchedHeader: null },
      { key: 'notes', label: 'Bank Acc # / Description', required: false, type: 'text', matchedHeader: null },
    ],
  },
  payroll: {
    label: 'Staff Payroll & Employee Roster',
    icon: '🧑‍🤝‍🧑',
    description: 'Employee roster, monthly basic salaries, phone, role, Ghana Card / TIN, and SSNIT numbers.',
    destination: 'Staff Payroll & Team Directory (business_members)',
    fields: [
      { key: 'name', label: 'Employee Full Name', required: true, type: 'text', matchedHeader: null },
      { key: 'role', label: 'Role / Designation (Cashier, Manager, Accountant)', required: true, type: 'text', matchedHeader: null },
      { key: 'salary', label: 'Monthly Basic Salary Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'phone', label: 'Phone Number / MoMo for Payroll', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Staff Email', required: false, type: 'text', matchedHeader: null },
      { key: 'branch', label: 'Branch / Store Location', required: false, type: 'text', matchedHeader: null },
      { key: 'ghana_card_tin', label: 'Ghana Card # / SSNIT / TIN', required: false, type: 'text', matchedHeader: null },
    ],
  },
  transactions: {
    label: 'General Ledger Expenses',
    icon: '📋',
    description: 'Historical income and expense cashbook entries, vendor payments, and operating costs.',
    destination: 'General Ledger Bookkeeping (transactions)',
    fields: [
      { key: 'transaction_date', label: 'Date (YYYY-MM-DD)', required: true, type: 'text', matchedHeader: null },
      { key: 'vendor', label: 'Description / Vendor / Particulars', required: true, type: 'text', matchedHeader: null },
      { key: 'type', label: 'Type (revenue or expense)', required: true, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Transaction Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'category', label: 'Expense / Revenue Category', required: false, type: 'text', matchedHeader: null },
    ],
  },
};

const FUZZY_DICTIONARY: Record<string, string[]> = {
  name: ['name', 'item', 'itemname', 'product', 'productname', 'description', 'desc', 'title', 'goods', 'asset', 'assetname', 'equipment', 'supplier', 'suppliername', 'employeename', 'staffname', 'fullname', 'clientname'],
  barcode: ['barcode', 'sku', 'code', 'itemcode', 'upc', 'ean', 'partnumber', 'serial', 'id'],
  quantity: ['quantity', 'qty', 'stock', 'available', 'units', 'count', 'qtyavailable', 'inventory', 'qtyonhand', 'pieces', 'balance'],
  unit_cost: ['unitcost', 'cost', 'costprice', 'buyprice', 'buyingprice', 'purchaseprice', 'unitcostprice', 'costperunit', 'buying'],
  unit_price: ['unitprice', 'price', 'sellingprice', 'sellprice', 'retail', 'salesprice', 'retailprice', 'amount', 'selling', 'rate'],
  invoice_number: ['invoicenumber', 'invnumber', 'invno', 'invoiceno', 'billno', 'number', 'ref', 'reference', 'receiptno', 'invoiceid'],
  customer_name: ['customername', 'customer', 'client', 'clientname', 'billto', 'account', 'payer', 'party', 'buyer'],
  customer_phone: ['phone', 'phonenumber', 'whatsapp', 'mobile', 'cell', 'tel', 'contact', 'momo', 'telephone'],
  customer_email: ['customeremail', 'clientemail', 'email', 'emailaddress', 'mail'],
  phone: ['phone', 'phonenumber', 'whatsapp', 'mobile', 'cell', 'tel', 'contact', 'momo', 'telephone'],
  email: ['email', 'emailaddress', 'mail'],
  amount: ['amount', 'invoicetotal', 'total', 'sum', 'value', 'grandtotal', 'netamount', 'cost', 'price', 'balance', 'openingbalance'],
  cost: ['purchasecost', 'cost', 'costprice', 'value', 'amount', 'originalcost', 'price', 'purchaseprice', 'buyingcost'],
  due_date: ['duedate', 'due', 'expiry', 'paymentdue', 'date', 'invoicedate'],
  status: ['status', 'paymentstatus', 'state', 'paidstatus', 'condition'],
  description: ['description', 'desc', 'items', 'service', 'particulars', 'memo', 'notes', 'details'],
  balance: ['balance', 'debt', 'amountdue', 'outstanding', 'receivable', 'owed', 'totaldue', 'balanceowed'],
  balance_owed: ['balanceowed', 'debtowed', 'amountowed', 'payable', 'payables', 'supplierdebt', 'billdue', 'debt', 'balance'],
  payment_terms: ['paymentterms', 'terms', 'term', 'creditperiod', 'creditdays', 'days'],
  notes: ['notes', 'address', 'location', 'remarks', 'comment', 'memo', 'terms'],
  category: ['category', 'group', 'dept', 'classification', 'assetclass', 'type', 'supplytype'],
  acquisition_date: ['purchasedate', 'acquisitiondate', 'date', 'acquired', 'boughton', 'startdate', 'installationdate'],
  serial_number: ['serialnumber', 'serial', 'chassis', 'tag', 'assetid', 'vin', 'serialno'],
  depreciation_rate: ['depreciationrate', 'depreciation', 'rate', 'depreciationpercent', 'depr', 'annualdepr'],
  transaction_date: ['date', 'transactiondate', 'txdate', 'recordedat', 'day', 'asofdate'],
  as_of_date: ['asofdate', 'date', 'startdate', 'openingdate', 'statementdate'],
  account_name: ['accountname', 'account', 'accountdescription', 'bankname', 'ledger', 'head'],
  account_type: ['accounttype', 'type', 'class', 'acctype', 'classification'],
  role: ['role', 'designation', 'position', 'jobtitle', 'title', 'department'],
  salary: ['salary', 'basicsalary', 'monthlysalary', 'pay', 'wage', 'remuneration', 'amount'],
  branch: ['branch', 'location', 'store', 'shop', 'outlet', 'site'],
  ghana_card_tin: ['ghanacard', 'tin', 'ssnit', 'idnumber', 'nationalid', 'taxid'],
  vendor: ['vendor', 'party', 'client', 'payee', 'payer', 'particulars', 'description'],
  type: ['type', 'txtype', 'kind', 'flow', 'entrytype'],
};

function normalizeStr(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

// AI Auto-Classification: Inspects headers and identifies what category the sheet belongs to
function autoClassifyHeaders(headers: string[]): { category: MigrationCategory; confidence: number; detectedReason: string } {
  const normHeaders = headers.map(normalizeStr);

  const scores: Record<MigrationCategory, { score: number; reasons: string[] }> = {
    invoices: { score: 0, reasons: [] },
    assets: { score: 0, reasons: [] },
    inventory: { score: 0, reasons: [] },
    customers: { score: 0, reasons: [] },
    transactions: { score: 0, reasons: [] },
    suppliers: { score: 0, reasons: [] },
    opening_balances: { score: 0, reasons: [] },
    payroll: { score: 0, reasons: [] },
  };

  // Check Invoices
  if (normHeaders.some((h) => ['invoicenumber', 'invno', 'invoiceno', 'billno', 'invoiceid'].includes(h))) {
    scores.invoices.score += 5;
    scores.invoices.reasons.push('Invoice Number column');
  }
  if (normHeaders.some((h) => ['duedate', 'paymentstatus', 'billto'].includes(h))) {
    scores.invoices.score += 3;
    scores.invoices.reasons.push('Due Date / Payment Status');
  }

  // Check Fixed Assets
  if (normHeaders.some((h) => ['assetname', 'equipment', 'depreciation', 'assetclass', 'machinery', 'chassis'].includes(h))) {
    scores.assets.score += 6;
    scores.assets.reasons.push('Fixed Asset / Depreciation / Equipment columns');
  }
  if (normHeaders.some((h) => ['purchasedate', 'acquisitiondate', 'serialnumber'].includes(h))) {
    scores.assets.score += 3;
    scores.assets.reasons.push('Acquisition Date / Serial #');
  }

  // Check Inventory
  if (normHeaders.some((h) => ['quantity', 'qty', 'stock', 'barcode', 'sku', 'qtyavailable'].includes(h))) {
    scores.inventory.score += 5;
    scores.inventory.reasons.push('Stock Quantity / Barcode SKU');
  }
  if (normHeaders.some((h) => ['unitcost', 'unitprice', 'sellingprice', 'buyingprice'].includes(h))) {
    scores.inventory.score += 3;
    scores.inventory.reasons.push('Unit Cost & Selling Price');
  }

  // Check Customers
  if (normHeaders.some((h) => ['customername', 'debt', 'amountdue', 'outstanding', 'balanceowed'].includes(h)) && !normHeaders.some((h) => ['supplier', 'vendor', 'payable'].includes(h))) {
    scores.customers.score += 5;
    scores.customers.reasons.push('Customer Debt / Balance');
  }
  if (normHeaders.some((h) => ['whatsapp', 'phonenumber', 'momo'].includes(h)) && !normHeaders.includes('unitprice')) {
    scores.customers.score += 3;
    scores.customers.reasons.push('Phone / WhatsApp contacts');
  }

  // Check Suppliers
  if (normHeaders.some((h) => ['supplier', 'suppliername', 'vendor', 'vendorname', 'payable', 'payables', 'paymentterms'].includes(h))) {
    scores.suppliers.score += 6;
    scores.suppliers.reasons.push('Supplier / Vendor / Payables columns');
  }

  // Check Opening Balances
  if (normHeaders.some((h) => ['accountname', 'openingbalance', 'asofdate', 'startingbalance', 'capital'].includes(h))) {
    scores.opening_balances.score += 6;
    scores.opening_balances.reasons.push('Opening Balance / Account Name columns');
  }

  // Check Staff Payroll
  if (normHeaders.some((h) => ['employeename', 'staffname', 'salary', 'basicsalary', 'monthlysalary', 'ghanacard', 'ssnit', 'tin'].includes(h))) {
    scores.payroll.score += 6;
    scores.payroll.reasons.push('Staff Name / Salary / SSNIT columns');
  }

  // Check Transactions
  if (normHeaders.some((h) => ['transactiondate', 'vendor', 'payee', 'txtype', 'expensecategory'].includes(h))) {
    scores.transactions.score += 4;
    scores.transactions.reasons.push('Transaction Date / Vendor / Flow');
  }

  let topCategory: MigrationCategory = 'inventory';
  let topScore = 0;
  let topReason = 'Default standard catalog';

  for (const [cat, data] of Object.entries(scores) as [MigrationCategory, { score: number; reasons: string[] }][]) {
    if (data.score > topScore) {
      topScore = data.score;
      topCategory = cat;
      topReason = data.reasons.join(', ');
    }
  }

  const confidence = topScore >= 5 ? 95 : topScore >= 3 ? 80 : 60;
  return { category: topCategory, confidence, detectedReason: topReason };
}

export default function MigratePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<MigrationCategory>('inventory');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('GHS');
  const [loadingBusiness, setLoadingBusiness] = useState(true);

  // Multi-Sheet Workbook State
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');

  // File & Parsing State
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>(CATEGORY_CONFIG.inventory.fields);

  // Auto-Classification Badge
  const [autoDetectedInfo, setAutoDetectedInfo] = useState<{ category: MigrationCategory; confidence: number; reason: string } | null>(null);

  // Inventory Auto-pricing margin
  const [targetMargin, setTargetMargin] = useState<number>(25);

  // Import Progress & Stats
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccessStats, setImportSuccessStats] = useState<{ total: number; value: number; entity: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      setLoadingBusiness(true);

      // 1. Check local cached business first
      try {
        const cachedBiz = getCachedBusiness();
        if (cachedBiz?.id) {
          setBusinessId(cachedBiz.id);
          setCurrency(cachedBiz.currency || 'GHS');
        }
      } catch (_e) {}

      // 2. Fetch from Supabase auth
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          const { data: businesses } = await supabase
            .from('businesses')
            .select('id, currency')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1);

          if (businesses && businesses.length > 0) {
            setBusinessId(businesses[0].id);
            setCurrency(businesses[0].currency || 'GHS');
            setCachedBusiness({ id: businesses[0].id, currency: businesses[0].currency || 'GHS' } as any);
          }
        }
      } catch (_e) {}

      setLoadingBusiness(false);
    }
    init();
  }, []);

  const resetUpload = () => {
    setFileName(null);
    setWorkbookRef(null);
    setSheetNames([]);
    setActiveSheet('');
    setRawHeaders([]);
    setRawRows([]);
    setAutoDetectedInfo(null);
    setImportSuccessStats(null);
    setErrorMsg(null);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const autoMatchHeaders = (headers: string[], fields: FieldMapping[]): FieldMapping[] => {
    return fields.map((field) => {
      const aliases = FUZZY_DICTIONARY[field.key] || [field.key];
      const matched = headers.find((h) => {
        const normH = normalizeStr(h);
        if (!normH) return false;
        return aliases.some((a) => {
          const normA = normalizeStr(a);
          return normH === normA || normH.includes(normA) || (normA.length >= 4 && normA.includes(normH));
        });
      });
      return {
        ...field,
        matchedHeader: matched || null,
      };
    });
  };

  const loadSheetData = (wb: XLSX.WorkBook, sName: string) => {
    const ws = wb.Sheets[sName];
    if (!ws) {
      setErrorMsg(`Sheet "${sName}" not found.`);
      return;
    }

    // Convert sheet to array of row arrays
    const rawSheetArray: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawSheetArray || rawSheetArray.length === 0) {
      setErrorMsg(`Sheet "${sName}" is empty.`);
      return;
    }

    // Find the header row (skip top blank rows or single-cell company title banners)
    let headerRowIndex = 0;
    let maxNonEmptyCount = 0;

    for (let r = 0; r < Math.min(10, rawSheetArray.length); r++) {
      const row = rawSheetArray[r] || [];
      const nonEmptyCells = row.filter((c: any) => c !== '' && c !== null && c !== undefined);
      if (nonEmptyCells.length > maxNonEmptyCount && nonEmptyCells.length >= 2) {
        maxNonEmptyCount = nonEmptyCells.length;
        headerRowIndex = r;
      }
    }

    // Build headers from the detected header row
    const headerRow = (rawSheetArray[headerRowIndex] || []).map((c: any, colIdx: number) => {
      const str = String(c || '').trim();
      return str || `Column_${colIdx + 1}`;
    });

    // Build row objects from remaining rows
    const rows: any[] = [];
    for (let r = headerRowIndex + 1; r < rawSheetArray.length; r++) {
      const rowArr = rawSheetArray[r] || [];
      // Skip completely empty rows
      if (rowArr.every((c: any) => c === '' || c === null || c === undefined)) continue;
      const rowObj: Record<string, any> = {};
      headerRow.forEach((h: string, colIdx: number) => {
        rowObj[h] = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
      });
      rows.push(rowObj);
    }

    if (rows.length === 0) {
      setErrorMsg(`Sheet "${sName}" has headers but contains no data rows.`);
      return;
    }

    setRawHeaders(headerRow);
    setRawRows(rows);

    // Run Auto-Classification on the sheet headers
    const classified = autoClassifyHeaders(headerRow);
    setAutoDetectedInfo({
      category: classified.category,
      confidence: classified.confidence,
      reason: classified.detectedReason,
    });

    // Set category to classified category
    setCategory(classified.category);
    const targetFields = CATEGORY_CONFIG[classified.category].fields;
    const autoMapped = autoMatchHeaders(headerRow, targetFields);
    setMappings(autoMapped);
  };

  const handleFileProcess = (file: File) => {
    setErrorMsg(null);
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        setWorkbookRef(workbook);
        setSheetNames(workbook.SheetNames);
        const firstSheet = workbook.SheetNames[0];
        setActiveSheet(firstSheet);
        loadSheetData(workbook, firstSheet);
      } catch (err: any) {
        setErrorMsg('Could not parse spreadsheet: ' + (err.message || 'Invalid file format'));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleSwitchSheet = (sName: string) => {
    if (!workbookRef) return;
    setActiveSheet(sName);
    loadSheetData(workbookRef, sName);
  };

  const handleManualCategoryChange = (newCat: MigrationCategory) => {
    setCategory(newCat);
    const targetFields = CATEGORY_CONFIG[newCat].fields;
    const autoMapped = autoMatchHeaders(rawHeaders, targetFields);
    setMappings(autoMapped);
  };

  const handleManualMappingChange = (key: string, chosenHeader: string) => {
    setMappings((prev) =>
      prev.map((f) => (f.key === key ? { ...f, matchedHeader: chosenHeader === '__none__' ? null : chosenHeader } : f))
    );
  };

  // Build transformed records ready for preview & import
  const parsedRecords = React.useMemo(() => {
    if (rawRows.length === 0) return [];

    const keyToHeader: Record<string, string | null> = {};
    mappings.forEach((m) => {
      keyToHeader[m.key] = m.matchedHeader;
    });

    return rawRows.map((row, index) => {
      // 1. INVENTORY
      if (category === 'inventory') {
        const name = String(row[keyToHeader.name || ''] || '').trim();
        const barcode = String(row[keyToHeader.barcode || ''] || '').trim();
        const quantity = cleanNumber(row[keyToHeader.quantity || '']);
        const unit_cost = cleanNumber(row[keyToHeader.unit_cost || '']);
        let unit_price = cleanNumber(row[keyToHeader.unit_price || '']);

        let autoPriced = false;
        if (unit_price <= 0 && unit_cost > 0) {
          unit_price = Math.round(unit_cost * (1 + targetMargin / 100) * 100) / 100;
          autoPriced = true;
        }

        return {
          _id: index,
          name: name || `Item #${index + 1}`,
          barcode: barcode || null,
          quantity: quantity || 0,
          unit_cost: unit_cost || 0,
          unit_price: unit_price || 0,
          autoPriced,
          isValid: Boolean(name),
        };
      }

      // 2. INVOICES
      if (category === 'invoices') {
        const invNum = String(row[keyToHeader.invoice_number || ''] || '').trim() || `INV-${String(index + 1).padStart(4, '0')}`;
        const custName = String(row[keyToHeader.customer_name || ''] || '').trim();
        const custPhone = String(row[keyToHeader.customer_phone || ''] || '').trim();
        const custEmail = String(row[keyToHeader.customer_email || ''] || '').trim();
        const amount = cleanNumber(row[keyToHeader.amount || '']);
        const dueDate = String(row[keyToHeader.due_date || ''] || '').trim() || new Date().toISOString().slice(0, 10);
        const rawStatus = String(row[keyToHeader.status || ''] || '').toLowerCase();
        const status = rawStatus.includes('paid') || rawStatus.includes('settled') ? 'paid' : rawStatus.includes('draft') ? 'draft' : 'sent';
        const description = String(row[keyToHeader.description || ''] || '').trim();

        return {
          _id: index,
          invoice_number: invNum,
          customer_name: custName || `Client #${index + 1}`,
          customer_phone: custPhone || null,
          customer_email: custEmail || null,
          amount: amount || 0,
          due_date: dueDate,
          status,
          description: description || (custPhone ? `Contact: ${custPhone}` : null),
          isValid: Boolean(custName && amount > 0),
        };
      }

      // 3. FIXED ASSETS
      if (category === 'assets') {
        const name = String(row[keyToHeader.name || ''] || '').trim();
        const assetClass = String(row[keyToHeader.category || ''] || '').trim() || 'Machinery & Equipment';
        const cost = cleanNumber(row[keyToHeader.cost || '']);
        const acqDate = String(row[keyToHeader.acquisition_date || ''] || '').trim() || new Date().toISOString().slice(0, 10);
        const serial = String(row[keyToHeader.serial_number || ''] || '').trim();
        const deprRate = cleanNumber(row[keyToHeader.depreciation_rate || '']) || 20;

        return {
          _id: index,
          name: name || `Asset #${index + 1}`,
          category: assetClass,
          cost: cost || 0,
          acquisition_date: acqDate,
          serial_number: serial || null,
          depreciation_rate: deprRate,
          isValid: Boolean(name && cost > 0),
        };
      }

      // 4. CUSTOMERS
      if (category === 'customers') {
        const name = String(row[keyToHeader.name || ''] || '').trim();
        let phone = String(row[keyToHeader.phone || ''] || '').trim();
        const email = String(row[keyToHeader.email || ''] || '').trim();
        const balance = cleanNumber(row[keyToHeader.balance || '']);
        const notes = String(row[keyToHeader.notes || ''] || '').trim();

        if (phone.startsWith('0') && phone.length === 10) {
          phone = '233' + phone.slice(1);
        }

        return {
          _id: index,
          name: name || `Customer #${index + 1}`,
          phone: phone || null,
          email: email || null,
          balance: balance || 0,
          notes: notes || null,
          isValid: Boolean(name),
        };
      }

      // 5. SUPPLIERS & VENDOR PAYABLES
      if (category === 'suppliers') {
        const name = String(row[keyToHeader.name || ''] || '').trim();
        let phone = String(row[keyToHeader.phone || ''] || '').trim();
        const email = String(row[keyToHeader.email || ''] || '').trim();
        const cat = String(row[keyToHeader.category || ''] || '').trim() || 'Inventory Goods';
        const balance = cleanNumber(row[keyToHeader.balance_owed || '']);
        const terms = String(row[keyToHeader.payment_terms || ''] || '').trim() || 'Net 30';
        const dueDate = String(row[keyToHeader.due_date || ''] || '').trim() || null;
        const notes = String(row[keyToHeader.notes || ''] || '').trim();

        return {
          _id: index,
          name: name || `Supplier #${index + 1}`,
          phone: phone || null,
          email: email || null,
          category: cat,
          balance_owed: balance || 0,
          payment_terms: terms,
          due_date: dueDate,
          notes: notes || null,
          isValid: Boolean(name),
        };
      }

      // 6. OPENING BALANCES
      if (category === 'opening_balances') {
        const accountName = String(row[keyToHeader.account_name || ''] || '').trim();
        const accountType = String(row[keyToHeader.account_type || ''] || '').trim() || 'asset';
        const amount = cleanNumber(row[keyToHeader.amount || '']);
        const asOfDate = String(row[keyToHeader.as_of_date || ''] || '').trim() || new Date().toISOString().slice(0, 10);
        const notes = String(row[keyToHeader.notes || ''] || '').trim();

        return {
          _id: index,
          account_name: accountName || `Account #${index + 1}`,
          account_type: accountType,
          amount: amount || 0,
          as_of_date: asOfDate,
          notes: notes || null,
          isValid: Boolean(accountName && amount > 0),
        };
      }

      // 7. STAFF PAYROLL & ROSTER
      if (category === 'payroll') {
        const name = String(row[keyToHeader.name || ''] || '').trim();
        const role = String(row[keyToHeader.role || ''] || '').trim() || 'employee';
        const salary = cleanNumber(row[keyToHeader.salary || '']);
        const phone = String(row[keyToHeader.phone || ''] || '').trim();
        const email = String(row[keyToHeader.email || ''] || '').trim();
        const branch = String(row[keyToHeader.branch || ''] || '').trim();
        const idTin = String(row[keyToHeader.ghana_card_tin || ''] || '').trim();

        return {
          _id: index,
          name: name || `Staff #${index + 1}`,
          role,
          salary: salary || 0,
          phone: phone || null,
          email: email || null,
          branch: branch || null,
          ghana_card_tin: idTin || null,
          isValid: Boolean(name && salary > 0),
        };
      }

      // 8. TRANSACTIONS
      if (category === 'transactions') {
        const date = String(row[keyToHeader.transaction_date || ''] || '').trim() || new Date().toISOString().slice(0, 10);
        const vendor = String(row[keyToHeader.vendor || ''] || '').trim();
        const rawType = String(row[keyToHeader.type || ''] || '').toLowerCase();
        const type = rawType.includes('rev') || rawType.includes('inc') || rawType.includes('sale') ? 'revenue' : 'expense';
        const amount = cleanNumber(row[keyToHeader.amount || '']);
        const cat = String(row[keyToHeader.category || ''] || '').trim() || 'General Operations';

        return {
          _id: index,
          transaction_date: date,
          vendor: vendor || `Entry #${index + 1}`,
          type,
          amount: amount || 0,
          category: cat,
          isValid: Boolean(vendor && amount > 0),
        };
      }

      return { ...row, _id: index, isValid: true };
    });
  }, [rawRows, mappings, category, targetMargin]);

  // Total Summary Stats
  const validCount = parsedRecords.filter((r) => r.isValid).length;
  const totalValuation = parsedRecords.reduce((sum, r: any) => {
    if (category === 'inventory') return sum + (r.quantity || 0) * (r.unit_price || 0);
    if (category === 'invoices') return sum + (r.amount || 0);
    if (category === 'assets') return sum + (r.cost || 0);
    if (category === 'customers') return sum + (r.balance || 0);
    if (category === 'suppliers') return sum + (r.balance_owed || 0);
    if (category === 'opening_balances') return sum + (r.amount || 0);
    if (category === 'payroll') return sum + (r.salary || 0);
    if (category === 'transactions') return sum + (r.amount || 0);
    return sum;
  }, 0);

  // Execute Batch Ingestion into Supabase
  const handleExecuteImport = async () => {
    if (!businessId) {
      setErrorMsg('No business ID found. Please make sure you are logged in.');
      return;
    }

    const validRecords = parsedRecords.filter((r) => r.isValid);
    if (validRecords.length === 0) {
      setErrorMsg('No valid records found to import. Please verify that required columns are mapped.');
      return;
    }

    setIsImporting(true);
    setImportProgress(10);
    setErrorMsg(null);

    try {
      const chunkSize = 50;

      // 1. INVENTORY
      if (category === 'inventory') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          name: r.name,
          barcode: r.barcode,
          quantity: r.quantity,
          unit_cost: r.unit_cost,
          unit_price: r.unit_price,
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('inventory_items').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Inventory Items' });
      }

      // 2. INVOICES
      if (category === 'invoices') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name,
          customer_email: r.customer_email || null,
          amount: r.amount,
          due_date: r.due_date,
          status: r.status,
          description: r.description || (r.customer_phone ? `Phone: ${r.customer_phone}` : null),
          paid_at: r.status === 'paid' ? new Date().toISOString() : null,
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('invoices').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Invoices' });
      }

      // 3. FIXED ASSETS
      if (category === 'assets') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          transaction_date: r.acquisition_date,
          vendor: `Fixed Asset: ${r.name} (${r.category})`,
          type: 'expense',
          category: `Fixed Assets - ${r.category}`,
          amount: r.cost,
          payment_method: 'bank',
          depreciation_rate: r.depreciation_rate,
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('transactions').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Fixed Assets' });
      }

      // 4. CUSTOMERS & RECEIVABLES
      if (category === 'customers') {
        const customerList = validRecords.map((r: any) => ({
          id: 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          business_id: businessId,
          name: r.name,
          phone: r.phone,
          email: r.email,
          balance: r.balance,
          notes: r.notes,
        }));

        // If customers have outstanding debt, insert receivable entries
        const debtPayload = validRecords
          .filter((r: any) => r.balance > 0)
          .map((r: any) => ({
            business_id: businessId,
            transaction_date: new Date().toISOString().split('T')[0],
            vendor: `Customer: ${r.name}`,
            type: 'revenue',
            category: `Accounts Receivable | Customer: ${r.name} | phone:${r.phone || ''} | email:${r.email || ''}`,
            amount: r.balance,
            payment_method: 'cash',
          }));

        if (debtPayload.length > 0) {
          for (let i = 0; i < debtPayload.length; i += chunkSize) {
            const chunk = debtPayload.slice(i, i + chunkSize);
            const { error } = await supabase.from('transactions').insert(chunk);
            if (error) console.warn('Receivable insert notice:', error.message);
          }
        }

        // Save into local customer cache
        try {
          const existing = JSON.parse(localStorage.getItem('ams:cache_customers_v1') || '[]');
          const merged = [...customerList, ...existing];
          localStorage.setItem('ams:cache_customers_v1', JSON.stringify(merged));
        } catch (_e) {}

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Customer Accounts' });
      }

      // 5. TRANSACTIONS
      if (category === 'transactions') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          transaction_date: r.transaction_date,
          vendor: r.vendor,
          type: r.type,
          category: r.category,
          amount: r.amount,
          payment_method: 'cash',
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('transactions').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Ledger Transactions' });
      }

      // 6. SUPPLIERS & VENDOR PAYABLES (CREDITORS)
      if (category === 'suppliers') {
        const supplierList = validRecords.map((r: any) => ({
          id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          business_id: businessId,
          name: r.name,
          phone: r.phone || null,
          email: r.email || null,
          category: r.category || 'Inventory Goods',
          balance_owed: r.balance_owed || 0,
          payment_terms: r.payment_terms || 'Net 30',
          due_date: r.due_date || null,
          notes: r.notes || null,
        }));

        // Insert into ledger transactions as Short-Term Liabilities
        const payablePayload = validRecords
          .filter((r: any) => r.balance_owed > 0)
          .map((r: any) => ({
            business_id: businessId,
            transaction_date: r.due_date || new Date().toISOString().split('T')[0],
            vendor: `Supplier: ${r.name}`,
            type: 'short_term_liability',
            category: `Accounts Payable | ${r.category} | phone:${r.phone || ''} | terms:${r.payment_terms} | debtType:inventory | due:${r.due_date || ''}`,
            amount: r.balance_owed,
            payment_method: 'cash',
          }));

        if (payablePayload.length > 0) {
          for (let i = 0; i < payablePayload.length; i += chunkSize) {
            const chunk = payablePayload.slice(i, i + chunkSize);
            const { error } = await supabase.from('transactions').insert(chunk);
            if (error) console.warn('Payable insert notice:', error.message);
            setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payablePayload.length) * 100)));
          }
        }

        // Also save into local offline supplier cache
        try {
          const existing = JSON.parse(localStorage.getItem('ams:cache_suppliers_v1') || '[]');
          const merged = [...supplierList, ...existing];
          localStorage.setItem('ams:cache_suppliers_v1', JSON.stringify(merged));
        } catch (_e) {}

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Suppliers & Creditor Accounts' });
      }

      // 7. OPENING BALANCES
      if (category === 'opening_balances') {
        const payload = validRecords.map((r: any) => {
          let txType = 'current_asset';
          const typeLower = String(r.account_type || '').toLowerCase();
          if (typeLower.includes('liability') || typeLower.includes('loan') || typeLower.includes('debt')) {
            txType = 'short_term_liability';
          } else if (typeLower.includes('equity') || typeLower.includes('capital')) {
            txType = 'revenue';
          } else if (typeLower.includes('fixed') || typeLower.includes('asset')) {
            txType = 'fixed_asset';
          }

          return {
            business_id: businessId,
            transaction_date: r.as_of_date || new Date().toISOString().split('T')[0],
            vendor: `Opening Balance: ${r.account_name}`,
            type: txType,
            category: 'Opening Balances',
            amount: r.amount,
            payment_method: r.account_name?.toLowerCase().includes('bank') ? 'bank' : 'cash',
          };
        });

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('transactions').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Opening Balance Accounts' });
      }

      // 8. STAFF PAYROLL & ROSTER
      if (category === 'payroll') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          name: r.name,
          role: r.role ? r.role.toLowerCase() : 'employee',
          salary: r.salary || 0,
          phone: r.phone || null,
          email: r.email || null,
          branch: r.branch || null,
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('business_members').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Staff Members & Payroll' });
      }

      setImportProgress(100);
    } catch (err: any) {
      setErrorMsg('Import failed: ' + (err.message || 'Database error occurred.'));
    } finally {
      setIsImporting(false);
    }
  };

  // Download Sample Spreadsheet Templates
  const handleDownloadTemplate = (type: MigrationCategory) => {
    let sampleData: any[] = [];
    let tFileName = 'AMS_Template.xlsx';

    if (type === 'inventory') {
      tFileName = 'AMS_Inventory_Template.xlsx';
      sampleData = [
        { 'Item Name': 'Basmati Rice 5kg', Barcode: '8901234567890', Quantity: 50, 'Unit Cost': 85.00, 'Selling Price': 110.00 },
        { 'Item Name': 'Cooking Oil 1L', Barcode: '8901234567891', Quantity: 100, 'Unit Cost': 28.00, 'Selling Price': 35.00 },
        { 'Item Name': 'Sugar 1kg', Barcode: '8901234567892', Quantity: 200, 'Unit Cost': 18.00, 'Selling Price': 22.50 },
      ];
    } else if (type === 'invoices') {
      tFileName = 'AMS_Invoices_Template.xlsx';
      sampleData = [
        { 'Invoice #': 'INV-1001', 'Customer Name': 'Alpha Supermarket', Phone: '0551234567', Amount: 4500.00, 'Due Date': '2026-09-15', Status: 'sent', Description: '50 Boxes Cooking Oil' },
        { 'Invoice #': 'INV-1002', 'Customer Name': 'Kofi Enterprise', Phone: '0249876543', Amount: 1250.00, 'Due Date': '2026-08-30', Status: 'paid', Description: 'Rice & Provisions' },
      ];
    } else if (type === 'assets') {
      tFileName = 'AMS_Fixed_Assets_Template.xlsx';
      sampleData = [
        { 'Asset Description': 'Delivery Van (Toyota Hilux)', 'Asset Class': 'Vehicles', 'Purchase Cost': 145000.00, 'Acquisition Date': '2025-06-15', 'Serial / Tag #': 'GR-1234-25', 'Depreciation %': 20 },
        { 'Asset Description': 'Heavy Duty Generator 25kVA', 'Asset Class': 'Machinery', 'Purchase Cost': 45000.00, 'Acquisition Date': '2025-08-10', 'Serial / Tag #': 'GEN-8890', 'Depreciation %': 15 },
      ];
    } else if (type === 'customers') {
      tFileName = 'AMS_Customer_Debt_Template.xlsx';
      sampleData = [
        { 'Customer Name': 'Nana Kwame Provisions', Phone: '0244112233', Email: 'kwame@gmail.com', 'Outstanding Debt': 3400.00, Notes: 'Madina Market Stall #4' },
        { 'Customer Name': 'Grace Retail Ventures', Phone: '0555778899', Email: 'grace@retail.com', 'Outstanding Debt': 1200.00, Notes: 'Credit terms 14 days' },
      ];
    } else if (type === 'suppliers') {
      tFileName = 'AMS_Suppliers_Template.xlsx';
      sampleData = [
        { 'Supplier Name': 'Ghana Rubber Products Ltd', Phone: '0302123456', Email: 'sales@ghanarubber.com', Category: 'Raw Materials', 'Debt Owed': 18500.00, 'Payment Terms': 'Net 30', 'Due Date': '2026-09-30', Notes: 'North Industrial Area' },
        { 'Supplier Name': 'Olam Agri Ghana', Phone: '0302987654', Email: 'orders@olam.com', Category: 'Inventory Goods', 'Debt Owed': 45000.00, 'Payment Terms': 'Net 60', 'Due Date': '2026-10-15', Notes: 'Bulk grains supplier' },
      ];
    } else if (type === 'opening_balances') {
      tFileName = 'AMS_Opening_Balances_Template.xlsx';
      sampleData = [
        { 'Account Name': 'Cash Till / Vault', 'Account Type': 'asset', Amount: 15000.00, 'As-Of Date': '2026-08-01', Notes: 'Main Store Physical Cash' },
        { 'Account Name': 'GCB Current Account', 'Account Type': 'asset', Amount: 85000.00, 'As-Of Date': '2026-08-01', Notes: 'Acc #1041130009988' },
        { 'Account Name': 'MTN MoMo Merchant Wallet', 'Account Type': 'asset', Amount: 12400.00, 'As-Of Date': '2026-08-01', Notes: 'Merchant ID 889900' },
        { 'Account Name': 'Owner Initial Capital Equity', 'Account Type': 'equity', Amount: 112400.00, 'As-Of Date': '2026-08-01', Notes: 'Paid-in Capital' },
      ];
    } else if (type === 'payroll') {
      tFileName = 'AMS_Payroll_Roster_Template.xlsx';
      sampleData = [
        { 'Employee Name': 'Emmanuel Mensah', Role: 'Manager', Salary: 4500.00, Phone: '0551112233', Email: 'emmanuel@biz.com', Branch: 'Accra Branch', 'Ghana Card / TIN': 'GHA-712345678-9' },
        { 'Employee Name': 'Akosua Darko', Role: 'Cashier', Salary: 2200.00, Phone: '0244998877', Email: 'akosua@biz.com', Branch: 'Accra Branch', 'Ghana Card / TIN': 'GHA-890123456-1' },
      ];
    } else if (type === 'transactions') {
      tFileName = 'AMS_Transactions_Template.xlsx';
      sampleData = [
        { Date: '2026-08-05', 'Vendor / Description': 'Electricity Company of Ghana', Type: 'expense', Amount: 1450.00, Category: 'Utilities' },
        { Date: '2026-08-10', 'Vendor / Description': 'Walk-in Retail Cash Sales', Type: 'revenue', Amount: 8900.00, Category: 'Direct Sales' },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, tFileName);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-surface1 border border-border p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h1 className="text-2xl font-black text-textPrimary tracking-tight">Universal Data Migration Engine</h1>
          </div>
          <p className="text-xs text-textSecondary mt-1">
            Intelligently reads, categorizes, and ingests <strong>Invoices</strong>, <strong>Fixed Assets</strong>, <strong>Stock</strong>, <strong>Suppliers</strong>, <strong>Payroll</strong>, and <strong>Customer Debt Books</strong> into their exact sections in AMS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate(category)}
            className="px-3.5 py-2 text-xs font-bold bg-surface2 hover:bg-surface0 border border-border text-textPrimary rounded-xl transition flex items-center gap-1.5 shadow-sm"
          >
            <span>📥</span> Download {CATEGORY_CONFIG[category].label} Template
          </button>
        </div>
      </div>

      {/* Migration Category Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
        {(Object.keys(CATEGORY_CONFIG) as MigrationCategory[]).map((catKey) => {
          const cfg = CATEGORY_CONFIG[catKey];
          const isSelected = category === catKey;
          return (
            <button
              key={catKey}
              onClick={() => handleManualCategoryChange(catKey)}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? 'bg-textPrimary text-surface0 shadow-sm'
                  : 'text-textSecondary hover:text-textPrimary hover:bg-surface2'
              }`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* AUTO-DETECTED BANNER */}
      {autoDetectedInfo && !importSuccessStats && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🪄</span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                  AI Auto-Classification: {CATEGORY_CONFIG[autoDetectedInfo.category].label}
                </h4>
                <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-500 text-black rounded-full">
                  {autoDetectedInfo.confidence}% Match
                </span>
              </div>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Identified based on: <strong>{autoDetectedInfo.reason}</strong> &rarr; Target:{' '}
                <em>{CATEGORY_CONFIG[autoDetectedInfo.category].destination}</em>
              </p>
            </div>
          </div>

          <div className="text-xs text-textSecondary">
            Wrong category? Click any tab above to switch manually.
          </div>
        </div>
      )}

      {/* MULTI-SHEET WORKBOOK TABS (If Excel file has multiple tabs) */}
      {sheetNames.length > 1 && !importSuccessStats && (
        <div className="bg-surface1 border border-border p-4 rounded-2xl space-y-2">
          <p className="text-xs font-bold text-textPrimary">📑 Multi-Sheet Workbook Detected ({sheetNames.length} Sheets)</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {sheetNames.map((sName) => (
              <button
                key={sName}
                onClick={() => handleSwitchSheet(sName)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  activeSheet === sName ? 'bg-emerald-500 text-black' : 'bg-surface2 text-textSecondary hover:text-textPrimary'
                }`}
              >
                📄 {sName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SUCCESS BANNER */}
      {importSuccessStats && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center font-black text-lg">
                ✓
              </div>
              <div>
                <h3 className="text-base font-black text-emerald-400">Migration Completed Successfully!</h3>
                <p className="text-xs text-emerald-300/80">
                  Ingested <strong>{importSuccessStats.total} {importSuccessStats.entity}</strong> directly into your system.
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Total Value Ingested</p>
              <p className="text-xl font-black text-emerald-300">
                {currency} {importSuccessStats.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            {category === 'inventory' && (
              <Link href="/inventory" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View in Inventory &rarr;
              </Link>
            )}
            {category === 'invoices' && (
              <Link href="/invoices" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Invoices &rarr;
              </Link>
            )}
            {category === 'assets' && (
              <Link href="/reports" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Assets &amp; Balance Sheet &rarr;
              </Link>
            )}
            {category === 'customers' && (
              <Link href="/customers" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Customer Accounts &rarr;
              </Link>
            )}
            {category === 'suppliers' && (
              <Link href="/suppliers" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Suppliers &rarr;
              </Link>
            )}
            {category === 'opening_balances' && (
              <Link href="/reports" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Balance Sheet &rarr;
              </Link>
            )}
            {category === 'payroll' && (
              <Link href="/team" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View Team &amp; Payroll &rarr;
              </Link>
            )}
            {category === 'transactions' && (
              <Link href="/bookkeeping" className="px-4 py-2 text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition shadow">
                View General Ledger &rarr;
              </Link>
            )}
            <button
              onClick={resetUpload}
              className="px-4 py-2 text-xs font-bold bg-surface2 hover:bg-surface0 border border-border text-textPrimary rounded-xl transition"
            >
              Import Another Sheet or File
            </button>
          </div>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center justify-between">
          <p className="text-xs font-bold text-rose-400">⚠️ {errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-400 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* STEP 1: DROPZONE IF NO FILE LOADED */}
      {!fileName && !importSuccessStats && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFileProcess(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-emerald-500/60 bg-surface1 hover:bg-surface2/60 rounded-3xl p-12 text-center cursor-pointer transition flex flex-col items-center justify-center gap-4 group"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
            accept=".xlsx,.xls,.csv,.tsv"
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-surface2 group-hover:bg-emerald-500/20 text-textPrimary group-hover:text-emerald-400 flex items-center justify-center text-2xl transition shadow-inner">
            📂
          </div>

          <div>
            <h3 className="text-base font-black text-textPrimary">
              Drop your spreadsheet here — AMS will auto-detect its category
            </h3>
            <p className="text-xs text-textSecondary mt-1">
              Supports <strong>Invoices</strong>, <strong>Fixed Assets</strong>, <strong>Stock</strong>, <strong>Suppliers</strong>, <strong>Payroll</strong>, and <strong>Customer Debt Books</strong> (.xlsx, .csv, .xls)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 text-xs font-black bg-textPrimary text-surface0 rounded-lg shadow-sm">
              Browse Files 📁
            </span>
          </div>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING & PREVIEW IF FILE LOADED */}
      {fileName && !importSuccessStats && (
        <div className="space-y-6">
          {/* File summary bar */}
          <div className="bg-surface1 border border-border p-4 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📄</span>
              <div>
                <p className="text-xs font-bold text-textPrimary">{fileName} {activeSheet ? `(Sheet: ${activeSheet})` : ''}</p>
                <p className="text-[11px] text-textSecondary">
                  {rawRows.length} rows detected • Destination: <strong>{CATEGORY_CONFIG[category].destination}</strong>
                </p>
              </div>
            </div>

            {category === 'inventory' && (
              <div className="flex items-center gap-2 bg-surface2 px-3 py-1.5 rounded-xl border border-border">
                <span className="text-xs text-textSecondary font-medium">Auto-Price Missing Sell Prices:</span>
                <div className="flex items-center gap-1">
                  {[15, 25, 35, 50].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTargetMargin(m)}
                      className={`px-2 py-0.5 text-[11px] font-black rounded-md transition ${
                        targetMargin === m ? 'bg-emerald-500 text-black' : 'bg-surface0 text-textSecondary hover:text-textPrimary'
                      }`}
                    >
                      +{m}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={resetUpload}
              className="text-xs font-bold text-rose-400 hover:underline self-start md:self-auto"
            >
              Choose different file
            </button>
          </div>

          {/* COLUMN AUTO-MATCHER CARDS */}
          <div className="bg-surface1 border border-border p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-textPrimary uppercase tracking-wider">
                1. Verify {CATEGORY_CONFIG[category].label} Column Mappings
              </h3>
              <span className="text-xs text-emerald-400 font-bold">
                ✓ Headers Auto-Matched
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {mappings.map((f) => (
                <div key={f.key} className="bg-surface2 border border-border p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-textPrimary">{f.label}</span>
                    {f.required && <span className="text-[10px] text-rose-400 font-black">REQ</span>}
                  </div>

                  <select
                    value={f.matchedHeader || '__none__'}
                    onChange={(e) => handleManualMappingChange(f.key, e.target.value)}
                    className="w-full bg-surface0 border border-border text-xs text-textPrimary rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 outline-none"
                  >
                    <option value="__none__">-- Not Mapped --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* LIVE PREVIEW TABLE */}
          <div className="bg-surface1 border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface2/50">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-textPrimary uppercase tracking-wider">
                  2. Live Migration Preview
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-black bg-emerald-500/20 text-emerald-400 rounded-md">
                  {validCount} Ready to Ingest
                </span>
              </div>

              <div className="text-xs text-textSecondary">
                Total Valuation: <strong className="text-textPrimary">{currency} {totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface2 text-textSecondary uppercase text-[10px] font-black tracking-wider sticky top-0">
                  <tr>
                    <th className="p-3">Status</th>
                    {category === 'inventory' && (
                      <>
                        <th className="p-3">Item Name</th>
                        <th className="p-3">Barcode / SKU</th>
                        <th className="p-3 text-right">Quantity</th>
                        <th className="p-3 text-right">Unit Cost</th>
                        <th className="p-3 text-right">Selling Price</th>
                      </>
                    )}
                    {category === 'invoices' && (
                      <>
                        <th className="p-3">Invoice #</th>
                        <th className="p-3">Customer / Client</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3">Status</th>
                      </>
                    )}
                    {category === 'assets' && (
                      <>
                        <th className="p-3">Asset Description</th>
                        <th className="p-3">Asset Class</th>
                        <th className="p-3">Acquisition Date</th>
                        <th className="p-3 text-right">Purchase Cost</th>
                        <th className="p-3 text-right">Depr. Rate</th>
                      </>
                    )}
                    {category === 'customers' && (
                      <>
                        <th className="p-3">Customer Name</th>
                        <th className="p-3">WhatsApp / Phone</th>
                        <th className="p-3">Email</th>
                        <th className="p-3 text-right">Outstanding Debt</th>
                        <th className="p-3">Notes</th>
                      </>
                    )}
                    {category === 'suppliers' && (
                      <>
                        <th className="p-3">Supplier Name</th>
                        <th className="p-3">Phone / WhatsApp</th>
                        <th className="p-3">Category</th>
                        <th className="p-3 text-right">Debt Owed (Liability)</th>
                        <th className="p-3">Payment Terms</th>
                        <th className="p-3">Due Date</th>
                      </>
                    )}
                    {category === 'opening_balances' && (
                      <>
                        <th className="p-3">Account Name</th>
                        <th className="p-3">Account Type</th>
                        <th className="p-3 text-right">Opening Amount</th>
                        <th className="p-3">As-Of Date</th>
                        <th className="p-3">Notes</th>
                      </>
                    )}
                    {category === 'payroll' && (
                      <>
                        <th className="p-3">Employee Name</th>
                        <th className="p-3">Role / Designation</th>
                        <th className="p-3 text-right">Monthly Salary</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Ghana Card / SSNIT</th>
                      </>
                    )}
                    {category === 'transactions' && (
                      <>
                        <th className="p-3">Date</th>
                        <th className="p-3">Vendor / Description</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Amount</th>
                        <th className="p-3">Category</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {parsedRecords.slice(0, 50).map((r: any) => (
                    <tr key={r._id} className="hover:bg-surface2/40 transition">
                      <td className="p-3">
                        {r.isValid ? (
                          <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-500/20 text-emerald-400 rounded">
                            {r.autoPriced ? `✓ Auto-Priced (+${targetMargin}%)` : '✓ Ready'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-black bg-rose-500/20 text-rose-400 rounded">
                            Incomplete
                          </span>
                        )}
                      </td>

                      {category === 'inventory' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.name}</td>
                          <td className="p-3 text-textSecondary font-mono text-[11px]">{r.barcode || '—'}</td>
                          <td className="p-3 text-right font-black text-textPrimary">{r.quantity}</td>
                          <td className="p-3 text-right text-textSecondary">{currency} {r.unit_cost.toFixed(2)}</td>
                          <td className="p-3 text-right font-black text-emerald-400">{currency} {r.unit_price.toFixed(2)}</td>
                        </>
                      )}

                      {category === 'invoices' && (
                        <>
                          <td className="p-3 text-textPrimary font-mono font-bold">{r.invoice_number}</td>
                          <td className="p-3 text-textPrimary font-bold">{r.customer_name}</td>
                          <td className="p-3 text-textSecondary">{r.due_date}</td>
                          <td className="p-3 text-right font-black text-emerald-400">{currency} {r.amount.toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase ${r.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {category === 'assets' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.name}</td>
                          <td className="p-3 text-textSecondary">{r.category}</td>
                          <td className="p-3 text-textSecondary">{r.acquisition_date}</td>
                          <td className="p-3 text-right font-black text-textPrimary">{currency} {r.cost.toFixed(2)}</td>
                          <td className="p-3 text-right text-emerald-400 font-bold">{r.depreciation_rate}% / yr</td>
                        </>
                      )}

                      {category === 'customers' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.name}</td>
                          <td className="p-3 text-textSecondary font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3 text-textSecondary">{r.email || '—'}</td>
                          <td className="p-3 text-right font-black text-rose-400">{currency} {r.balance.toFixed(2)}</td>
                          <td className="p-3 text-textSecondary">{r.notes || '—'}</td>
                        </>
                      )}

                      {category === 'suppliers' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.name}</td>
                          <td className="p-3 text-textSecondary font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3 text-textSecondary">{r.category || 'General'}</td>
                          <td className="p-3 text-right font-black text-red-500">{currency} {Number(r.balance_owed || 0).toFixed(2)}</td>
                          <td className="p-3 text-textSecondary">{r.payment_terms || 'Net 30'}</td>
                          <td className="p-3 text-textSecondary">{r.due_date || '—'}</td>
                        </>
                      )}

                      {category === 'opening_balances' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.account_name}</td>
                          <td className="p-3 text-textSecondary uppercase font-mono text-[10px]">{r.account_type}</td>
                          <td className="p-3 text-right font-black text-emerald-400">{currency} {Number(r.amount || 0).toFixed(2)}</td>
                          <td className="p-3 text-textSecondary">{r.as_of_date || '—'}</td>
                          <td className="p-3 text-textSecondary">{r.notes || '—'}</td>
                        </>
                      )}

                      {category === 'payroll' && (
                        <>
                          <td className="p-3 text-textPrimary font-bold">{r.name}</td>
                          <td className="p-3 text-textSecondary">{r.role}</td>
                          <td className="p-3 text-right font-black text-textPrimary">{currency} {Number(r.salary || 0).toFixed(2)}</td>
                          <td className="p-3 text-textSecondary font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3 text-textSecondary font-mono text-[11px]">{r.ghana_card_tin || '—'}</td>
                        </>
                      )}

                      {category === 'transactions' && (
                        <>
                          <td className="p-3 text-textSecondary">{r.transaction_date}</td>
                          <td className="p-3 text-textPrimary font-bold">{r.vendor}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase ${r.type === 'revenue' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                              {r.type}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black text-textPrimary">{currency} {r.amount.toFixed(2)}</td>
                          <td className="p-3 text-textSecondary">{r.category}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRecords.length > 50 && (
              <div className="p-3 bg-surface2 text-center text-xs text-textSecondary border-t border-border">
                Showing first 50 rows of {parsedRecords.length} records. All rows will be ingested.
              </div>
            )}
          </div>

          {/* STEP 3: EXECUTE BUTTON */}
          <div className="bg-surface1 border border-border p-6 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
            <div>
              <h4 className="text-sm font-black text-textPrimary">Ready to ingest {validCount} {CATEGORY_CONFIG[category].label} records?</h4>
              <p className="text-xs text-textSecondary mt-0.5">
                Destination: <strong className="text-emerald-400">{CATEGORY_CONFIG[category].destination}</strong>
              </p>
            </div>

            <button
              onClick={handleExecuteImport}
              disabled={isImporting || validCount === 0}
              className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black text-sm rounded-xl transition shadow-lg flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Ingesting... {importProgress}%</span>
                </>
              ) : (
                <>
                  <span>🚀 Ingest into {CATEGORY_CONFIG[category].label} ({validCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* UNIVERSAL FINANCIAL DOCUMENT EXPORTATION HUB */}
      <div className="bg-surface1 border border-border p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h3 className="text-base font-black text-textPrimary tracking-tight">Universal Financial Document Exportation Hub</h3>
            </div>
            <p className="text-xs text-textSecondary mt-0.5">
              Export complete structured accounting schedules, debt registries, and general ledger packs formatted for Excel, CSV, and audits.
            </p>
          </div>
          <Link
            href="/reports"
            className="px-4 py-2 text-xs font-bold bg-surface2 hover:bg-surface0 border border-border text-textPrimary rounded-xl transition self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>📈 View Full Financial Reports →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
