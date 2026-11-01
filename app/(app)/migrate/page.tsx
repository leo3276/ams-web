'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  getCachedBusiness,
  getCachedInventory,
  setCachedInventory,
  getCachedInvoices,
  setCachedInvoices,
  getCachedTransactions,
  setCachedTransactions,
  getCachedCustomers,
  setCachedCustomers,
  getCachedSuppliers,
  setCachedSuppliers,
  resolveActiveBusiness,
  generateUUID,
  isUUID,
} from '@/lib/offlineStore';
import { logAuditEvent } from '@/lib/auditLogger';
import { Icon } from '@/components/Icons';

export type MigrationCategory =
  | 'sales'
  | 'expenses'
  | 'inventory'
  | 'invoices'
  | 'customers'
  | 'suppliers'
  | 'assets'
  | 'opening_balances'
  | 'payroll'
  | 'transactions';

interface FieldMapping {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'number';
  matchedHeader: string | null;
}

const CATEGORY_CONFIG: Record<
  MigrationCategory,
  { label: string; shortLabel: string; icon: string; description: string; destination: string; fields: FieldMapping[] }
> = {
  inventory: {
    label: 'Inventory & Stock',
    shortLabel: 'Inventory',
    icon: 'package',
    description: 'Product catalog, barcodes/SKUs, stock quantities, unit buying costs, and selling prices.',
    destination: 'Inventory Catalog & Opening Stock (Balance Sheet Current Assets)',
    fields: [
      { key: 'name', label: 'Item Name / Description', required: true, type: 'text', matchedHeader: null },
      { key: 'barcode', label: 'Barcode / SKU / Code', required: false, type: 'text', matchedHeader: null },
      { key: 'quantity', label: 'Quantity in Stock', required: true, type: 'number', matchedHeader: null },
      { key: 'unit_cost', label: 'Unit Cost (Buying Price)', required: false, type: 'number', matchedHeader: null },
      { key: 'unit_price', label: 'Unit Price (Selling Price)', required: true, type: 'number', matchedHeader: null },
    ],
  },
  customers: {
    label: 'Customers & Debtors',
    shortLabel: 'Debtors',
    icon: 'users',
    description: 'Customer directory, phone/WhatsApp contacts, and outstanding debtor balances (Accounts Receivable).',
    destination: 'Customer Directory, Receivables & Balance Sheet (Current Assets → Debtors)',
    fields: [
      { key: 'name', label: 'Customer / Debtor Name', required: true, type: 'text', matchedHeader: null },
      { key: 'phone', label: 'Phone / WhatsApp Number', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'balance', label: 'Outstanding Debt / Receivable', required: false, type: 'number', matchedHeader: null },
      { key: 'due_date', label: 'Date / Due Date', required: false, type: 'text', matchedHeader: null },
      { key: 'notes', label: 'Location / Invoice Ref / Notes', required: false, type: 'text', matchedHeader: null },
    ],
  },
  suppliers: {
    label: 'Suppliers & Creditors',
    shortLabel: 'Suppliers',
    icon: 'factory',
    description: 'Supplier directory, amounts owed to vendors (Accounts Payable), payment terms, and supplied stock.',
    destination: 'Suppliers Directory, Payables (Current Liabilities) & Inventory',
    fields: [
      { key: 'name', label: 'Supplier / Creditor Name', required: true, type: 'text', matchedHeader: null },
      { key: 'phone', label: 'Phone / WhatsApp', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'category', label: 'Category / Supply Type', required: false, type: 'text', matchedHeader: null },
      { key: 'balance_owed', label: 'Balance Owed (Accounts Payable)', required: false, type: 'number', matchedHeader: null },
      { key: 'payment_terms', label: 'Payment Terms (e.g. Net 30)', required: false, type: 'text', matchedHeader: null },
      { key: 'due_date', label: 'Due Date (YYYY-MM-DD)', required: false, type: 'text', matchedHeader: null },
      { key: 'notes', label: 'Location / Notes', required: false, type: 'text', matchedHeader: null },
      { key: 'item_name', label: 'Supplied Item Name (Optional)', required: false, type: 'text', matchedHeader: null },
      { key: 'quantity', label: 'Supplied Qty (Optional)', required: false, type: 'number', matchedHeader: null },
      { key: 'unit_cost', label: 'Unit Cost (Optional)', required: false, type: 'number', matchedHeader: null },
      { key: 'unit_price', label: 'Selling Price (Optional)', required: false, type: 'number', matchedHeader: null },
    ],
  },
  sales: {
    label: 'Sales & Revenue',
    shortLabel: 'Sales',
    icon: 'cash',
    description: 'Daily sales logs, cash/MoMo/bank receipts, POS orders, and revenue entries.',
    destination: 'Sales Register, Cashbook & Income Statement (Revenue)',
    fields: [
      { key: 'transaction_date', label: 'Sale Date', required: true, type: 'text', matchedHeader: null },
      { key: 'vendor', label: 'Customer / Item / Particulars', required: true, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Sale Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'category', label: 'Revenue Category', required: false, type: 'text', matchedHeader: null },
      { key: 'payment_method', label: 'Payment Mode (Cash / Bank / MoMo)', required: false, type: 'text', matchedHeader: null },
    ],
  },
  expenses: {
    label: 'Expenses & Purchases',
    shortLabel: 'Expenses',
    icon: 'receipt',
    description: 'Operating expenses, utility bills, rent, direct stock purchases (COGS), and cash outflows.',
    destination: 'Bookkeeping Ledger & Income Statement (Expenses / COGS)',
    fields: [
      { key: 'transaction_date', label: 'Expense Date', required: true, type: 'text', matchedHeader: null },
      { key: 'vendor', label: 'Payee / Vendor / Description', required: true, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Expense Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'category', label: 'Category (Rent, Utilities, Purchases)', required: false, type: 'text', matchedHeader: null },
      { key: 'payment_method', label: 'Payment Mode (Cash / Bank / MoMo)', required: false, type: 'text', matchedHeader: null },
    ],
  },
  invoices: {
    label: 'Customer Invoices',
    shortLabel: 'Invoices',
    icon: 'file',
    description: 'Customer invoices, billing statements, due dates, and paid/unpaid status.',
    destination: 'Invoicing, Customer Debtors & Balance Sheet Receivables',
    fields: [
      { key: 'invoice_number', label: 'Invoice # / Ref', required: false, type: 'text', matchedHeader: null },
      { key: 'customer_name', label: 'Customer / Client Name', required: true, type: 'text', matchedHeader: null },
      { key: 'customer_phone', label: 'Customer Phone', required: false, type: 'text', matchedHeader: null },
      { key: 'customer_email', label: 'Customer Email', required: false, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Invoice Amount', required: true, type: 'number', matchedHeader: null },
      { key: 'due_date', label: 'Invoice / Due Date', required: false, type: 'text', matchedHeader: null },
      { key: 'status', label: 'Status (paid / unpaid / sent)', required: false, type: 'text', matchedHeader: null },
      { key: 'description', label: 'Description / Items', required: false, type: 'text', matchedHeader: null },
    ],
  },
  assets: {
    label: 'Fixed Assets',
    shortLabel: 'Fixed Assets',
    icon: 'briefcase',
    description: 'Equipment, vehicles, machinery, computers, furniture, acquisition cost, and depreciation rate.',
    destination: 'Fixed Assets Register & Balance Sheet (Non-Current Assets & Depreciation)',
    fields: [
      { key: 'name', label: 'Asset Name / Description', required: true, type: 'text', matchedHeader: null },
      { key: 'category', label: 'Asset Class (Vehicles, IT, Machinery)', required: false, type: 'text', matchedHeader: null },
      { key: 'cost', label: 'Acquisition / Purchase Cost', required: true, type: 'number', matchedHeader: null },
      { key: 'acquisition_date', label: 'Purchase Date', required: false, type: 'text', matchedHeader: null },
      { key: 'serial_number', label: 'Serial / Tag #', required: false, type: 'text', matchedHeader: null },
      { key: 'depreciation_rate', label: 'Annual Depreciation % (e.g. 20)', required: false, type: 'number', matchedHeader: null },
    ],
  },
  opening_balances: {
    label: 'Opening Balances & Trial Balance',
    shortLabel: 'Opening Balances',
    icon: 'bank',
    description: 'Starting cash, bank/MoMo balances, debtors, creditors, inventory stock, loans, and owner capital.',
    destination: 'Balance Sheet & Trial Balance (Assets, Liabilities & Owner Equity)',
    fields: [
      { key: 'account_name', label: 'Account Name (Cash, Bank, Debtors, Capital)', required: true, type: 'text', matchedHeader: null },
      { key: 'account_type', label: 'Account Type (Asset, Liability, Equity, Debtor, Creditor)', required: false, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Balance / Amount (or Debit)', required: true, type: 'number', matchedHeader: null },
      { key: 'as_of_date', label: 'As-Of Date', required: false, type: 'text', matchedHeader: null },
      { key: 'notes', label: 'Notes / Reference', required: false, type: 'text', matchedHeader: null },
    ],
  },
  payroll: {
    label: 'Staff & Payroll',
    shortLabel: 'Payroll',
    icon: 'user',
    description: 'Employee roster, designations, monthly basic salaries, phone numbers, and SSNIT / Ghana Card IDs.',
    destination: 'Team Directory & Payroll Schedule',
    fields: [
      { key: 'name', label: 'Employee Full Name', required: true, type: 'text', matchedHeader: null },
      { key: 'role', label: 'Role / Designation', required: false, type: 'text', matchedHeader: null },
      { key: 'salary', label: 'Monthly Basic Salary', required: true, type: 'number', matchedHeader: null },
      { key: 'phone', label: 'Phone / MoMo Number', required: false, type: 'text', matchedHeader: null },
      { key: 'email', label: 'Email Address', required: false, type: 'text', matchedHeader: null },
      { key: 'branch', label: 'Branch / Department', required: false, type: 'text', matchedHeader: null },
      { key: 'ghana_card_tin', label: 'Ghana Card / SSNIT / TIN', required: false, type: 'text', matchedHeader: null },
    ],
  },
  transactions: {
    label: 'Universal Ledger (Mixed Sheet)',
    shortLabel: 'Universal Ledger',
    icon: 'book',
    description: 'Mixed cashbook, bank statements, or multi-type accounting journals (auto-routes Sales, Expenses, Debtors, Creditors, Assets).',
    destination: 'All Relevant Ledgers (Bookkeeping, Debtors, Creditors, Assets & Financial Statements)',
    fields: [
      { key: 'transaction_date', label: 'Date', required: false, type: 'text', matchedHeader: null },
      { key: 'vendor', label: 'Description / Particulars / Party Name', required: true, type: 'text', matchedHeader: null },
      { key: 'type', label: 'Type / Direction (Revenue, Expense, Debtor, Creditor, Asset)', required: false, type: 'text', matchedHeader: null },
      { key: 'amount', label: 'Amount (or Net Value)', required: true, type: 'number', matchedHeader: null },
      { key: 'category', label: 'Account / Category', required: false, type: 'text', matchedHeader: null },
      { key: 'payment_method', label: 'Payment Method (Cash / Bank / MoMo)', required: false, type: 'text', matchedHeader: null },
    ],
  },
};

// Carefully ordered fuzzy dictionary so specific columns never steal generic columns
const FUZZY_DICTIONARY: Record<string, string[]> = {
  name: [
    'itemname', 'productname', 'goodsname', 'customername', 'clientname', 'debtorname', 'debtor',
    'suppliername', 'vendorname', 'creditorname', 'creditor', 'companyname', 'employeename', 'staffname',
    'assetname', 'assetdescription', 'fullname', 'name', 'product', 'item', 'customer', 'client', 'supplier', 'vendor', 'title', 'description',
  ],
  item_name: [
    'supplieditemname', 'suppliedgoods', 'itemsupplied', 'productsupplied', 'inventorygoods',
    'itemname', 'productname', 'goodsname', 'goods', 'product', 'merchandise', 'materials',
  ],
  barcode: ['barcode', 'sku', 'itemcode', 'productcode', 'upc', 'ean', 'partnumber', 'code', 'serialno', 'tag'],
  quantity: [
    'qtyavailable', 'qtyonhand', 'quantityonhand', 'stockquantity', 'stockqty', 'openingstockqty',
    'quantity', 'qty', 'stock', 'available', 'units', 'count', 'pieces', 'cartons', 'boxes',
  ],
  unit_cost: [
    'unitcostprice', 'buyingprice', 'purchaseprice', 'unitcost', 'costprice', 'buyprice',
    'buyingcost', 'costperunit', 'wholesaleprice', 'cost', 'buying',
  ],
  unit_price: [
    'unitsellingprice', 'sellingprice', 'retailprice', 'salesprice', 'unitprice',
    'sellprice', 'markedprice', 'listprice', 'retail', 'selling', 'rate', 'price',
  ],
  invoice_number: [
    'invoicenumber', 'invnumber', 'invoiceno', 'billno', 'receiptno', 'invoiceid', 'invno',
    'voucherno', 'refno', 'reference', 'ref', 'invoice',
  ],
  customer_name: [
    'customername', 'clientname', 'debtorname', 'customer', 'client', 'debtor', 'billto', 'Soldto', 'payer', 'buyer', 'party', 'name',
  ],
  customer_phone: ['customerphone', 'clientphone', 'phonenumber', 'whatsapp', 'mobile', 'cell', 'tel', 'contact', 'momo', 'phone'],
  customer_email: ['customeremail', 'clientemail', 'emailaddress', 'email', 'mail'],
  phone: ['phonenumber', 'whatsapp', 'whatsappnumber', 'mobile', 'cell', 'tel', 'contact', 'contactno', 'momo', 'telephone', 'phone'],
  email: ['emailaddress', 'staffemail', 'useremail', 'contactemail', 'email', 'mail'],
  amount: [
    'salesamount', 'expenseamount', 'saleamount', 'invoicetotal', 'invoiceamount', 'grandtotal',
    'netamount', 'openingbalance', 'totalamount', 'transactionamount', 'amount', 'total', 'sum',
    'value', 'paid', 'totalpaid', 'debit', 'credit', 'moneyin', 'moneyout', 'balance', 'price',
  ],
  cost: ['purchasecost', 'acquisitioncost', 'originalcost', 'assetcost', 'buyingcost', 'costprice', 'purchaseprice', 'cost', 'value', 'amount', 'price'],
  due_date: ['duedate', 'paymentdue', 'invoicedate', 'maturitydate', 'due', 'expiry', 'date'],
  status: ['paymentstatus', 'invoicestatus', 'paidstatus', 'status', 'state', 'settlement'],
  description: ['description', 'particulars', 'narration', 'details', 'memo', 'notes', 'items', 'service', 'desc'],
  balance: [
    'outstandingdebt', 'outstandingbalance', 'receivablebalance', 'amountdue', 'amountowing', 'debtorbalance',
    'outstanding', 'receivable', 'receivables', 'balanceowed', 'totaldue', 'debt', 'arrears', 'owed', 'owing', 'balance', 'amount',
  ],
  balance_owed: [
    'balanceowed', 'debtowed', 'amountowed', 'supplierdebt', 'creditorbalance', 'billdue',
    'payable', 'payables', 'accountspayable', 'creditbalance', 'debt', 'owed', 'outstandingdebt', 'balance', 'amount',
  ],
  payment_terms: ['paymentterms', 'creditperiod', 'creditdays', 'terms', 'term', 'days'],
  notes: ['location', 'address', 'remarks', 'comment', 'notes', 'memo', 'reference', 'details'],
  category: [
    'salescategory', 'expensecategory', 'assetclass', 'supplytype', 'classification', 'accounthead',
    'category', 'group', 'dept', 'department', 'class', 'account', 'head', 'section',
  ],
  acquisition_date: ['purchasedate', 'acquisitiondate', 'installationdate', 'boughton', 'startdate', 'acquired', 'date'],
  serial_number: ['serialnumber', 'chassis', 'assetid', 'serialno', 'serial', 'tag', 'vin', 'regno'],
  depreciation_rate: ['depreciationrate', 'depreciationpercent', 'annualdepr', 'depreciation', 'depr', 'rate'],
  transaction_date: ['saledate', 'expensedate', 'orderdate', 'transactiondate', 'entrydate', 'valuedate', 'postingdate', 'asofdate', 'recordedat', 'txdate', 'date', 'day'],
  as_of_date: ['asofdate', 'openingdate', 'statementdate', 'balancedate', 'startdate', 'date'],
  account_name: ['accountname', 'accounttitle', 'accountdescription', 'ledgername', 'bankname', 'account', 'ledger', 'head', 'particulars', 'name', 'description'],
  account_type: ['accounttype', 'acctype', 'classification', 'category', 'type', 'class', 'nature', 'section'],
  role: ['jobtitle', 'designation', 'position', 'role', 'title', 'department', 'rank'],
  salary: ['basicsalary', 'monthlysalary', 'grosssalary', 'netsalary', 'remuneration', 'salary', 'pay', 'wage', 'allowance', 'amount'],
  branch: ['branchlocation', 'storelocation', 'location', 'branch', 'store', 'shop', 'outlet', 'site'],
  ghana_card_tin: ['ghanacard', 'ssnit', 'ssnitno', 'idnumber', 'nationalid', 'taxid', 'tin'],
  vendor: [
    'particulars', 'narration', 'payee', 'payer', 'vendor', 'supplier', 'party', 'client',
    'customer', 'customername', 'buyer', 'description', 'desc', 'details', 'merchant', 'recipient', 'name', 'accountname',
  ],
  type: ['txtype', 'transactiontype', 'entrytype', 'accounttype', 'kind', 'flow', 'direction', 'drcr', 'type'],
  payment_method: ['paymentmethod', 'paymentmode', 'paymenttype', 'method', 'mode', 'mop', 'channel', 'tender', 'paidvia', 'payvia', 'wallet', 'account'],
};

function normalizeStr(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanPaymentMethod(val: any): 'cash' | 'bank' {
  if (!val) return 'cash';
  const str = String(val).toLowerCase();
  if (
    str.includes('bank') ||
    str.includes('momo') ||
    str.includes('mobile') ||
    str.includes('mtn') ||
    str.includes('telecel') ||
    str.includes('vodafone') ||
    str.includes('airteltigo') ||
    str.includes('card') ||
    str.includes('transfer') ||
    str.includes('pos') ||
    str.includes('cheque') ||
    str.includes('check') ||
    str.includes('wire') ||
    str.includes('online') ||
    str.includes('ecobank') ||
    str.includes('gcb') ||
    str.includes('absa') ||
    str.includes('stanbic') ||
    str.includes('fidelity') ||
    str.includes('calbank') ||
    str.includes('zenith')
  ) {
    return 'bank';
  }
  return 'cash';
}

/**
 * Universal Accounting Number Parser
 * Handles:
 * - Standard numbers: 1250.50
 * - Currency prefixes/suffixes: "GHS 1,250.00", "GH₵ 450", "$1,000", "¢500"
 * - Accounting parentheses for negatives: "(1,250.00)" -> -1250
 * - Dr / Cr suffixes: "1,500.00 Dr", "800 Cr"
 * - Empty / dashes: "-", "NIL", "N/A" -> 0
 */
function cleanNumber(val: any): number {
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.min(999999999, Math.max(-999999999, val));
  }
  if (val === null || val === undefined) return 0;
  const raw = String(val).trim();
  if (!raw || raw === '-' || raw === '—' || /^(nil|n\/a|none|null)$/i.test(raw)) return 0;

  // Detect accounting parentheses e.g. (1,200.50)
  const isParenNegative = /^\(.*\)$/.test(raw) || /^-\s*\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;

  let parsed = parseFloat(cleaned);
  if (isNaN(parsed) || !isFinite(parsed)) return 0;
  if (isParenNegative && parsed > 0) parsed = -parsed;
  return Math.min(999999999, Math.max(-999999999, parsed));
}

/**
 * Extracts a numeric amount from a row even when the spreadsheet uses split Debit/Credit
 * or Money In / Money Out columns.
 */
function extractSmartRowAmount(row: Record<string, any>, primaryHeader: string | null): { amount: number; inferredFlow: 'in' | 'out' | null } {
  if (primaryHeader && row[primaryHeader] !== undefined && row[primaryHeader] !== '') {
    const num = cleanNumber(row[primaryHeader]);
    if (num !== 0) {
      return { amount: Math.abs(num), inferredFlow: num < 0 ? 'out' : null };
    }
  }

  // Fallback: scan columns for Debit / Credit / Money In / Money Out / Amount / Balance
  for (const [col, val] of Object.entries(row)) {
    const nCol = normalizeStr(col);
    const num = cleanNumber(val);
    if (num === 0) continue;

    if (['moneyin', 'paidin', 'receipt', 'receipts', 'inflow', 'deposit', 'salesamount', 'revenue'].includes(nCol)) {
      return { amount: Math.abs(num), inferredFlow: 'in' };
    }
    if (['moneyout', 'paidout', 'payment', 'payments', 'outflow', 'withdrawal', 'expenseamount', 'disbursement'].includes(nCol)) {
      return { amount: Math.abs(num), inferredFlow: 'out' };
    }
    if (['debit', 'dr', 'debitamount'].includes(nCol)) {
      return { amount: Math.abs(num), inferredFlow: null };
    }
    if (['credit', 'cr', 'creditamount'].includes(nCol)) {
      return { amount: Math.abs(num), inferredFlow: null };
    }
  }

  return { amount: 0, inferredFlow: null };
}

/**
 * Universal Date Parser
 * Handles Excel serial dates, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY, and ISO timestamps.
 */
function cleanDate(val: any): string {
  const today = new Date().toISOString().split('T')[0];
  if (!val) return today;

  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000 && !String(val).includes('-') && !String(val).includes('/')) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  const str = String(val).trim();
  if (!str) return today;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  // Handle DD/MM/YYYY, DD-MM-YYYY, or YYYY/MM/DD
  if (/^\d{1,4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,4}$/.test(str)) {
    const parts = str.split(/[\/\.\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (parts[2].length === 4) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const year = parts[2];
        // Assume DD/MM/YYYY (standard in Ghana/UK/IFRS), fallback to MM/DD/YYYY if p1 > 12
        const day = p1 > 12 ? p1 : p0;
        const month = p1 > 12 ? p0 : p1;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return today;
}

function cleanDepreciationRate(val: any): number {
  const num = Math.abs(cleanNumber(val));
  if (num <= 0) return 0.20;
  if (num > 1) return Math.min(0.99, Math.round((num / 100) * 100) / 100);
  return Math.min(0.99, Math.round(num * 100) / 100);
}

/**
 * Intelligent Multi-Signal Sheet Classifier
 * Inspects:
 * 1. Sheet tab name
 * 2. Column headers
 * 3. Sample data rows (first 25 rows)
 */
function autoClassifySheet(
  headers: string[],
  rows: Record<string, any>[],
  sheetName: string = ''
): { category: MigrationCategory; confidence: number; detectedReason: string } {
  const normHeaders = headers.map(normalizeStr);
  const normSheet = normalizeStr(sheetName);

  const scores: Record<MigrationCategory, { score: number; reasons: string[] }> = {
    inventory: { score: 0, reasons: [] },
    customers: { score: 0, reasons: [] },
    suppliers: { score: 0, reasons: [] },
    sales: { score: 0, reasons: [] },
    expenses: { score: 0, reasons: [] },
    invoices: { score: 0, reasons: [] },
    assets: { score: 0, reasons: [] },
    opening_balances: { score: 0, reasons: [] },
    payroll: { score: 0, reasons: [] },
    transactions: { score: 0, reasons: [] },
  };

  // 1. Sheet Name Signals
  if (normSheet) {
    if (/debtor|receivable|customer|client|owing/.test(normSheet)) {
      scores.customers.score += 6;
      scores.customers.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/supplier|creditor|payable|vendor/.test(normSheet)) {
      scores.suppliers.score += 6;
      scores.suppliers.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/stock|inventory|product|catalog|item|goods/.test(normSheet)) {
      scores.inventory.score += 6;
      scores.inventory.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/invoice|billing/.test(normSheet)) {
      scores.invoices.score += 6;
      scores.invoices.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/sale|revenue|income|pos/.test(normSheet)) {
      scores.sales.score += 6;
      scores.sales.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/expense|expenditure|overhead|outflow|voucher/.test(normSheet)) {
      scores.expenses.score += 6;
      scores.expenses.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/asset|machinery|equipment|vehicle|depreciation/.test(normSheet)) {
      scores.assets.score += 6;
      scores.assets.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/opening|trialbalance|balancesheet|starting/.test(normSheet)) {
      scores.opening_balances.score += 6;
      scores.opening_balances.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/payroll|staff|employee|salary|wage/.test(normSheet)) {
      scores.payroll.score += 6;
      scores.payroll.reasons.push(`Sheet name "${sheetName}"`);
    }
    if (/ledger|cashbook|journal|transaction|statement/.test(normSheet)) {
      scores.transactions.score += 6;
      scores.transactions.reasons.push(`Sheet name "${sheetName}"`);
    }
  }

  // 2. Column Header Signals
  // Inventory
  if (normHeaders.some((h) => ['quantity', 'qty', 'stock', 'barcode', 'sku', 'qtyavailable', 'qtyonhand', 'stockqty'].includes(h))) {
    scores.inventory.score += 6;
    scores.inventory.reasons.push('Stock Quantity / SKU columns');
  }
  if (normHeaders.some((h) => ['unitcost', 'unitprice', 'sellingprice', 'buyingprice', 'costprice', 'retailprice'].includes(h))) {
    scores.inventory.score += 5;
    scores.inventory.reasons.push('Unit Cost / Selling Price columns');
  }

  // Customers & Debtors
  if (
    normHeaders.some((h) => ['customername', 'debtorname', 'debtor', 'debtors', 'receivable', 'receivables', 'outstandingdebt', 'amountowing', 'amountdue'].includes(h)) &&
    !normHeaders.some((h) => ['supplier', 'suppliername', 'creditor', 'payable'].includes(h))
  ) {
    scores.customers.score += 7;
    scores.customers.reasons.push('Customer / Debtor Receivable columns');
  }
  if (
    normHeaders.some((h) => ['customer', 'client', 'name'].includes(h)) &&
    normHeaders.some((h) => ['debt', 'balance', 'outstanding', 'owed', 'owing', 'arrears'].includes(h)) &&
    !normHeaders.some((h) => ['supplier', 'vendor', 'payable'].includes(h))
  ) {
    scores.customers.score += 5;
    scores.customers.reasons.push('Customer Name + Debt Balance columns');
  }

  // Suppliers & Creditors
  if (normHeaders.some((h) => ['supplier', 'suppliername', 'creditor', 'creditorname', 'payable', 'payables', 'accountspayable', 'balanceowed', 'paymentterms'].includes(h))) {
    scores.suppliers.score += 7;
    scores.suppliers.reasons.push('Supplier / Creditor Payable columns');
  }

  // Invoices
  if (normHeaders.some((h) => ['invoicenumber', 'invno', 'invoiceno', 'billno', 'invoiceid'].includes(h))) {
    scores.invoices.score += 7;
    scores.invoices.reasons.push('Invoice Number column');
  }
  if (normHeaders.some((h) => ['duedate', 'paymentstatus', 'invoicestatus', 'billto'].includes(h))) {
    scores.invoices.score += 3;
    scores.invoices.reasons.push('Due Date / Invoice Status columns');
  }

  // Sales
  if (normHeaders.some((h) => ['sales', 'sale', 'salestotal', 'revenue', 'soldto', 'buyer', 'receiptno', 'pos', 'salesamount', 'cashsale', 'ordertotal'].includes(h))) {
    scores.sales.score += 6;
    scores.sales.reasons.push('Sales / Revenue columns');
  }

  // Expenses
  if (normHeaders.some((h) => ['expense', 'expenses', 'expenditure', 'disbursement', 'operatingcost', 'voucher', 'overhead', 'payee', 'expensedate', 'expenseamount'].includes(h))) {
    scores.expenses.score += 6;
    scores.expenses.reasons.push('Expense / Payee columns');
  }

  // Fixed Assets
  if (normHeaders.some((h) => ['assetname', 'assetdescription', 'depreciation', 'depreciationrate', 'assetclass', 'machinery', 'acquisitiondate', 'serialnumber'].includes(h))) {
    scores.assets.score += 7;
    scores.assets.reasons.push('Fixed Asset / Depreciation columns');
  }

  // Opening Balances & Trial Balance
  if (normHeaders.some((h) => ['accountname', 'openingbalance', 'asofdate', 'startingbalance', 'accounttype', 'debit', 'credit'].includes(h))) {
    scores.opening_balances.score += 6;
    scores.opening_balances.reasons.push('Account Name / Opening Balance / Trial Balance columns');
  }

  // Payroll
  if (normHeaders.some((h) => ['employeename', 'staffname', 'salary', 'basicsalary', 'monthlysalary', 'ghanacard', 'ssnit', 'wage'].includes(h))) {
    scores.payroll.score += 8;
    scores.payroll.reasons.push('Staff / Salary / SSNIT columns');
  }

  // General Ledger / Universal Mixed Transactions
  if (normHeaders.some((h) => ['transactiondate', 'txtype', 'entrytype', 'cashbook', 'ledger', 'moneyin', 'moneyout', 'narration'].includes(h))) {
    scores.transactions.score += 6;
    scores.transactions.reasons.push('General Ledger / Cashbook columns');
  }

  // 3. Content Sensing from Sample Data Rows (up to 25 rows)
  const sampleRows = rows.slice(0, 25);
  let invCodeHits = 0;
  let mixedLedgerTypeHits = 0;
  let balanceSheetAccountHits = 0;

  for (const r of sampleRows) {
    const rowValues = Object.values(r).map((v) => String(v || '').trim());
    const joinedLower = rowValues.join(' ').toLowerCase();

    if (/\binv[-_\/]?\d+/i.test(joinedLower)) invCodeHits++;
    if (/\b(revenue|operating_expense|expense|income|cost of goods|cogs)\b/i.test(joinedLower)) mixedLedgerTypeHits++;
    if (/\b(cash in hand|cash at bank|petty cash|accounts receivable|trade debtors|trade creditors|accounts payable|retained earnings|share capital|owner equity|opening stock)\b/i.test(joinedLower)) {
      balanceSheetAccountHits++;
    }
  }

  if (invCodeHits >= 2) {
    scores.invoices.score += 4;
    scores.invoices.reasons.push('Detected INV-# references in data rows');
  }
  if (mixedLedgerTypeHits >= 2) {
    scores.transactions.score += 5;
    scores.transactions.reasons.push('Detected Revenue/Expense ledger types in data rows');
  }
  if (balanceSheetAccountHits >= 2) {
    scores.opening_balances.score += 5;
    scores.opening_balances.reasons.push('Detected Trial Balance / Balance Sheet accounts in data rows');
  }

  let topCategory: MigrationCategory = 'inventory';
  let topScore = 0;
  let topReason = 'Standard tabular format';

  for (const [cat, data] of Object.entries(scores) as [MigrationCategory, { score: number; reasons: string[] }][]) {
    if (data.score > topScore) {
      topScore = data.score;
      topCategory = cat;
      topReason = Array.from(new Set(data.reasons)).join(' • ');
    }
  }

  const confidence = topScore >= 7 ? 98 : topScore >= 5 ? 92 : topScore >= 3 ? 82 : 70;
  return { category: topCategory, confidence, detectedReason: topReason };
}

/**
 * Smart Row-Level Account Classifier for Opening Balances & Universal Ledger
 * Ensures Debtors go to Current Assets (Debtors), Creditors go to Short-Term Liabilities,
 * Fixed Assets go to Non-Current Assets, Capital goes to Equity, etc.
 */
function classifyLedgerOrOpeningRow(rawName: string, rawType: string, rawCat: string, rawAmount: number, inferredFlow: 'in' | 'out' | null) {
  const combined = `${rawName} ${rawType} ${rawCat}`.toLowerCase();

  // 1. Debtors / Accounts Receivable -> Current Asset (Debtors)
  if (/\b(debtor|debtors|receivable|receivables|customer debt|trade debtor|amount owing by|owed by customer)\b/i.test(combined)) {
    const cleanCustName = rawName
      .replace(/^(opening balance|customer debtor|debtor|trade debtor|receivable|account)\s*[:\-–]\s*/i, '')
      .trim() || 'Imported Debtor';
    return {
      txType: 'current_asset',
      category: `Debtors (Accounts Receivable) | Customer: ${cleanCustName}`,
      vendor: `Customer Debtor: ${cleanCustName}`,
      paymentMethod: 'cash' as const,
      isDebtor: true,
      customerName: cleanCustName,
      isCreditor: false,
      supplierName: '',
    };
  }

  // 2. Creditors / Suppliers / Accounts Payable -> Short-Term Liability
  if (/\b(creditor|creditors|payable|payables|supplier|vendor debt|trade creditor|loan|overdraft|tax payable|vat payable|ssnit payable|accrued|liability)\b/i.test(combined)) {
    const cleanSupName = rawName
      .replace(/^(opening balance|supplier|creditor|trade creditor|payable|account)\s*[:\-–]\s*/i, '')
      .trim() || 'Imported Creditor';
    return {
      txType: 'short_term_liability',
      category: 'Accounts Payable',
      vendor: `Supplier: ${cleanSupName}`,
      paymentMethod: 'bank' as const,
      isDebtor: false,
      customerName: '',
      isCreditor: true,
      supplierName: cleanSupName,
    };
  }

  // 3. Opening Stock / Inventory Asset -> Current Asset (Opening Stock)
  if (/\b(opening stock|closing stock|inventory|stock in hand|merchandise inventory)\b/i.test(combined)) {
    return {
      txType: 'current_asset',
      category: 'Opening Stock',
      vendor: rawName.startsWith('Opening') ? rawName : `Opening Stock: ${rawName}`,
      paymentMethod: 'cash' as const,
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 4. Owner's Equity / Capital -> Deposit
  if (/\b(equity|capital|retained earnings|owner|shareholder|drawings|reserve)\b/i.test(combined)) {
    return {
      txType: 'deposit',
      category: 'Owner Capital & Equity',
      vendor: rawName.startsWith('Opening') ? rawName : `Opening Balance: ${rawName}`,
      paymentMethod: cleanPaymentMethod(combined),
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 5. Fixed Assets / Non-Current Assets
  if (/\b(fixed asset|non-current|machinery|vehicle|equipment|furniture|building|land|computer|generator|plant|motor)\b/i.test(combined)) {
    return {
      txType: 'fixed_asset',
      category: rawCat || 'Fixed Assets',
      vendor: rawName.startsWith('Fixed Asset') ? rawName : `Fixed Asset: ${rawName}`,
      paymentMethod: 'bank' as const,
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 6. Cash / Bank / MoMo Current Assets (Opening Balances)
  if (/\b(cash in hand|cash till|petty cash|cash at bank|bank balance|bank account|momo|mobile money|current asset|vault)\b/i.test(combined)) {
    const isBank = /\b(bank|momo|mobile|ecobank|gcb|stanbic|absa|fidelity|zenith|calbank)\b/i.test(combined);
    return {
      txType: 'current_asset',
      category: 'Opening Balances',
      vendor: rawName.startsWith('Opening') ? rawName : `Opening Balance: ${rawName}`,
      paymentMethod: (isBank ? 'bank' : 'cash') as 'cash' | 'bank',
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 7. Cost of Goods Sold / Direct Purchases
  if (/\b(cost of goods|cogs|cost of sales|direct purchase|stock purchase|wholesale purchase)\b/i.test(combined)) {
    return {
      txType: 'cost_of_goods',
      category: rawCat || 'Direct Purchases (COGS)',
      vendor: rawName || 'Stock Purchase',
      paymentMethod: cleanPaymentMethod(combined),
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 8. Revenue / Sales
  if (
    inferredFlow === 'in' ||
    /\b(revenue|income|sale|sales|receipt|inflow|commission received|fee earned|service income)\b/i.test(combined)
  ) {
    return {
      txType: 'revenue',
      category: rawCat || 'Sales',
      vendor: rawName || 'Sales Revenue',
      paymentMethod: cleanPaymentMethod(combined),
      isDebtor: false,
      customerName: '',
      isCreditor: false,
      supplierName: '',
    };
  }

  // 9. Default to Operating Expense
  return {
    txType: 'operating_expense',
    category: rawCat || 'Operating Expenses',
    vendor: rawName || 'Operating Expense',
    paymentMethod: cleanPaymentMethod(combined),
    isDebtor: false,
    customerName: '',
    isCreditor: false,
    supplierName: '',
  };
}

export default function MigratePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<MigrationCategory>('inventory');
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null);
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
      const cached = getCachedBusiness();
      if (cached?.id) {
        setCurrentBusinessId(cached.id);
        setCurrency(cached.currency || 'GHS');
      }
      const biz = await resolveActiveBusiness();
      if (biz?.id) {
        setCurrentBusinessId(biz.id);
        setCurrency(biz.currency || 'GHS');
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

  const autoMatchHeaders = (headers: string[], fields: FieldMapping[], sampleRows: Record<string, any>[] = []): FieldMapping[] => {
    const usedHeaders = new Set<string>();

    return fields.map((field) => {
      const aliases = FUZZY_DICTIONARY[field.key] || [field.key];

      // Pass 1: Exact normalized match in priority order of aliases
      let matched: string | undefined;
      for (const alias of aliases) {
        const normA = normalizeStr(alias);
        const found = headers.find((h) => !usedHeaders.has(h) && normalizeStr(h) === normA);
        if (found) {
          matched = found;
          break;
        }
      }

      // Pass 2: Substring match in priority order of aliases
      if (!matched) {
        for (const alias of aliases) {
          const normA = normalizeStr(alias);
          if (normA.length < 3) continue;
          const found = headers.find((h) => {
            if (usedHeaders.has(h)) return false;
            const normH = normalizeStr(h);
            if (!normH) return false;
            return normH.includes(normA) || (normH.length >= 4 && normA.includes(normH));
          });
          if (found) {
            matched = found;
            break;
          }
        }
      }

      // Pass 3: Sample data content heuristic if header is generic (e.g. Column_1)
      if (!matched && sampleRows.length > 0 && field.required) {
        const unusedHeaders = headers.filter((h) => !usedHeaders.has(h));
        if (field.type === 'number') {
          matched = unusedHeaders.find((h) =>
            sampleRows.slice(0, 10).some((r) => {
              const v = r[h];
              return v !== '' && v !== null && cleanNumber(v) !== 0 && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim());
            })
          );
        } else if (field.key.includes('date')) {
          matched = unusedHeaders.find((h) =>
            sampleRows.slice(0, 10).some((r) => {
              const v = String(r[h] || '').trim();
              return /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v);
            })
          );
        } else if (field.type === 'text') {
          matched = unusedHeaders.find((h) =>
            sampleRows.slice(0, 10).some((r) => {
              const v = String(r[h] || '').trim();
              return v.length >= 2 && isNaN(Number(v));
            })
          );
        }
      }

      if (matched) {
        usedHeaders.add(matched);
      }

      return {
        ...field,
        matchedHeader: matched || null,
      };
    });
  };

  const extractSheetRowsAndHeaders = (ws: XLSX.WorkSheet): { headers: string[]; rows: Record<string, any>[] } => {
    const rawSheetArray: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawSheetArray || rawSheetArray.length === 0) {
      return { headers: [], rows: [] };
    }

    // Find the best header row in the first 15 rows (skip company title banners, report date headers, blank rows)
    let headerRowIndex = 0;
    let bestRowScore = -1;

    for (let r = 0; r < Math.min(15, rawSheetArray.length); r++) {
      const row = rawSheetArray[r] || [];
      const nonEmptyCells = row.filter((c: any) => c !== '' && c !== null && c !== undefined);
      if (nonEmptyCells.length < 2) continue;

      // Score how "header-like" this row is (mostly text strings, matches known dictionary keywords)
      const textCount = nonEmptyCells.filter((c: any) => isNaN(Number(c))).length;
      const keywordHits = nonEmptyCells.filter((c: any) => {
        const n = normalizeStr(String(c));
        return n.length >= 2 && Object.values(FUZZY_DICTIONARY).some((arr) => arr.includes(n));
      }).length;

      const score = nonEmptyCells.length * 2 + textCount * 2 + keywordHits * 5;
      if (score > bestRowScore) {
        bestRowScore = score;
        headerRowIndex = r;
      }
    }

    const headerRow = (rawSheetArray[headerRowIndex] || []).map((c: any, colIdx: number) => {
      const str = String(c || '').trim();
      return str || `Column_${colIdx + 1}`;
    });

    const rows: Record<string, any>[] = [];
    for (let r = headerRowIndex + 1; r < rawSheetArray.length; r++) {
      const rowArr = rawSheetArray[r] || [];
      if (rowArr.every((c: any) => c === '' || c === null || c === undefined)) continue;

      // Skip summary "TOTAL" footer rows so we don't double-import a spreadsheet's bottom sum row!
      const firstNonEmpty = String(rowArr.find((c: any) => c !== '' && c !== null && c !== undefined) || '').trim();
      if (/^(total|grand total|sub total|subtotal|balance c\/d|balance b\/d)$/i.test(firstNonEmpty)) {
        continue;
      }

      const rowObj: Record<string, any> = {};
      headerRow.forEach((h: string, colIdx: number) => {
        rowObj[h] = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
      });
      rows.push(rowObj);
    }

    return { headers: headerRow, rows };
  };

  const loadSheetData = (wb: XLSX.WorkBook, sName: string) => {
    const ws = wb.Sheets[sName];
    if (!ws) {
      setErrorMsg(`Sheet "${sName}" not found.`);
      return;
    }

    const { headers, rows } = extractSheetRowsAndHeaders(ws);
    if (headers.length === 0 || rows.length === 0) {
      setErrorMsg(`Sheet "${sName}" contains no importable data rows.`);
      return;
    }

    setRawHeaders(headers);
    setRawRows(rows);

    const classified = autoClassifySheet(headers, rows, sName);
    setAutoDetectedInfo({
      category: classified.category,
      confidence: classified.confidence,
      reason: classified.detectedReason,
    });

    setCategory(classified.category);
    const targetFields = CATEGORY_CONFIG[classified.category].fields;
    const autoMapped = autoMatchHeaders(headers, targetFields, rows);
    setMappings(autoMapped);
  };

  const handleFileProcess = (file: File) => {
    setErrorMsg(null);
    setImportSuccessStats(null);
    setFileName(file.name);

    // Support JSON files (either array of objects or full AMS JSON backup)
    if (file.name.toLowerCase().endsWith('.json')) {
      const textReader = new FileReader();
      textReader.onload = async (e) => {
        try {
          const parsedJson = JSON.parse(String(e.target?.result || '{}'));
          // Check if it's a full AMS multi-collection backup object
          if (
            parsedJson &&
            !Array.isArray(parsedJson) &&
            (Array.isArray(parsedJson.inventory) ||
              Array.isArray(parsedJson.transactions) ||
              Array.isArray(parsedJson.invoices) ||
              Array.isArray(parsedJson.customers) ||
              Array.isArray(parsedJson.suppliers))
          ) {
            const wb = XLSX.utils.book_new();
            if (Array.isArray(parsedJson.inventory) && parsedJson.inventory.length > 0) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedJson.inventory), 'Inventory');
            }
            if (Array.isArray(parsedJson.customers) && parsedJson.customers.length > 0) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedJson.customers), 'Customers');
            }
            if (Array.isArray(parsedJson.suppliers) && parsedJson.suppliers.length > 0) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedJson.suppliers), 'Suppliers');
            }
            if (Array.isArray(parsedJson.invoices) && parsedJson.invoices.length > 0) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedJson.invoices), 'Invoices');
            }
            if (Array.isArray(parsedJson.transactions) && parsedJson.transactions.length > 0) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedJson.transactions), 'Transactions');
            }
            if (wb.SheetNames.length > 0) {
              setWorkbookRef(wb);
              setSheetNames(wb.SheetNames);
              setActiveSheet(wb.SheetNames[0]);
              loadSheetData(wb, wb.SheetNames[0]);
              return;
            }
          }

          const arr = Array.isArray(parsedJson)
            ? parsedJson
            : Array.isArray(parsedJson.data)
            ? parsedJson.data
            : Array.isArray(parsedJson.records)
            ? parsedJson.records
            : [parsedJson];

          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(arr);
          XLSX.utils.book_append_sheet(wb, ws, 'Imported_JSON');
          setWorkbookRef(wb);
          setSheetNames(wb.SheetNames);
          setActiveSheet(wb.SheetNames[0]);
          loadSheetData(wb, wb.SheetNames[0]);
        } catch (err: any) {
          setErrorMsg('Could not parse JSON file: ' + (err.message || 'Invalid JSON structure'));
        }
      };
      textReader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
    setErrorMsg(null);
    setActiveSheet(sName);
    loadSheetData(workbookRef, sName);
  };

  const handleManualCategoryChange = (newCat: MigrationCategory) => {
    setCategory(newCat);
    const targetFields = CATEGORY_CONFIG[newCat].fields;
    const autoMapped = autoMatchHeaders(rawHeaders, targetFields, rawRows);
    setMappings(autoMapped);
  };

  const handleManualMappingChange = (key: string, chosenHeader: string) => {
    setMappings((prev) =>
      prev.map((f) => (f.key === key ? { ...f, matchedHeader: chosenHeader === '__none__' ? null : chosenHeader } : f))
    );
  };

  // Transform rows for a given category and field mappings
  const buildParsedRecords = React.useCallback(
    (rowsToParse: Record<string, any>[], activeCat: MigrationCategory, activeMappings: FieldMapping[]) => {
      if (rowsToParse.length === 0) return [];

      const keyToHeader: Record<string, string | null> = {};
      activeMappings.forEach((m) => {
        keyToHeader[m.key] = m.matchedHeader;
      });

      return rowsToParse.map((row, index) => {
        // 1. SALES & REVENUE
        if (activeCat === 'sales') {
          const date = cleanDate(row[keyToHeader.transaction_date || '']);
          const vendor = String(row[keyToHeader.vendor || ''] || '').trim();
          const { amount } = extractSmartRowAmount(row, keyToHeader.amount);
          const cat = String(row[keyToHeader.category || ''] || '').trim() || 'Sales';
          const paymentMethod = cleanPaymentMethod(row[keyToHeader.payment_method || '']);

          return {
            _id: index,
            transaction_date: date,
            vendor: vendor || `Sale #${index + 1}`,
            type: 'revenue',
            amount: amount || 0,
            category: cat,
            payment_method: paymentMethod,
            isValid: Boolean(amount > 0),
          };
        }

        // 2. EXPENSES & PURCHASES
        if (activeCat === 'expenses') {
          const date = cleanDate(row[keyToHeader.transaction_date || '']);
          const vendor = String(row[keyToHeader.vendor || ''] || '').trim();
          const { amount } = extractSmartRowAmount(row, keyToHeader.amount);
          const cat = String(row[keyToHeader.category || ''] || '').trim() || 'Operating Expenses';
          const paymentMethod = cleanPaymentMethod(row[keyToHeader.payment_method || '']);
          const isCogs = /\b(cogs|cost of goods|stock purchase|direct purchase|inventory purchase|wholesale purchase)\b/i.test(`${cat} ${vendor}`);

          return {
            _id: index,
            transaction_date: date,
            vendor: vendor || `Expense #${index + 1}`,
            type: isCogs ? 'cost_of_goods' : 'operating_expense',
            amount: amount || 0,
            category: cat,
            payment_method: paymentMethod,
            isValid: Boolean(amount > 0),
          };
        }

        // 3. INVENTORY & STOCK
        if (activeCat === 'inventory') {
          const name = String(row[keyToHeader.name || ''] || '').trim();
          const barcode = String(row[keyToHeader.barcode || ''] || '').trim();
          const quantity = Math.max(0, cleanNumber(row[keyToHeader.quantity || '']));
          const unit_cost = Math.max(0, cleanNumber(row[keyToHeader.unit_cost || '']));
          let unit_price = Math.max(0, cleanNumber(row[keyToHeader.unit_price || '']));

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

        // 4. INVOICES
        if (activeCat === 'invoices') {
          const invNum = String(row[keyToHeader.invoice_number || ''] || '').trim() || `INV-${String(index + 1).padStart(4, '0')}`;
          const custName = String(row[keyToHeader.customer_name || ''] || '').trim();
          const custPhone = String(row[keyToHeader.customer_phone || ''] || '').trim();
          const custEmail = String(row[keyToHeader.customer_email || ''] || '').trim();
          const { amount } = extractSmartRowAmount(row, keyToHeader.amount);
          const dueDate = cleanDate(row[keyToHeader.due_date || '']);
          const rawStatus = String(row[keyToHeader.status || ''] || '').toLowerCase();
          const status = rawStatus.includes('paid') || rawStatus.includes('settled') ? 'paid' : rawStatus.includes('draft') ? 'draft' : 'sent';
          const description = String(row[keyToHeader.description || ''] || '').trim();

          return {
            _id: index,
            invoice_number: invNum,
            customer_name: custName || `Customer #${index + 1}`,
            customer_phone: custPhone || null,
            customer_email: custEmail || null,
            amount: amount || 0,
            due_date: dueDate,
            status,
            description: description || (custPhone ? `Contact: ${custPhone}` : null),
            isValid: Boolean(custName && amount > 0),
          };
        }

        // 5. FIXED ASSETS
        if (activeCat === 'assets') {
          const name = String(row[keyToHeader.name || ''] || '').trim();
          const assetClass = String(row[keyToHeader.category || ''] || '').trim() || 'Machinery & Equipment';
          const { amount: cost } = extractSmartRowAmount(row, keyToHeader.cost);
          const acqDate = cleanDate(row[keyToHeader.acquisition_date || '']);
          const serial = String(row[keyToHeader.serial_number || ''] || '').trim();
          const deprRate = cleanDepreciationRate(row[keyToHeader.depreciation_rate || '']);

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

        // 6. CUSTOMERS & DEBTORS
        if (activeCat === 'customers') {
          const name = String(row[keyToHeader.name || ''] || '').trim();
          let phone = String(row[keyToHeader.phone || ''] || '').trim();
          const email = String(row[keyToHeader.email || ''] || '').trim();
          const { amount: balance } = extractSmartRowAmount(row, keyToHeader.balance);
          const dueDate = row[keyToHeader.due_date || ''] ? cleanDate(row[keyToHeader.due_date || '']) : new Date().toISOString().split('T')[0];
          const notes = String(row[keyToHeader.notes || ''] || '').trim();

          if (phone.startsWith('0') && phone.length === 10) {
            phone = '233' + phone.slice(1);
          }

          return {
            _id: index,
            name: name || `Customer #${index + 1}`,
            phone: phone || null,
            email: email || null,
            balance: Math.abs(balance || 0),
            due_date: dueDate,
            notes: notes || null,
            isValid: Boolean(name),
          };
        }

        // 7. SUPPLIERS & CREDITORS
        if (activeCat === 'suppliers') {
          const name = String(row[keyToHeader.name || ''] || '').trim();
          const phone = String(row[keyToHeader.phone || ''] || '').trim();
          const email = String(row[keyToHeader.email || ''] || '').trim();
          const cat = String(row[keyToHeader.category || ''] || '').trim() || 'Inventory Goods';
          const { amount: balance } = extractSmartRowAmount(row, keyToHeader.balance_owed);
          const terms = String(row[keyToHeader.payment_terms || ''] || '').trim() || 'Net 30';
          const dueDate = row[keyToHeader.due_date || ''] ? cleanDate(row[keyToHeader.due_date || '']) : null;
          const notes = String(row[keyToHeader.notes || ''] || '').trim();
          const itemName = String(row[keyToHeader.item_name || ''] || '').trim();
          const quantity = Math.max(0, cleanNumber(row[keyToHeader.quantity || '']));
          const unitCost = Math.max(0, cleanNumber(row[keyToHeader.unit_cost || '']));
          const unitPrice = Math.max(0, cleanNumber(row[keyToHeader.unit_price || '']));

          return {
            _id: index,
            name: name || `Supplier #${index + 1}`,
            phone: phone || null,
            email: email || null,
            category: cat,
            balance_owed: Math.abs(balance || 0),
            payment_terms: terms,
            due_date: dueDate,
            notes: notes || null,
            item_name: itemName || null,
            quantity: quantity || 0,
            unit_cost: unitCost || 0,
            unit_price: unitPrice || 0,
            isValid: Boolean(name),
          };
        }

        // 8. OPENING BALANCES & TRIAL BALANCE
        if (activeCat === 'opening_balances') {
          const accountName = String(row[keyToHeader.account_name || ''] || '').trim();
          const accountType = String(row[keyToHeader.account_type || ''] || '').trim() || 'asset';
          const { amount, inferredFlow } = extractSmartRowAmount(row, keyToHeader.amount);
          const asOfDate = cleanDate(row[keyToHeader.as_of_date || '']);
          const notes = String(row[keyToHeader.notes || ''] || '').trim();
          const classified = classifyLedgerOrOpeningRow(accountName, accountType, notes, amount, inferredFlow);

          return {
            _id: index,
            account_name: accountName || `Account #${index + 1}`,
            account_type: accountType,
            resolved_tx_type: classified.txType,
            resolved_category: classified.category,
            resolved_vendor: classified.vendor,
            payment_method: classified.paymentMethod,
            is_debtor: classified.isDebtor,
            customer_name: classified.customerName,
            is_creditor: classified.isCreditor,
            supplier_name: classified.supplierName,
            amount: Math.abs(amount || 0),
            as_of_date: asOfDate,
            notes: notes || null,
            isValid: Boolean(accountName && amount !== 0),
          };
        }

        // 9. STAFF PAYROLL
        if (activeCat === 'payroll') {
          const name = String(row[keyToHeader.name || ''] || '').trim();
          const role = String(row[keyToHeader.role || ''] || '').trim() || 'Employee';
          const { amount: salary } = extractSmartRowAmount(row, keyToHeader.salary);
          const phone = String(row[keyToHeader.phone || ''] || '').trim();
          const email = String(row[keyToHeader.email || ''] || '').trim();
          const branch = String(row[keyToHeader.branch || ''] || '').trim();
          const idTin = String(row[keyToHeader.ghana_card_tin || ''] || '').trim();

          return {
            _id: index,
            name: name || `Staff #${index + 1}`,
            role,
            salary: Math.abs(salary || 0),
            phone: phone || null,
            email: email || null,
            branch: branch || null,
            ghana_card_tin: idTin || null,
            isValid: Boolean(name && salary > 0),
          };
        }

        // 10. UNIVERSAL LEDGER (MIXED TRANSACTIONS)
        if (activeCat === 'transactions') {
          const date = cleanDate(row[keyToHeader.transaction_date || '']);
          const vendor = String(row[keyToHeader.vendor || ''] || '').trim();
          const rawType = String(row[keyToHeader.type || ''] || '');
          const { amount, inferredFlow } = extractSmartRowAmount(row, keyToHeader.amount);
          const cat = String(row[keyToHeader.category || ''] || '').trim();
          const explicitPm = row[keyToHeader.payment_method || ''];

          const classified = classifyLedgerOrOpeningRow(vendor, rawType, cat, amount, inferredFlow);
          const paymentMethod = explicitPm ? cleanPaymentMethod(explicitPm) : classified.paymentMethod;

          return {
            _id: index,
            transaction_date: date,
            vendor: classified.vendor || vendor || `Entry #${index + 1}`,
            type: classified.txType,
            amount: Math.abs(amount || 0),
            category: classified.category,
            payment_method: paymentMethod,
            is_debtor: classified.isDebtor,
            customer_name: classified.customerName,
            is_creditor: classified.isCreditor,
            supplier_name: classified.supplierName,
            isValid: Boolean(amount !== 0),
          };
        }

        return { ...row, _id: index, isValid: true };
      });
    },
    [targetMargin]
  );

  const parsedRecords = React.useMemo(
    () => buildParsedRecords(rawRows, category, mappings),
    [buildParsedRecords, rawRows, category, mappings]
  );

  const validCount = parsedRecords.filter((r) => r.isValid).length;
  const totalValuation = parsedRecords.reduce((sum, r: any) => {
    if (!r.isValid) return sum;
    if (category === 'inventory') return sum + (r.quantity || 0) * (r.unit_price || 0);
    if (category === 'assets') return sum + (r.cost || 0);
    if (category === 'customers') return sum + (r.balance || 0);
    if (category === 'suppliers') return sum + (r.balance_owed || 0);
    if (category === 'payroll') return sum + (r.salary || 0);
    return sum + (r.amount || 0);
  }, 0);

  // Core Ingestion Routine for any Category + Valid Records array
  const ingestCategoryRecords = async (
    businessId: string,
    targetCat: MigrationCategory,
    validRecords: any[]
  ): Promise<{ count: number; valuation: number; label: string }> => {
    const chunkSize = 50;
    const todayIso = new Date().toISOString().split('T')[0];

    // 1. SALES & REVENUE
    if (targetCat === 'sales') {
      const payload = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        transaction_date: r.transaction_date || todayIso,
        vendor: r.vendor || 'Sales Revenue',
        type: 'revenue',
        category: r.category || 'Sales',
        amount: Number(r.amount || 0),
        payment_method: cleanPaymentMethod(r.payment_method),
        created_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await supabase.from('transactions').insert(chunk);
      }

      const currentCached = getCachedTransactions(businessId);
      setCachedTransactions([...payload, ...currentCached], businessId);
      window.dispatchEvent(new Event('ams:transactions-updated'));

      const val = payload.reduce((s, r) => s + r.amount, 0);
      return { count: payload.length, valuation: val, label: 'Sales Revenue Entries' };
    }

    // 2. EXPENSES & PURCHASES
    if (targetCat === 'expenses') {
      const payload = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        transaction_date: r.transaction_date || todayIso,
        vendor: r.vendor || 'Operating Expense',
        type: r.type || 'operating_expense',
        category: r.category || 'Operating Expenses',
        amount: Number(r.amount || 0),
        payment_method: cleanPaymentMethod(r.payment_method),
        created_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await supabase.from('transactions').insert(chunk);
      }

      const currentCached = getCachedTransactions(businessId);
      setCachedTransactions([...payload, ...currentCached], businessId);
      window.dispatchEvent(new Event('ams:transactions-updated'));

      const val = payload.reduce((s, r) => s + r.amount, 0);
      return { count: payload.length, valuation: val, label: 'Expense & Purchase Entries' };
    }

    // 3. INVENTORY & STOCK (with Deduplication by Barcode or Name)
    if (targetCat === 'inventory') {
      const payload = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        name: r.name,
        barcode: r.barcode || '',
        quantity: Number(r.quantity || 0),
        unit_cost: Number(r.unit_cost || 0),
        unit_price: Number(r.unit_price || 0),
        created_at: new Date().toISOString(),
      }));

      let insertedData: any[] = [];
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { data } = await supabase.from('inventory_items').insert(chunk).select();
        if (data) insertedData = [...insertedData, ...data];
      }

      const currentCached = getCachedInventory(businessId);
      const itemMap = new Map<string, any>();
      currentCached.forEach((item: any) => {
        const key = normalizeStr(item.name) || item.id;
        itemMap.set(key, item);
      });

      const incoming = insertedData.length > 0 ? insertedData : payload;
      incoming.forEach((item: any) => {
        const key = normalizeStr(item.name) || item.id;
        itemMap.set(key, {
          id: isUUID(item.id) ? item.id : generateUUID(),
          business_id: businessId,
          name: item.name,
          barcode: item.barcode || '',
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_cost || 0),
          unit_price: Number(item.unit_price || 0),
          created_at: item.created_at || new Date().toISOString(),
        });
      });

      const mergedInventory = Array.from(itemMap.values());
      setCachedInventory(mergedInventory as any, businessId);
      window.dispatchEvent(new Event('ams:inventory-updated'));

      // Update Opening Stock valuation on ledger (replace prior auto-generated migration snapshot to prevent stacking)
      const totalOpeningStockCost = mergedInventory.reduce(
        (sum: number, r: any) => sum + Number(r.quantity || 0) * Number(r.unit_cost || 0),
        0
      );

      if (totalOpeningStockCost > 0) {
        const opnStockTx = {
          id: generateUUID(),
          business_id: businessId,
          transaction_date: todayIso,
          vendor: `Opening Stock: Imported Inventory (${mergedInventory.length} Items)`,
          type: 'current_asset',
          category: 'Opening Stock',
          amount: totalOpeningStockCost,
          payment_method: 'cash',
          created_at: new Date().toISOString(),
        };

        try {
          await supabase.from('transactions').insert([opnStockTx]);
        } catch (_e) {}

        const currentCachedTxs = getCachedTransactions(businessId).filter(
          (tx: any) => !String(tx.vendor || '').startsWith('Opening Stock: Imported Inventory')
        );
        setCachedTransactions([opnStockTx, ...currentCachedTxs], businessId);
        window.dispatchEvent(new Event('ams:transactions-updated'));
      }

      const val = payload.reduce((s, r) => s + r.quantity * r.unit_price, 0);
      return { count: payload.length, valuation: val, label: 'Inventory Items' };
    }

    // 4. INVOICES
    if (targetCat === 'invoices') {
      const payload = validRecords.map((r: any, idx: number) => ({
        id: generateUUID(),
        business_id: businessId,
        invoice_number: r.invoice_number || `INV-${1000 + idx}`,
        customer_name: r.customer_name || 'Customer',
        customer_phone: r.customer_phone || null,
        customer_email: r.customer_email || null,
        amount: Number(r.amount || 0),
        due_date: r.due_date || todayIso,
        status: r.status || 'sent',
        description: r.description || (r.customer_phone ? `Phone: ${r.customer_phone}` : null),
        paid_at: r.status === 'paid' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        await supabase.from('invoices').insert(chunk);
      }

      // Deduplicate invoices by invoice_number + customer_name
      const currentCachedInvs = getCachedInvoices(businessId);
      const invMap = new Map<string, any>();
      currentCachedInvs.forEach((inv: any) => {
        invMap.set(`${normalizeStr(inv.invoice_number)}_${normalizeStr(inv.customer_name)}`, inv);
      });
      payload.forEach((inv: any) => {
        invMap.set(`${normalizeStr(inv.invoice_number)}_${normalizeStr(inv.customer_name)}`, inv);
      });
      setCachedInvoices(Array.from(invMap.values()), businessId);
      window.dispatchEvent(new Event('ams:invoices-updated'));

      // For paid invoices, create revenue entries; for unpaid invoices, sync debtor ledger so Balance Sheet & Bookkeeping show them
      const ledgerTxs = payload.map((inv) => {
        if (inv.status === 'paid') {
          return {
            id: generateUUID(),
            business_id: businessId,
            transaction_date: inv.due_date || todayIso,
            vendor: `Invoice Payment: ${inv.customer_name} (${inv.invoice_number})`,
            type: 'revenue',
            category: 'Sales',
            amount: Number(inv.amount || 0),
            payment_method: 'cash',
            created_at: new Date().toISOString(),
          };
        }
        return {
          id: generateUUID(),
          business_id: businessId,
          transaction_date: inv.due_date || todayIso,
          vendor: `Customer Debtor: ${inv.customer_name}`,
          type: 'current_asset',
          category: `Debtors (Accounts Receivable) | Customer: ${inv.customer_name} | phone:${inv.customer_phone || ''} | email:${inv.customer_email || ''}`,
          amount: Number(inv.amount || 0),
          payment_method: 'cash',
          created_at: new Date().toISOString(),
        };
      });

      if (ledgerTxs.length > 0) {
        for (let i = 0; i < ledgerTxs.length; i += chunkSize) {
          try {
            await supabase.from('transactions').insert(ledgerTxs.slice(i, i + chunkSize));
          } catch (_e) {}
        }
        const currentCachedTxs = getCachedTransactions(businessId);
        setCachedTransactions([...ledgerTxs, ...currentCachedTxs], businessId);
        window.dispatchEvent(new Event('ams:transactions-updated'));
      }

      // Sync customer cache
      const existingCust = getCachedCustomers(businessId);
      const custMap = new Map<string, any>();
      existingCust.forEach((c: any) => custMap.set(normalizeStr(c.customer_name), c));
      payload.forEach((inv) => {
        const key = normalizeStr(inv.customer_name);
        const amt = Number(inv.amount || 0);
        const isPaid = inv.status === 'paid';
        const cur = custMap.get(key) || {
          customer_name: inv.customer_name,
          customer_email: inv.customer_email || null,
          customer_phone: inv.customer_phone || null,
          total_invoiced: 0,
          total_paid: 0,
          total_outstanding: 0,
          invoice_count: 0,
          last_invoice_date: inv.due_date,
        };
        cur.invoice_count += 1;
        cur.total_invoiced += amt;
        if (isPaid) cur.total_paid += amt;
        else cur.total_outstanding += amt;
        if (inv.customer_phone && !cur.customer_phone) cur.customer_phone = inv.customer_phone;
        if (inv.customer_email && !cur.customer_email) cur.customer_email = inv.customer_email;
        custMap.set(key, cur);
      });
      setCachedCustomers(Array.from(custMap.values()), businessId);
      window.dispatchEvent(new Event('ams:customers-updated'));

      const val = payload.reduce((s, r) => s + r.amount, 0);
      return { count: payload.length, valuation: val, label: 'Customer Invoices' };
    }

    // 5. FIXED ASSETS
    if (targetCat === 'assets') {
      const payload = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        transaction_date: r.acquisition_date || todayIso,
        vendor: `Fixed Asset: ${r.name} (${r.category})`,
        type: 'fixed_asset',
        category: `Fixed Assets - ${r.category}`,
        amount: Number(r.cost || 0),
        payment_method: 'bank',
        depreciation_rate: r.depreciation_rate || 0.2,
        created_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += chunkSize) {
        await supabase.from('transactions').insert(payload.slice(i, i + chunkSize));
      }

      const currentCached = getCachedTransactions(businessId);
      setCachedTransactions([...payload, ...currentCached], businessId);
      window.dispatchEvent(new Event('ams:transactions-updated'));

      const val = payload.reduce((s, r) => s + r.amount, 0);
      return { count: payload.length, valuation: val, label: 'Fixed Assets' };
    }

    // 6. CUSTOMERS & DEBTORS (Accounts Receivable under Current Assets)
    if (targetCat === 'customers') {
      const existingCust = getCachedCustomers(businessId);
      const custMap = new Map<string, any>();
      existingCust.forEach((c: any) => custMap.set(normalizeStr(c.customer_name), c));

      validRecords.forEach((r: any) => {
        const key = normalizeStr(r.name);
        if (!key) return;
        const bal = Number(r.balance || 0);
        custMap.set(key, {
          customer_name: r.name,
          customer_phone: r.phone || custMap.get(key)?.customer_phone || null,
          customer_email: r.email || custMap.get(key)?.customer_email || null,
          invoice_count: bal > 0 ? 1 : 0,
          total_invoiced: bal,
          total_paid: 0,
          total_outstanding: bal,
          last_invoice_date: r.due_date || todayIso,
        });
      });

      setCachedCustomers(Array.from(custMap.values()), businessId);
      window.dispatchEvent(new Event('ams:customers-updated'));

      const debtorsWithBalance = validRecords.filter((r: any) => Number(r.balance || 0) > 0);
      if (debtorsWithBalance.length > 0) {
        const debtPayload = debtorsWithBalance.map((r: any) => ({
          id: generateUUID(),
          business_id: businessId,
          transaction_date: r.due_date || todayIso,
          vendor: `Customer Debtor: ${r.name}`,
          type: 'current_asset',
          category: `Debtors (Accounts Receivable) | Customer: ${r.name} | phone:${r.phone || ''} | email:${r.email || ''}`,
          amount: Number(r.balance || 0),
          payment_method: 'cash',
          created_at: new Date().toISOString(),
        }));

        const debtInvoices = debtorsWithBalance.map((r: any, idx: number) => ({
          id: generateUUID(),
          business_id: businessId,
          invoice_number: `INV-OPEN-${1000 + idx}`,
          customer_name: r.name,
          customer_phone: r.phone || null,
          customer_email: r.email || null,
          amount: Number(r.balance || 0),
          due_date: r.due_date || todayIso,
          status: 'sent' as const,
          description: `Opening Receivable Balance: ${r.name}${r.notes ? ` (${r.notes})` : ''}`,
          created_at: new Date().toISOString(),
        }));

        for (let i = 0; i < debtPayload.length; i += chunkSize) {
          await supabase.from('transactions').insert(debtPayload.slice(i, i + chunkSize));
        }
        for (let i = 0; i < debtInvoices.length; i += chunkSize) {
          try {
            await supabase.from('invoices').insert(debtInvoices.slice(i, i + chunkSize));
          } catch (_e) {}
        }

        // Replace any previous migrated debtor rows for the same customer names so re-importing updates rather than stacks
        const importedNames = new Set(debtorsWithBalance.map((r: any) => normalizeStr(r.name)));
        const currentCachedTxs = getCachedTransactions(businessId).filter((tx: any) => {
          if (tx.type !== 'current_asset') return true;
          const v = String(tx.vendor || '');
          if (!v.toLowerCase().startsWith('customer debtor:')) return true;
          const cName = normalizeStr(v.replace(/^customer debtor:\s*/i, ''));
          return !importedNames.has(cName);
        });
        setCachedTransactions([...debtPayload, ...currentCachedTxs], businessId);
        window.dispatchEvent(new Event('ams:transactions-updated'));

        const currentCachedInvs = getCachedInvoices(businessId).filter((inv: any) => {
          const isMigratedOpen = String(inv.invoice_number || '').startsWith('INV-OPEN-');
          return !(isMigratedOpen && importedNames.has(normalizeStr(inv.customer_name)));
        });
        setCachedInvoices([...debtInvoices, ...currentCachedInvs], businessId);
        window.dispatchEvent(new Event('ams:invoices-updated'));
      }

      const val = validRecords.reduce((s, r) => s + Number(r.balance || 0), 0);
      return { count: validRecords.length, valuation: val, label: 'Customer & Debtor Accounts' };
    }

    // 7. SUPPLIERS & CREDITORS
    if (targetCat === 'suppliers') {
      const supplierList = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        name: r.name,
        phone: r.phone || null,
        email: r.email || null,
        category: r.category || 'Inventory Goods',
        debt_type: 'inventory' as const,
        balance_owed: Number(r.balance_owed || 0),
        starting_debt: Number(r.balance_owed || 0),
        payment_terms: r.payment_terms || 'Net 30',
        due_date: r.due_date || null,
        notes: r.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Optional supplied inventory goods
      const goodsItems: any[] = [];
      validRecords.forEach((r: any) => {
        if (r.item_name || Number(r.quantity || 0) > 0) {
          const qty = Math.max(1, Number(r.quantity || 1));
          let unitCost = Number(r.unit_cost || 0);
          if (unitCost <= 0 && Number(r.balance_owed || 0) > 0) {
            unitCost = Math.round((Number(r.balance_owed) / qty) * 100) / 100;
          }
          let unitPrice = Number(r.unit_price || 0);
          if (unitPrice <= 0 && unitCost > 0) {
            unitPrice = Math.round(unitCost * 1.25 * 100) / 100;
          }

          goodsItems.push({
            id: generateUUID(),
            business_id: businessId,
            name: r.item_name ? String(r.item_name).trim() : `${r.name} Stock Items`,
            barcode: '',
            quantity: qty,
            unit_cost: unitCost,
            unit_price: unitPrice,
            created_at: new Date().toISOString(),
          });
        }
      });

      if (goodsItems.length > 0) {
        for (let i = 0; i < goodsItems.length; i += chunkSize) {
          await supabase.from('inventory_items').insert(goodsItems.slice(i, i + chunkSize));
        }
        const currentCachedInv = getCachedInventory(businessId);
        setCachedInventory([...goodsItems, ...currentCachedInv] as any, businessId);
        window.dispatchEvent(new Event('ams:inventory-updated'));
      }

      const payablePayload = validRecords
        .filter((r: any) => Number(r.balance_owed || 0) > 0)
        .map((r: any, idx: number) => ({
          id: supplierList[idx]?.id || generateUUID(),
          business_id: businessId,
          transaction_date: todayIso,
          vendor: `Supplier: ${r.name}`,
          type: 'short_term_liability',
          category: 'Accounts Payable',
          amount: Number(r.balance_owed || 0),
          payment_method: 'bank',
          created_at: new Date().toISOString(),
        }));

      if (payablePayload.length > 0) {
        for (let i = 0; i < payablePayload.length; i += chunkSize) {
          await supabase.from('transactions').insert(payablePayload.slice(i, i + chunkSize));
        }
        const currentCachedTxs = getCachedTransactions(businessId);
        setCachedTransactions([...payablePayload, ...currentCachedTxs], businessId);
        window.dispatchEvent(new Event('ams:transactions-updated'));
      }

      const existingSup = getCachedSuppliers(businessId);
      const supMap = new Map<string, any>();
      existingSup.forEach((s: any) => supMap.set(normalizeStr(s.name), s));
      supplierList.forEach((s: any) => supMap.set(normalizeStr(s.name), s));
      setCachedSuppliers(Array.from(supMap.values()), businessId);
      window.dispatchEvent(new Event('ams:suppliers-data-updated'));

      const val = validRecords.reduce((s, r) => s + Number(r.balance_owed || 0), 0);
      return { count: validRecords.length, valuation: val, label: 'Suppliers & Creditor Accounts' };
    }

    // 8. OPENING BALANCES & TRIAL BALANCE
    if (targetCat === 'opening_balances') {
      const payload = validRecords.map((r: any) => ({
        id: generateUUID(),
        business_id: businessId,
        transaction_date: r.as_of_date || todayIso,
        vendor: r.resolved_vendor || `Opening Balance: ${r.account_name}`,
        type: r.resolved_tx_type || 'current_asset',
        category: r.resolved_category || 'Opening Balances',
        amount: Number(r.amount || 0),
        payment_method: r.payment_method || 'cash',
        created_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += chunkSize) {
        await supabase.from('transactions').insert(payload.slice(i, i + chunkSize));
      }

      const currentCached = getCachedTransactions(businessId);
      setCachedTransactions([...payload, ...currentCached], businessId);
      window.dispatchEvent(new Event('ams:transactions-updated'));

      // Also sync any Debtor or Creditor opening rows into Customers / Suppliers caches!
      const debtorRows = validRecords.filter((r: any) => r.is_debtor && Number(r.amount || 0) > 0);
      if (debtorRows.length > 0) {
        const existingCust = getCachedCustomers(businessId);
        const custMap = new Map<string, any>();
        existingCust.forEach((c: any) => custMap.set(normalizeStr(c.customer_name), c));
        debtorRows.forEach((r: any) => {
          const name = r.customer_name || r.account_name;
          custMap.set(normalizeStr(name), {
            customer_name: name,
            customer_phone: null,
            customer_email: null,
            invoice_count: 1,
            total_invoiced: Number(r.amount || 0),
            total_paid: 0,
            total_outstanding: Number(r.amount || 0),
            last_invoice_date: r.as_of_date || todayIso,
          });
        });
        setCachedCustomers(Array.from(custMap.values()), businessId);
        window.dispatchEvent(new Event('ams:customers-updated'));
      }

      const val = payload.reduce((s, r) => s + r.amount, 0);
      return { count: payload.length, valuation: val, label: 'Opening Balance Accounts' };
    }

    // 9. STAFF PAYROLL
    if (targetCat === 'payroll') {
      const payload = validRecords.map((r: any) => {
        const cleanName = String(r.name || 'Staff Member').trim();
        const cleanEmail = r.email ? String(r.email).trim() : `${normalizeStr(cleanName) || 'staff'}_${Date.now().toString(36)}@company.local`;
        return {
          id: generateUUID(),
          business_id: businessId,
          name: cleanName,
          role: r.role ? r.role.toLowerCase() : 'employee',
          salary: Number(r.salary || 0),
          phone: r.phone || null,
          email: cleanEmail,
          branch: r.branch || 'Main Branch',
          created_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < payload.length; i += chunkSize) {
        await supabase.from('business_members').insert(payload.slice(i, i + chunkSize));
      }

      try {
        const staffStorageKey = `ams:staff_members_list_v1_${businessId}`;
        const currentStaff = JSON.parse(localStorage.getItem(staffStorageKey) || '[]');
        localStorage.setItem(staffStorageKey, JSON.stringify([...payload, ...currentStaff]));
        window.dispatchEvent(new Event('ams:staff-updated'));
      } catch (_e) {}

      const val = payload.reduce((s, r) => s + r.salary, 0);
      return { count: payload.length, valuation: val, label: 'Staff & Payroll Records' };
    }

    // 10. UNIVERSAL LEDGER (MIXED TRANSACTIONS)
    const payload = validRecords.map((r: any) => ({
      id: generateUUID(),
      business_id: businessId,
      transaction_date: r.transaction_date || todayIso,
      vendor: r.vendor || 'Imported Entry',
      type: r.type || 'operating_expense',
      category: r.category || 'General Operations',
      amount: Number(r.amount || 0),
      payment_method: cleanPaymentMethod(r.payment_method),
      created_at: new Date().toISOString(),
    }));

    for (let i = 0; i < payload.length; i += chunkSize) {
      await supabase.from('transactions').insert(payload.slice(i, i + chunkSize));
    }

    const currentCached = getCachedTransactions(businessId);
    setCachedTransactions([...payload, ...currentCached], businessId);
    window.dispatchEvent(new Event('ams:transactions-updated'));

    // Auto-sync any debtor rows detected in the mixed ledger into Customers cache
    const mixedDebtors = validRecords.filter((r: any) => r.is_debtor && Number(r.amount || 0) > 0);
    if (mixedDebtors.length > 0) {
      const existingCust = getCachedCustomers(businessId);
      const custMap = new Map<string, any>();
      existingCust.forEach((c: any) => custMap.set(normalizeStr(c.customer_name), c));
      mixedDebtors.forEach((r: any) => {
        const name = r.customer_name || r.vendor;
        custMap.set(normalizeStr(name), {
          customer_name: name,
          customer_phone: null,
          customer_email: null,
          invoice_count: 1,
          total_invoiced: Number(r.amount || 0),
          total_paid: 0,
          total_outstanding: Number(r.amount || 0),
          last_invoice_date: r.transaction_date || todayIso,
        });
      });
      setCachedCustomers(Array.from(custMap.values()), businessId);
      window.dispatchEvent(new Event('ams:customers-updated'));
    }

    const val = payload.reduce((s, r) => s + r.amount, 0);
    return { count: payload.length, valuation: val, label: 'Ledger Entries' };
  };

  // Execute Active Sheet Import
  const handleExecuteImport = async () => {
    let activeBid = currentBusinessId;
    if (!activeBid || !isUUID(activeBid)) {
      const resolved = await resolveActiveBusiness();
      activeBid =
        resolved?.id && isUUID(resolved.id)
          ? resolved.id
          : getCachedBusiness()?.id && isUUID(getCachedBusiness()?.id)
          ? getCachedBusiness()!.id
          : generateUUID();
      if (activeBid) setCurrentBusinessId(activeBid);
    }

    if (!activeBid) {
      setErrorMsg('No active business profile found. Please check Settings.');
      return;
    }

    const validRecords = parsedRecords.filter((r) => r.isValid);
    if (validRecords.length === 0) {
      setErrorMsg('No valid records found to import. Please verify that required columns are mapped.');
      return;
    }

    setIsImporting(true);
    setImportProgress(20);
    setErrorMsg(null);

    try {
      const result = await ingestCategoryRecords(activeBid, category, validRecords);
      setImportProgress(100);

      logAuditEvent({
        businessId: activeBid,
        actionType: 'CREATE',
        entityType: 'transaction',
        entityId: `mig_${category}_${Date.now()}`,
        entityName: `${result.count} Imported ${result.label}`,
        description: `Imported ${result.count} ${result.label} totaling ${currency} ${result.valuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        newValue: { count: result.count, totalValuation: result.valuation, category },
      });

      setImportSuccessStats({
        total: result.count,
        value: result.valuation,
        entity: result.label,
      });
    } catch (err: any) {
      setErrorMsg('Import failed: ' + (err.message || 'Database error occurred.'));
    } finally {
      setIsImporting(false);
    }
  };

  // Smart Import ALL Sheets in a Multi-Sheet Workbook
  const handleImportAllSheets = async () => {
    if (!workbookRef || sheetNames.length === 0) return;

    let activeBid = currentBusinessId;
    if (!activeBid || !isUUID(activeBid)) {
      const resolved = await resolveActiveBusiness();
      activeBid =
        resolved?.id && isUUID(resolved.id)
          ? resolved.id
          : getCachedBusiness()?.id && isUUID(getCachedBusiness()?.id)
          ? getCachedBusiness()!.id
          : generateUUID();
      if (activeBid) setCurrentBusinessId(activeBid);
    }
    if (!activeBid) return;

    setIsImporting(true);
    setImportProgress(10);
    setErrorMsg(null);

    try {
      let grandCount = 0;
      let grandValuation = 0;
      const importedCategories: string[] = [];

      for (let idx = 0; idx < sheetNames.length; idx++) {
        const sName = sheetNames[idx];
        const ws = workbookRef.Sheets[sName];
        if (!ws) continue;

        const { headers, rows } = extractSheetRowsAndHeaders(ws);
        if (headers.length === 0 || rows.length === 0) continue;

        const classified = autoClassifySheet(headers, rows, sName);
        const mappedFields = autoMatchHeaders(headers, CATEGORY_CONFIG[classified.category].fields, rows);
        const transformed = buildParsedRecords(rows, classified.category, mappedFields).filter((r: any) => r.isValid);

        if (transformed.length > 0) {
          const res = await ingestCategoryRecords(activeBid, classified.category, transformed);
          grandCount += res.count;
          grandValuation += res.valuation;
          importedCategories.push(`${sName} (${res.count} ${CATEGORY_CONFIG[classified.category].shortLabel})`);
        }

        setImportProgress(Math.min(95, Math.round(((idx + 1) / sheetNames.length) * 100)));
      }

      setImportProgress(100);
      setImportSuccessStats({
        total: grandCount,
        value: grandValuation,
        entity: `Records across ${importedCategories.length} Sheets: ${importedCategories.join(', ')}`,
      });
    } catch (err: any) {
      setErrorMsg('Multi-sheet import failed: ' + (err.message || 'Error processing workbook.'));
    } finally {
      setIsImporting(false);
    }
  };

  // Download Sample Spreadsheet Templates
  const handleDownloadTemplate = (type: MigrationCategory) => {
    let sampleData: any[] = [];
    let tFileName = 'AMS_Template.xlsx';

    if (type === 'sales') {
      tFileName = 'AMS_Sales_Records_Template.xlsx';
      sampleData = [
        { 'Sale Date': '2026-08-01', 'Customer / Item Description': 'Walk-in Retail Cash Sale', Amount: 350.0, 'Payment Method': 'cash', Category: 'Direct Sales' },
        { 'Sale Date': '2026-08-01', 'Customer / Item Description': 'Wholesale Order - Kofi Stores', Amount: 4200.0, 'Payment Method': 'bank', Category: 'Wholesale' },
      ];
    } else if (type === 'expenses') {
      tFileName = 'AMS_Expenses_Template.xlsx';
      sampleData = [
        { 'Expense Date': '2026-08-02', 'Payee / Particulars': 'Electricity Company of Ghana (ECG)', Amount: 850.0, 'Payment Method': 'bank', Category: 'Utilities' },
        { 'Expense Date': '2026-08-03', 'Payee / Particulars': 'Office Stationery & Receipt Rolls', Amount: 240.0, 'Payment Method': 'cash', Category: 'Office Supplies' },
      ];
    } else if (type === 'inventory') {
      tFileName = 'AMS_Inventory_Template.xlsx';
      sampleData = [
        { 'Item Name': 'Basmati Rice 5kg', Barcode: '8901234567890', Quantity: 50, 'Unit Cost': 85.0, 'Selling Price': 110.0 },
        { 'Item Name': 'Cooking Oil 1L', Barcode: '8901234567891', Quantity: 100, 'Unit Cost': 28.0, 'Selling Price': 35.0 },
      ];
    } else if (type === 'invoices') {
      tFileName = 'AMS_Invoices_Template.xlsx';
      sampleData = [
        { 'Invoice #': 'INV-1001', 'Customer Name': 'Alpha Supermarket', Phone: '0551234567', Amount: 4500.0, 'Due Date': '2026-09-15', Status: 'sent', Description: '50 Boxes Cooking Oil' },
        { 'Invoice #': 'INV-1002', 'Customer Name': 'Kofi Enterprise', Phone: '0249876543', Amount: 1250.0, 'Due Date': '2026-08-30', Status: 'paid', Description: 'Rice & Provisions' },
      ];
    } else if (type === 'assets') {
      tFileName = 'AMS_Fixed_Assets_Template.xlsx';
      sampleData = [
        { 'Asset Description': 'Delivery Van (Toyota Hilux)', 'Asset Class': 'Vehicles', 'Purchase Cost': 145000.0, 'Acquisition Date': '2025-06-15', 'Serial / Tag #': 'GR-1234-25', 'Depreciation %': 20 },
        { 'Asset Description': 'Heavy Duty Generator 25kVA', 'Asset Class': 'Machinery', 'Purchase Cost': 45000.0, 'Acquisition Date': '2025-08-10', 'Serial / Tag #': 'GEN-8890', 'Depreciation %': 15 },
      ];
    } else if (type === 'customers') {
      tFileName = 'AMS_Customer_Debtors_Template.xlsx';
      sampleData = [
        { 'Customer Name': 'Nana Kwame Provisions', Phone: '0244112233', Email: 'kwame@gmail.com', 'Outstanding Debt': 3400.0, 'Due Date': '2026-09-15', Notes: 'Madina Market Stall #4' },
        { 'Customer Name': 'Grace Retail Ventures', Phone: '0555778899', Email: 'grace@retail.com', 'Outstanding Debt': 1200.0, 'Due Date': '2026-09-20', Notes: 'Credit terms 14 days' },
      ];
    } else if (type === 'suppliers') {
      tFileName = 'AMS_Suppliers_Creditors_Template.xlsx';
      sampleData = [
        { 'Supplier Name': 'Ghana Rubber Products Ltd', Phone: '0302123456', Email: 'sales@ghanarubber.com', Category: 'Raw Materials', 'Debt Owed': 18500.0, 'Payment Terms': 'Net 30', 'Due Date': '2026-09-30', Notes: 'North Industrial Area' },
        { 'Supplier Name': 'Olam Agri Ghana', Phone: '0302987654', Email: 'orders@olam.com', Category: 'Inventory Goods', 'Debt Owed': 45000.0, 'Payment Terms': 'Net 60', 'Due Date': '2026-10-15', Notes: 'Bulk grains supplier' },
      ];
    } else if (type === 'opening_balances') {
      tFileName = 'AMS_Opening_Balances_Template.xlsx';
      sampleData = [
        { 'Account Name': 'Cash Till / Vault', 'Account Type': 'Asset', Amount: 15000.0, 'As-Of Date': '2026-08-01', Notes: 'Main Store Physical Cash' },
        { 'Account Name': 'GCB Current Account', 'Account Type': 'Asset', Amount: 85000.0, 'As-Of Date': '2026-08-01', Notes: 'Acc #1041130009988' },
        { 'Account Name': 'Trade Debtors: Kofi Enterprise', 'Account Type': 'Debtor', Amount: 6400.0, 'As-Of Date': '2026-08-01', Notes: 'Uncollected credit sales' },
        { 'Account Name': 'Trade Creditors: Olam Ghana', 'Account Type': 'Creditor', Amount: 12000.0, 'As-Of Date': '2026-08-01', Notes: 'Supplier balance payable' },
        { 'Account Name': 'Owner Initial Capital Equity', 'Account Type': 'Equity', Amount: 94400.0, 'As-Of Date': '2026-08-01', Notes: 'Paid-in Capital' },
      ];
    } else if (type === 'payroll') {
      tFileName = 'AMS_Payroll_Roster_Template.xlsx';
      sampleData = [
        { 'Employee Name': 'Emmanuel Mensah', Role: 'Manager', Salary: 4500.0, Phone: '0551112233', Email: 'emmanuel@biz.com', Branch: 'Accra Branch', 'Ghana Card / TIN': 'GHA-712345678-9' },
        { 'Employee Name': 'Akosua Darko', Role: 'Cashier', Salary: 2200.0, Phone: '0244998877', Email: 'akosua@biz.com', Branch: 'Accra Branch', 'Ghana Card / TIN': 'GHA-890123456-1' },
      ];
    } else {
      tFileName = 'AMS_Universal_Ledger_Template.xlsx';
      sampleData = [
        { Date: '2026-08-05', 'Vendor / Description': 'Electricity Company of Ghana', Type: 'Expense', Amount: 1450.0, Category: 'Utilities', 'Payment Method': 'bank' },
        { Date: '2026-08-10', 'Vendor / Description': 'Walk-in Retail Cash Sales', Type: 'Revenue', Amount: 8900.0, Category: 'Direct Sales', 'Payment Method': 'cash' },
        { Date: '2026-08-12', 'Vendor / Description': 'Customer Debtor: Ama Supermarket', Type: 'Debtor', Amount: 2400.0, Category: 'Debtors (Accounts Receivable)', 'Payment Method': 'cash' },
      ];
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, tFileName);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center">
              <Icon name="upload" size={16} />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Data Migration &amp; Import</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 max-w-3xl leading-relaxed">
            Import spreadsheets (`.xlsx`, `.xls`, `.csv`, `.tsv`) or `.json` backups of any structure. Columns, dates, currencies, debtors, creditors, stock, and ledger accounts are automatically sensed and reconciled across your books.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleDownloadTemplate(category)}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition flex items-center gap-1.5"
          >
            <Icon name="download" size={14} /> Download {CATEGORY_CONFIG[category].shortLabel} Template
          </button>
        </div>
      </div>

      {/* Category Selector Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3 overflow-x-auto">
        {(Object.keys(CATEGORY_CONFIG) as MigrationCategory[]).map((catKey) => {
          const cfg = CATEGORY_CONFIG[catKey];
          const isSelected = category === catKey;
          return (
            <button
              key={catKey}
              onClick={() => handleManualCategoryChange(catKey)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon name={cfg.icon} size={14} />
              <span>{cfg.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* AUTO-DETECTED BANNER */}
      {autoDetectedInfo && !importSuccessStats && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Icon name="check" size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900">
                  Detected Format: {CATEGORY_CONFIG[autoDetectedInfo.category].label}
                </h4>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-200/80 text-slate-700 rounded-md">
                  {autoDetectedInfo.confidence}% match
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Sensed via: <strong className="text-slate-700">{autoDetectedInfo.reason}</strong> &rarr; Routing to{' '}
                <span className="text-slate-700 font-medium">{CATEGORY_CONFIG[category].destination}</span>
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Need a different target? Select any tab above.
          </div>
        </div>
      )}

      {/* MULTI-SHEET WORKBOOK BAR */}
      {sheetNames.length > 1 && !importSuccessStats && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Icon name="file" size={13} /> Multi-Sheet Workbook ({sheetNames.length} sheets found)
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {sheetNames.map((sName) => (
                <button
                  key={sName}
                  onClick={() => handleSwitchSheet(sName)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
                    activeSheet === sName
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <Icon name="file" size={12} /> {sName}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleImportAllSheets}
            disabled={isImporting}
            className="px-4 py-2.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition shrink-0 flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="zap" size={13} /> Smart Import All {sheetNames.length} Sheets
          </button>
        </div>
      )}

      {/* SUCCESS BANNER */}
      {importSuccessStats && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base">
                ✓
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Import Completed &amp; Reconciled</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synchronized <strong>{importSuccessStats.total} {importSuccessStats.entity}</strong> across your ledger and financial reports.
                </p>
              </div>
            </div>
            <div className="sm:text-right bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
              <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Total Value Synchronized</p>
              <p className="text-lg font-bold text-slate-900">
                {currency} {importSuccessStats.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-100">
            {category === 'sales' && (
              <Link href="/sales" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Sales Register &rarr;
              </Link>
            )}
            {category === 'expenses' && (
              <Link href="/bookkeeping" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Bookkeeping &rarr;
              </Link>
            )}
            {category === 'inventory' && (
              <Link href="/inventory" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Inventory &rarr;
              </Link>
            )}
            {category === 'invoices' && (
              <Link href="/invoices" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Invoices &rarr;
              </Link>
            )}
            {category === 'customers' && (
              <Link href="/customers" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Customers &amp; Debtors &rarr;
              </Link>
            )}
            {category === 'suppliers' && (
              <Link href="/suppliers" className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition">
                Open Suppliers &amp; Payables &rarr;
              </Link>
            )}
            <Link
              href="/reports"
              className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition"
            >
              View Balance Sheet &amp; P&amp;L &rarr;
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition"
            >
              View Dashboard &rarr;
            </Link>
            <button
              onClick={resetUpload}
              className="px-4 py-2 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between">
          <p className="text-xs font-semibold text-red-700 flex items-center gap-2">
            <Icon name="alert" size={14} /> {errorMsg}
          </p>
          <button onClick={() => setErrorMsg(null)} className="text-xs text-red-700 font-semibold hover:underline">
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
          className="border-2 border-dashed border-slate-300 hover:border-slate-500 bg-white hover:bg-slate-50/60 rounded-2xl p-12 text-center cursor-pointer transition flex flex-col items-center justify-center gap-4"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
            accept=".xlsx,.xls,.csv,.tsv,.json"
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Icon name="upload" size={24} />
          </div>

          <div className="max-w-lg">
            <h3 className="text-base font-bold text-slate-900">
              Drop any Excel, CSV, or JSON file here
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Automatically senses <strong>Stock &amp; Inventory</strong>, <strong>Customer Debtors</strong>, <strong>Supplier Creditors</strong>, <strong>Invoices</strong>, <strong>Sales</strong>, <strong>Expenses</strong>, <strong>Fixed Assets</strong>, and <strong>Opening Balances</strong> — even if column names or formats differ.
            </p>
          </div>

          <span className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl shadow-sm">
            Choose File to Import
          </span>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING & PREVIEW IF FILE LOADED */}
      {fileName && !importSuccessStats && (
        <div className="space-y-6">
          {/* File summary bar */}
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <Icon name="file" size={16} />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {fileName} {activeSheet ? `(Sheet: ${activeSheet})` : ''}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {rawRows.length} rows detected • Destination: <strong className="text-slate-700">{CATEGORY_CONFIG[category].destination}</strong>
                </p>
              </div>
            </div>

            {category === 'inventory' && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-600 font-medium">Auto-Markup Missing Selling Price:</span>
                <div className="flex items-center gap-1">
                  {[15, 25, 35, 50].map((m) => (
                    <button
                      key={m}
                      onClick={() => setTargetMargin(m)}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition ${
                        targetMargin === m
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
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
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline self-start md:self-auto"
            >
              Choose a different file
            </button>
          </div>

          {/* COLUMN AUTO-MATCHER CARDS */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  1. Column Mapping ({CATEGORY_CONFIG[category].label})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Columns from your file have been matched automatically. You can adjust any dropdown below if needed.
                </p>
              </div>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-lg">
                Auto-Sensed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {mappings.map((f) => (
                <div key={f.key} className="bg-slate-50/70 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">{f.label}</span>
                    {f.required && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">
                        Required
                      </span>
                    )}
                  </div>

                  <select
                    value={f.matchedHeader || '__none__'}
                    onChange={(e) => handleManualMappingChange(f.key, e.target.value)}
                    className="w-full bg-white border border-slate-200 text-xs text-slate-800 rounded-lg p-2 focus:border-slate-500 outline-none"
                  >
                    <option value="__none__">-- Not Mapped / Auto-Fallback --</option>
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
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-900">
                  2. Reconciliation Preview
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 rounded-md">
                  {validCount} of {parsedRecords.length} rows valid
                </span>
              </div>

              <div className="text-xs text-slate-600">
                Total Value: <strong className="text-slate-900">{currency} {totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold tracking-wider sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Status</th>
                    {category === 'sales' && (
                      <>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Customer / Description</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Method</th>
                        <th className="p-3.5 text-right">Amount</th>
                      </>
                    )}
                    {category === 'expenses' && (
                      <>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Payee / Description</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Method</th>
                        <th className="p-3.5 text-right">Amount</th>
                      </>
                    )}
                    {category === 'inventory' && (
                      <>
                        <th className="p-3.5">Item Name</th>
                        <th className="p-3.5">SKU / Barcode</th>
                        <th className="p-3.5 text-right">Qty</th>
                        <th className="p-3.5 text-right">Unit Cost</th>
                        <th className="p-3.5 text-right">Selling Price</th>
                      </>
                    )}
                    {category === 'invoices' && (
                      <>
                        <th className="p-3.5">Invoice #</th>
                        <th className="p-3.5">Customer</th>
                        <th className="p-3.5">Due Date</th>
                        <th className="p-3.5 text-right">Amount</th>
                        <th className="p-3.5">Status</th>
                      </>
                    )}
                    {category === 'assets' && (
                      <>
                        <th className="p-3.5">Asset Name</th>
                        <th className="p-3.5">Class</th>
                        <th className="p-3.5">Purchase Date</th>
                        <th className="p-3.5 text-right">Cost</th>
                        <th className="p-3.5 text-right">Depr. Rate</th>
                      </>
                    )}
                    {category === 'customers' && (
                      <>
                        <th className="p-3.5">Customer / Debtor Name</th>
                        <th className="p-3.5">Phone</th>
                        <th className="p-3.5">Email</th>
                        <th className="p-3.5 text-right">Receivable Balance (Debtor)</th>
                        <th className="p-3.5">Notes</th>
                      </>
                    )}
                    {category === 'suppliers' && (
                      <>
                        <th className="p-3.5">Supplier Name</th>
                        <th className="p-3.5">Phone</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5 text-right">Payable Balance</th>
                        <th className="p-3.5">Terms</th>
                      </>
                    )}
                    {category === 'opening_balances' && (
                      <>
                        <th className="p-3.5">Account Name</th>
                        <th className="p-3.5">Balance Sheet Mapping</th>
                        <th className="p-3.5 text-right">Opening Balance</th>
                        <th className="p-3.5">As-Of Date</th>
                      </>
                    )}
                    {category === 'payroll' && (
                      <>
                        <th className="p-3.5">Employee Name</th>
                        <th className="p-3.5">Role</th>
                        <th className="p-3.5 text-right">Monthly Salary</th>
                        <th className="p-3.5">Phone</th>
                        <th className="p-3.5">ID / SSNIT</th>
                      </>
                    )}
                    {category === 'transactions' && (
                      <>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Particulars / Party</th>
                        <th className="p-3.5">Mapped Ledger Type</th>
                        <th className="p-3.5 text-right">Amount</th>
                        <th className="p-3.5">Category</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRecords.slice(0, 50).map((r: any) => (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5">
                        {r.isValid ? (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded">
                            {r.autoPriced ? `Ready (+${targetMargin}%)` : 'Ready'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-600 rounded">
                            Skipped
                          </span>
                        )}
                      </td>

                      {category === 'sales' && (
                        <>
                          <td className="p-3.5 text-slate-500">{r.transaction_date}</td>
                          <td className="p-3.5 text-slate-900 font-medium">{r.vendor}</td>
                          <td className="p-3.5 text-slate-500">{r.category}</td>
                          <td className="p-3.5 uppercase text-[10px] font-semibold text-slate-600">{r.payment_method}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {Number(r.amount).toFixed(2)}</td>
                        </>
                      )}

                      {category === 'expenses' && (
                        <>
                          <td className="p-3.5 text-slate-500">{r.transaction_date}</td>
                          <td className="p-3.5 text-slate-900 font-medium">{r.vendor}</td>
                          <td className="p-3.5 text-slate-500">{r.category}</td>
                          <td className="p-3.5 uppercase text-[10px] font-semibold text-slate-600">{r.payment_method}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {Number(r.amount).toFixed(2)}</td>
                        </>
                      )}

                      {category === 'inventory' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.name}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{r.barcode || '—'}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{r.quantity}</td>
                          <td className="p-3.5 text-right text-slate-600">{currency} {r.unit_cost.toFixed(2)}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {r.unit_price.toFixed(2)}</td>
                        </>
                      )}

                      {category === 'invoices' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-mono font-medium">{r.invoice_number}</td>
                          <td className="p-3.5 text-slate-900 font-medium">{r.customer_name}</td>
                          <td className="p-3.5 text-slate-500">{r.due_date}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {r.amount.toFixed(2)}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded uppercase">
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {category === 'assets' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.name}</td>
                          <td className="p-3.5 text-slate-500">{r.category}</td>
                          <td className="p-3.5 text-slate-500">{r.acquisition_date}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {r.cost.toFixed(2)}</td>
                          <td className="p-3.5 text-right text-slate-600">{(r.depreciation_rate * 100).toFixed(0)}%/yr</td>
                        </>
                      )}

                      {category === 'customers' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.name}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3.5 text-slate-500">{r.email || '—'}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {r.balance.toFixed(2)}</td>
                          <td className="p-3.5 text-slate-500">{r.notes || 'Current Asset (Debtor)'}</td>
                        </>
                      )}

                      {category === 'suppliers' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.name}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3.5 text-slate-500">{r.category}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {Number(r.balance_owed || 0).toFixed(2)}</td>
                          <td className="p-3.5 text-slate-500">{r.payment_terms}</td>
                        </>
                      )}

                      {category === 'opening_balances' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.account_name}</td>
                          <td className="p-3.5 text-slate-600 text-[11px]">{r.resolved_category} ({r.resolved_tx_type})</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {Number(r.amount || 0).toFixed(2)}</td>
                          <td className="p-3.5 text-slate-500">{r.as_of_date}</td>
                        </>
                      )}

                      {category === 'payroll' && (
                        <>
                          <td className="p-3.5 text-slate-900 font-medium">{r.name}</td>
                          <td className="p-3.5 text-slate-500">{r.role}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {Number(r.salary || 0).toFixed(2)}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{r.phone || '—'}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">{r.ghana_card_tin || '—'}</td>
                        </>
                      )}

                      {category === 'transactions' && (
                        <>
                          <td className="p-3.5 text-slate-500">{r.transaction_date}</td>
                          <td className="p-3.5 text-slate-900 font-medium">{r.vendor}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded uppercase">
                              {r.type}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{currency} {r.amount.toFixed(2)}</td>
                          <td className="p-3.5 text-slate-500">{r.category}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRecords.length > 50 && (
              <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-200">
                Showing first 50 rows of {parsedRecords.length} records. All {validCount} valid rows will be imported.
              </div>
            )}
          </div>

          {/* STEP 3: EXECUTE BUTTON */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Confirm Import of {validCount} {CATEGORY_CONFIG[category].label}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Destination: <strong className="text-slate-800">{CATEGORY_CONFIG[category].destination}</strong>
              </p>
            </div>

            <button
              onClick={handleExecuteImport}
              disabled={isImporting || validCount === 0}
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing... {importProgress}%</span>
                </>
              ) : (
                <>
                  <Icon name="check" size={14} /> Import {validCount} {CATEGORY_CONFIG[category].shortLabel} Records
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* FINANCIAL REPORTS & EXPORT FOOTER */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Financial Statements &amp; Audit Schedules</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            All imported debtors, creditors, inventory stock, assets, and cashbook entries immediately reconcile on your Balance Sheet, Trial Balance, and P&amp;L.
          </p>
        </div>
        <Link
          href="/reports"
          className="px-4 py-2 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl transition self-start sm:self-auto flex items-center gap-1.5 shrink-0"
        >
          <Icon name="trending" size={14} /> Open Financial Reports
        </Link>
      </div>
    </div>
  );
}
