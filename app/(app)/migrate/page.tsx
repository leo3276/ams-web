'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export type MigrationCategory = 'inventory' | 'invoices' | 'assets' | 'customers' | 'transactions';

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
    destination: 'Fixed Assets & Capital Allowances (transactions & tax)',
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
    destination: 'Customer Directory & Accounts (customers)',
    fields: [
      { key: 'name', label: 'Customer Name', required: true, type: 'text', matchedHeader: null },
      { key: 'phone', label: 'WhatsApp / Phone Number', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'balance', label: 'Outstanding Debt / Balance', required: false, type: 'number', matchedHeader: null },
      { key: 'notes', label: 'Location / Notes', required: false, type: 'text', matchedHeader: null },
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
  name: ['name', 'item', 'itemname', 'product', 'productname', 'description', 'desc', 'title', 'goods', 'asset', 'assetname', 'equipment'],
  barcode: ['barcode', 'sku', 'code', 'itemcode', 'upc', 'ean', 'partnumber', 'serial', 'id'],
  quantity: ['quantity', 'qty', 'stock', 'available', 'units', 'count', 'qtyavailable', 'inventory', 'qtyonhand', 'pieces'],
  unit_cost: ['unitcost', 'cost', 'costprice', 'buyprice', 'buyingprice', 'purchaseprice', 'unitcostprice', 'costperunit', 'buying'],
  unit_price: ['unitprice', 'price', 'sellingprice', 'sellprice', 'retail', 'salesprice', 'retailprice', 'amount', 'selling', 'rate'],
  invoice_number: ['invoicenumber', 'invnumber', 'invno', 'invoiceno', 'billno', 'number', 'ref', 'reference', 'receiptno', 'invoiceid'],
  customer_name: ['customername', 'customer', 'client', 'clientname', 'billto', 'account', 'payer', 'party', 'buyer'],
  customer_phone: ['phone', 'phonenumber', 'whatsapp', 'mobile', 'cell', 'tel', 'contact', 'momo', 'telephone'],
  phone: ['phone', 'phonenumber', 'whatsapp', 'mobile', 'cell', 'tel', 'contact', 'momo', 'telephone'],
  email: ['email', 'emailaddress', 'mail'],
  amount: ['amount', 'invoicetotal', 'total', 'sum', 'value', 'grandtotal', 'netamount', 'cost', 'price'],
  cost: ['purchasecost', 'cost', 'costprice', 'value', 'amount', 'originalcost', 'price', 'purchaseprice', 'buyingcost'],
  due_date: ['duedate', 'due', 'expiry', 'paymentdue', 'date', 'invoicedate'],
  status: ['status', 'paymentstatus', 'state', 'paidstatus', 'condition'],
  description: ['description', 'desc', 'items', 'service', 'particulars', 'memo', 'notes', 'details'],
  balance: ['balance', 'debt', 'amountdue', 'outstanding', 'receivable', 'owed', 'totaldue', 'balanceowed'],
  notes: ['notes', 'address', 'location', 'remarks', 'comment', 'memo'],
  category: ['category', 'group', 'dept', 'classification', 'assetclass', 'type'],
  acquisition_date: ['purchasedate', 'acquisitiondate', 'date', 'acquired', 'boughton', 'startdate', 'installationdate'],
  serial_number: ['serialnumber', 'serial', 'chassis', 'tag', 'assetid', 'vin', 'serialno'],
  depreciation_rate: ['depreciationrate', 'depreciation', 'rate', 'depreciationpercent', 'depr', 'annualdepr'],
  transaction_date: ['date', 'transactiondate', 'txdate', 'recordedat', 'day'],
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
  if (normHeaders.some((h) => ['customername', 'debt', 'amountdue', 'outstanding', 'balanceowed'].includes(h))) {
    scores.customers.score += 5;
    scores.customers.reasons.push('Customer Debt / Balance');
  }
  if (normHeaders.some((h) => ['whatsapp', 'phonenumber', 'momo'].includes(h)) && !normHeaders.includes('unitprice')) {
    scores.customers.score += 3;
    scores.customers.reasons.push('Phone / WhatsApp contacts');
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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoadingBusiness(false);
        return;
      }
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (businesses && businesses.length > 0) {
        setBusinessId(businesses[0].id);
        setCurrency(businesses[0].currency || 'GHS');
      }
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
        return aliases.some((a) => normH.includes(a) || a.includes(normH));
      });
      return {
        ...field,
        matchedHeader: matched || null,
      };
    });
  };

  const loadSheetData = (wb: XLSX.WorkBook, sName: string) => {
    const ws = wb.Sheets[sName];
    const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!json || json.length === 0) {
      setErrorMsg(`Sheet "${sName}" is empty.`);
      return;
    }

    const headers = Object.keys(json[0]);
    setRawHeaders(headers);
    setRawRows(json);

    // Run Auto-Classification on the sheet headers
    const classified = autoClassifyHeaders(headers);
    setAutoDetectedInfo({
      category: classified.category,
      confidence: classified.confidence,
      reason: classified.detectedReason,
    });

    // Set category to classified category
    setCategory(classified.category);
    const targetFields = CATEGORY_CONFIG[classified.category].fields;
    const autoMapped = autoMatchHeaders(headers, targetFields);
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

      if (category === 'invoices') {
        const invNum = String(row[keyToHeader.invoice_number || ''] || '').trim() || `INV-${String(index + 1).padStart(4, '0')}`;
        const custName = String(row[keyToHeader.customer_name || ''] || '').trim();
        const custPhone = String(row[keyToHeader.customer_phone || ''] || '').trim();
        const amount = cleanNumber(row[keyToHeader.amount || '']);
        const dueDate = String(row[keyToHeader.due_date || ''] || '').trim() || new Date().toISOString().slice(0, 10);
        let rawStatus = String(row[keyToHeader.status || ''] || '').toLowerCase();
        const status = rawStatus.includes('paid') || rawStatus.includes('settled') ? 'paid' : rawStatus.includes('draft') ? 'draft' : 'sent';
        const description = String(row[keyToHeader.description || ''] || '').trim();

        return {
          _id: index,
          invoice_number: invNum,
          customer_name: custName || `Client #${index + 1}`,
          customer_phone: custPhone || null,
          amount: amount || 0,
          due_date: dueDate,
          status,
          description: description || null,
          isValid: Boolean(custName && amount > 0),
        };
      }

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

      return row;
    });
  }, [rawRows, mappings, category, targetMargin]);

  // Total Summary Stats
  const validCount = parsedRecords.filter((r) => r.isValid).length;
  const totalValuation = parsedRecords.reduce((sum, r: any) => {
    if (category === 'inventory') return sum + (r.quantity || 0) * (r.unit_price || 0);
    if (category === 'invoices') return sum + (r.amount || 0);
    if (category === 'assets') return sum + (r.cost || 0);
    if (category === 'customers') return sum + (r.balance || 0);
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
      setErrorMsg('No valid records found to import.');
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
          customer_phone: r.customer_phone,
          amount: r.amount,
          due_date: r.due_date,
          status: r.status,
          description: r.description,
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
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('transactions').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

        setImportSuccessStats({ total: validRecords.length, value: totalValuation, entity: 'Fixed Assets' });
      }

      // 4. CUSTOMERS
      if (category === 'customers') {
        const payload = validRecords.map((r: any) => ({
          business_id: businessId,
          name: r.name,
          phone: r.phone,
          email: r.email,
          notes: r.notes ? `${r.notes}${r.balance > 0 ? ` | Migrated Debt: ${currency} ${r.balance.toFixed(2)}` : ''}` : (r.balance > 0 ? `Migrated Debt: ${currency} ${r.balance.toFixed(2)}` : null),
        }));

        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error } = await supabase.from('customers').insert(chunk);
          if (error) throw error;
          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / payload.length) * 100)));
        }

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
        { 'Item Name': 'Basmati Rice 5kg', 'Barcode / SKU': '600123456789', 'Quantity Available': 45, 'Unit Cost': 120.0, 'Selling Price': 155.0 },
        { 'Item Name': 'Sunflower Cooking Oil 1L', 'Barcode / SKU': '600987654321', 'Quantity Available': 80, 'Unit Cost': 42.5, 'Selling Price': 55.0 },
      ];
    } else if (type === 'invoices') {
      tFileName = 'AMS_Invoices_Template.xlsx';
      sampleData = [
        { 'Invoice #': 'INV-0012', 'Customer Name': 'ABC Construction Ltd', 'Phone / WhatsApp': '0244123456', 'Invoice Total': 4500.0, 'Due Date': '2026-09-01', 'Status': 'sent', 'Description': 'Cement supply 50 bags' },
        { 'Invoice #': 'INV-0013', 'Customer Name': 'Kwame Mensah', 'Phone / WhatsApp': '0559876543', 'Invoice Total': 850.0, 'Due Date': '2026-08-15', 'Status': 'paid', 'Description': 'Paint & accessories' },
      ];
    } else if (type === 'assets') {
      tFileName = 'AMS_Fixed_Assets_Template.xlsx';
      sampleData = [
        { 'Asset Description': 'Toyota Hilux Delivery Van', 'Asset Class': 'Motor Vehicles', 'Purchase Cost': 185000.0, 'Purchase Date': '2025-03-10', 'Serial / Chassis #': 'TH-2025-8891', 'Annual Depreciation %': 20 },
        { 'Asset Description': 'Industrial Generator 25kVA', 'Asset Class': 'Plant & Machinery', 'Purchase Cost': 42000.0, 'Purchase Date': '2024-11-05', 'Serial / Chassis #': 'GEN-8832', 'Annual Depreciation %': 15 },
        { 'Asset Description': 'Dell Workstation Computers (5x)', 'Asset Class': 'IT Equipment', 'Purchase Cost': 35000.0, 'Purchase Date': '2025-06-20', 'Serial / Chassis #': 'DELL-CORP', 'Annual Depreciation %': 33.3 },
      ];
    } else if (type === 'customers') {
      tFileName = 'AMS_Customer_Debt_Template.xlsx';
      sampleData = [
        { 'Customer Name': 'Kwame Mensah', 'Phone Number': '0244123456', 'Email': 'kwame@example.com', 'Outstanding Debt': 450.0, 'Address / Location': 'Osu Oxford Street' },
        { 'Customer Name': 'Akosua Serwaa', 'Phone Number': '0559876543', 'Email': '', 'Outstanding Debt': 1200.0, 'Address / Location': 'Madina Market' },
      ];
    } else if (type === 'transactions') {
      tFileName = 'AMS_General_Ledger_Template.xlsx';
      sampleData = [
        { 'Date': '2026-08-01', 'Vendor / Description': 'Electricity Company (ECG Bill)', 'Type': 'expense', 'Amount': 850.0, 'Category': 'Utilities' },
        { 'Date': '2026-08-02', 'Vendor / Description': 'Shop Retail Cash Sales', 'Type': 'revenue', 'Amount': 3450.0, 'Category': 'Daily Sales' },
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
            Intelligently reads, categorizes, and ingests <strong>Invoices</strong>, <strong>Fixed Assets</strong>, <strong>Stock</strong>, and <strong>Customer Debt Books</strong> into their exact sections in AMS.
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
              Supports <strong>Invoices</strong>, <strong>Fixed Assets</strong>, <strong>Stock</strong>, and <strong>Customer Debt Books</strong> (.xlsx, .csv, .xls)
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
    </div>
  );
}
