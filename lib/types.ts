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
  depreciation_rate: number | null; // decimal fraction, e.g. 0.20 for 20% — only meaningful for fixed_asset
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
  quantity: number;
  unit_cost: number;
  unit_price: number;
}
