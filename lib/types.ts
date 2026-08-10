export type TransactionType =
  | 'revenue'
  | 'cost_of_goods'
  | 'operating_expense'
  | 'asset'
  | 'liability';

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
}
