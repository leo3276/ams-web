export type TransactionType =
  | 'revenue'
  | 'cost_of_goods'
  | 'operating_expense'
  | 'fixed_asset'
  | 'current_asset'
  | 'short_term_liability'
  | 'long_term_liability'
  | 'drawings';

export type PaymentMethod = 'cash' | 'bank';

export interface Transaction {
  id: string;
  business_id: string;
  vendor: string;
  amount: number;
  type: TransactionType;
  category: string | null;
  transaction_date: string; // YYYY-MM-DD
  document_url: string | null;
  created_at: string;
  depreciation_rate: number | null; // decimal fraction, e.g. 0.20 for 20%
  payment_method: PaymentMethod;
}

export const TRANSACTION_TYPE_OPTIONS: { label: string; value: TransactionType }[] = [
  { label: 'Revenue', value: 'revenue' },
  { label: 'Cost of goods', value: 'cost_of_goods' },
  { label: 'Operating expense', value: 'operating_expense' },
  { label: 'Fixed asset', value: 'fixed_asset' },
  { label: 'Current asset', value: 'current_asset' },
  { label: 'Short-term liability', value: 'short_term_liability' },
  { label: 'Long-term liability', value: 'long_term_liability' },
  { label: 'Drawings', value: 'drawings' },
];

export interface InventoryItem {
  id: string;
  name: string;
  barcode?: string | null;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  business_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone?: string | null;
  amount: number;
  description: string | null;
  due_date: string;
  status: InvoiceStatus;
  created_at: string;
}

export interface CustomerSummary {
  customer_name: string;
  customer_email: string | null;
  customer_phone?: string | null;
  invoice_count: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  last_invoice_date: string | null;
}

export type DebtType = 'inventory' | 'cash_loan' | 'fixed_asset' | 'service_expense';

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
  debt_type?: DebtType;
  balance_owed: number; // Liability
  payment_terms?: string | null;
  due_date?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface SupplierTransaction {
  id: string;
  business_id: string;
  supplier_id: string;
  type: 'bill' | 'payment'; // 'bill' increases debt, 'payment' decreases debt
  amount: number;
  reference?: string | null;
  notes?: string | null;
  transaction_date: string;
  created_at?: string;
}

