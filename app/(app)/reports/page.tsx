'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Icon } from '@/components/Icons';
import {
  printProfitLossPDF,
  printBalanceSheetPDF,
  printCashFlowPDF,
  printTrialBalancePDF,
  printAccountantAuditPackPDF,
} from '@/lib/pdfGenerator';
import {
  getCachedBusiness,
  getCachedSuppliers,
  setCachedSuppliers,
  getCachedTransactions,
  setCachedTransactions,
  getCachedInventory,
  getCachedInvoices,
  setCachedInvoices,
  getCachedCustomers,
  reconcileCustomerDebtors,
  resolveActiveBusiness,
} from '@/lib/offlineStore';
import { useArchetype } from '@/lib/ArchetypeContext';

type ReportTab = 'all' | 'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance';
type PeriodPreset = 'current_month' | 'last_month' | 'quarter' | 'year';

interface PnL {
  revenue: number;
  cost_of_goods: number;
  operating_expenses: number;
  net_profit: number;
  // Detailed step-by-step P&L schedule fields:
  gross_sales: number;
  returns_inwards: number;
  net_sales: number;
  opening_stock: number;
  cash_bank_purchases: number;
  returns_outwards: number;
  cogas: number;
  closing_stock: number;
  cost_of_sales: number;
  other_revenue: number;
  gross_profit: number;
}

interface BalanceSheet {
  cash: number;
  bank: number;
  debtors: number;
  prepaids: number;
  other_current_assets: number;
  custom_current_liabilities: Record<string, number>;
  current_assets_other: number; // Inventory
  total_current_assets: number;
  fixed_assets_cost: number;
  accumulated_depreciation: number;
  fixed_assets_nbv: number;
  total_assets: number;
  short_term_liabilities: number;
  long_term_liabilities: number;
  total_liabilities: number;
  owners_equity: number;
  net_profit_to_date: number;
  drawings_to_date: number;
}

interface CashFlow {
  operating_activities: number;
  investing_activities: number;
  financing_activities: number;
  net_cash_flow: number;
}

interface TrialBalanceRow {
  category: string;
  debit: number;
  credit: number;
}

function getPeriodDates(preset: PeriodPreset) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === 'current_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: iso(start),
      end: iso(end),
      label: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: iso(start),
      end: iso(end),
      label: start.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  }

  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return {
      start: iso(start),
      end: iso(end),
      label: `Q${q + 1} ${now.getFullYear()}`,
    };
  }

  // Full Year
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return {
    start: iso(start),
    end: iso(end),
    label: `Full Year ${now.getFullYear()}`,
  };
}

export default function ReportsPage() {
  const { archetype, isEducation, schoolSettings } = useArchetype();
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [tab, setTab] = useState<ReportTab>('all');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('current_month');
  const [periodLabel, setPeriodLabel] = useState('');

  const [pnl, setPnl] = useState<PnL | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [totalDebits, setTotalDebits] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const b = await resolveActiveBusiness();
    if (!b) {
      setErrorMsg('No business found for this account yet.');
      setLoading(false);
      return;
    }

    setBusinessId(b.id);
    setBusinessName(b.name || 'My Business');
    setCurrency(b.currency || 'GHS');

    const { start, end, label } = getPeriodDates(periodPreset);
    setPeriodLabel(label);

    const [pnlRes, bsRes, cfRes, tbRes, txRes, staffRes, invRes, invsRes] = await Promise.all([
      supabase.rpc('get_pnl_report', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_balance_sheet', { p_business_id: b.id, p_as_of_date: end }),
      supabase.rpc('get_cash_flow_statement', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.rpc('get_trial_balance', { p_business_id: b.id, p_start_date: start, p_end_date: end }),
      supabase.from('transactions').select('*').eq('business_id', b.id).lte('transaction_date', end),
      supabase.from('business_members').select('*').eq('business_id', b.id),
      supabase.from('inventory_items').select('*').eq('business_id', b.id),
      supabase.from('invoices').select('*').eq('business_id', b.id),
    ]);

    const remoteTxs = txRes.data ?? [];
    const localTxs = getCachedTransactions(b.id);
    const mergedMap = new Map();
    localTxs.forEach((t: any) => mergedMap.set(t.id, t));
    remoteTxs.forEach((t: any) => mergedMap.set(t.id, t));
    const allTxs = Array.from(mergedMap.values());
    setCachedTransactions(allTxs, b.id);

    // Customer Owings / Unpaid Invoices + Reconciled Debtors (Zero Double-Counting)
    const remoteInvs = invsRes.data ?? [];
    const localInvs = getCachedInvoices(b.id);
    const invsMap = new Map();
    localInvs.forEach((i: any) => invsMap.set(i.id || i.invoice_number, i));
    remoteInvs.forEach((i: any) => invsMap.set(i.id || i.invoice_number, i));
    const allInvoices = Array.from(invsMap.values());
    setCachedInvoices(allInvoices as any, b.id);
    const reconciledDebtors = reconcileCustomerDebtors(
      allInvoices as any,
      allTxs,
      getCachedCustomers(b.id)
    );
    const finalDebtors = reconciledDebtors.totalDebtors;

    // Current Inventory Valuation (Closing Stock)
    const remoteInv = invRes.data ?? [];
    const localInv = getCachedInventory(b.id);
    const invMap = new Map();
    localInv.forEach((i: any) => invMap.set(i.id, i));
    remoteInv.forEach((i: any) => invMap.set(i.id, i));
    const allInv = Array.from(invMap.values());
    const closingStockValuation = allInv.reduce((sum: number, item: any) => sum + (Number(item.quantity || 0) * Number(item.unit_cost || 0)), 0);

    let periodRev = 0;
    let periodStockPurchases = 0;
    let periodCarriageInwards = 0;
    let periodOpeningStock = 0;
    let periodReturns = 0;
    let periodOtherRev = 0;
    let periodOpex = 0;

    let cashIn = 0;
    let cashOut = 0;
    let bankIn = 0;
    let bankOut = 0;

    let fixedAssetsPurchased = 0;
    let computedAccumulatedDeprec = 0;
    let drawingsTotal = 0;

    let longTermLoansFromTxs = 0;
    let shortTermTxsPayable = 0;
    let openingCapitalInjected = 0;
    let prepaidsTotal = 0;
    let otherCurrentAssetsTotal = 0;

    let cfOperatingIn = 0;
    let cfOperatingOut = 0;
    let cfInvestingOut = 0;
    let cfFinancingIn = 0;
    let cfFinancingOut = 0;

    const customCurrentLiabMap: Record<string, number> = {};

    allTxs.forEach((t: any) => {
      const amt = Number(t.amount || 0);
      const isBank = t.payment_method === 'bank';
      const inPeriod = t.transaction_date >= start && t.transaction_date <= end;
      const isOpeningBalance =
        t.category === 'Opening Balances' ||
        t.category === 'Opening Stock' ||
        (t.vendor && t.vendor.startsWith('Opening Balance:')) ||
        (t.vendor && t.vendor.startsWith('Opening Stock:'));
      const isSupplierBill =
        t.type === 'short_term_liability' ||
        t.type === 'long_term_liability' ||
        (t.category && t.category.includes('Accounts Payable')) ||
        (t.vendor && t.vendor.startsWith('Supplier:'));

      const catLower = (t.category || '').toLowerCase().trim();
      const venLower = (t.vendor || '').toLowerCase().trim();

      // Check for user-typed Current Asset entries: Cash, Bank, Debtors, Prepaids, Opening Stock, or Other Assets
      if (t.type === 'current_asset') {
        const isStockCategory = catLower.includes('stock') || catLower.includes('inventory') || venLower.includes('stock') || venLower.includes('inventory');
        const isDebtorCategory = catLower.includes('debtor') || catLower.includes('receivable') || venLower.includes('debtor');
        const isPrepaidCategory = catLower.includes('prepaid') || venLower.includes('prepaid');
        const isOtherAssetCategory = catLower.includes('other') || venLower.includes('other');
        const isBankCategory = !isStockCategory && !isDebtorCategory && !isPrepaidCategory && !isOtherAssetCategory && (isBank || catLower.includes('bank') || catLower.includes('momo') || venLower.includes('bank') || venLower.includes('momo'));
        const isCashCategory = !isStockCategory && !isDebtorCategory && !isPrepaidCategory && !isOtherAssetCategory && !isBankCategory;

        if (isOpeningBalance || isStockCategory) {
          openingCapitalInjected += amt;
          if (isStockCategory) {
            // Take the latest Opening Stock snapshot rather than summing duplicate imports
            periodOpeningStock = Math.max(periodOpeningStock, amt);
          } else if (isDebtorCategory) {
            // Reconciled via reconcileCustomerDebtors above
          } else if (isPrepaidCategory) {
            prepaidsTotal += amt;
          } else if (isBankCategory) {
            bankIn += amt;
            if (inPeriod) cfFinancingIn += amt;
          } else if (isCashCategory) {
            cashIn += amt;
            if (inPeriod) cfFinancingIn += amt;
          } else {
            otherCurrentAssetsTotal += amt;
          }
          return;
        }

        // Live Current Asset Deposit / Entry (positive inflow into designated asset)
        if (isDebtorCategory) {
          // Reconciled via reconcileCustomerDebtors above
        } else if (isPrepaidCategory) {
          prepaidsTotal += amt;
          if (isBank) bankOut += amt;
          else cashOut += amt;
          if (inPeriod) cfOperatingOut += amt;
        } else if (isBankCategory) {
          bankIn += amt; // Bank / MoMo deposit increases bank balance
          if (inPeriod) cfFinancingIn += amt;
        } else if (isCashCategory) {
          cashIn += amt; // Cash deposit increases cash balance
          if (inPeriod) cfFinancingIn += amt;
        } else {
          otherCurrentAssetsTotal += amt;
        }
        return;
      }

      if (t.type === 'short_term_liability') {
        if (isOpeningBalance) {
          openingCapitalInjected += amt;
        }
        if (!isSupplierBill) {
          shortTermTxsPayable += amt;
          const label = t.category || t.vendor || 'Other Current Liability';
          customCurrentLiabMap[label] = (customCurrentLiabMap[label] || 0) + amt;
          if (isBank) bankIn += amt;
          else cashIn += amt;
          if (inPeriod) cfFinancingIn += amt;
        }
        return;
      }

      if (isOpeningBalance) {
        openingCapitalInjected += amt;
        if (t.type === 'fixed_asset') {
          fixedAssetsPurchased += amt;
          const depRate = Number(t.depreciation_rate || 0);
          if (depRate > 0) {
            computedAccumulatedDeprec += amt * (depRate > 1 ? depRate / 100 : depRate);
          }
        } else {
          if (isBank) bankIn += amt;
          else cashIn += amt;
          if (inPeriod) cfFinancingIn += amt;
        }
        return;
      }

      if (t.type === 'revenue') {
        if (inPeriod) {
          if (t.category === 'Other Income' || t.category === 'External Revenue') {
            periodOtherRev += amt;
          } else {
            periodRev += amt;
          }
          cfOperatingIn += amt;
        }
        if (isBank) bankIn += amt;
        else cashIn += amt;
      } else if (t.type === 'deposit') {
        // Owner Capital Injection / Cash Deposit into Business
        openingCapitalInjected += amt;
        if (isBank) bankIn += amt;
        else cashIn += amt;
        if (inPeriod) cfFinancingIn += amt;
      } else if (t.type === 'return' || (t.category && t.category.toLowerCase().includes('customer sales return')) || (t.vendor && t.vendor.toLowerCase().startsWith('customer refund:'))) {
        // Customer Sales Return: Subtracted from Gross Sales in P&L for Net Sales
        if (inPeriod) {
          periodReturns += amt;
          cfOperatingOut += amt;
        }
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'cost_of_goods') {
        if (inPeriod) {
          if (t.category?.toLowerCase().includes('carriage') || t.vendor?.toLowerCase().includes('carriage')) {
            periodCarriageInwards += amt;
          } else {
            periodStockPurchases += amt;
          }
          cfOperatingOut += amt;
        }
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'operating_expense') {
        if (inPeriod) {
          periodOpex += amt;
          cfOperatingOut += amt;
        }
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'drawings') {
        drawingsTotal += amt;
        if (isBank) bankOut += amt;
        else cashOut += amt;
        if (inPeriod) cfFinancingOut += amt;
      } else if (t.type === 'fixed_asset') {
        fixedAssetsPurchased += amt;
        const depRate = Number(t.depreciation_rate || 0);
        if (depRate > 0) {
          computedAccumulatedDeprec += amt * (depRate > 1 ? depRate / 100 : depRate);
        }
        if (isBank) bankOut += amt;
        else cashOut += amt;
        if (inPeriod) cfInvestingOut += amt;
      } else if (t.type === 'long_term_liability' && !isSupplierBill) {
        longTermLoansFromTxs += amt;
        if (isBank) bankIn += amt;
        else cashIn += amt;
        if (inPeriod) cfFinancingIn += amt;
      }
    });

    const cachedSups = getCachedSuppliers(b.id);
    const supsMap = new Map<string, any>();
    cachedSups.forEach((s) => {
      const key = (s.name || '').toLowerCase().trim();
      if (key) supsMap.set(key, s);
    });

    // Scan all transactions for supplier bills / accounts payable
    allTxs.forEach((t: any) => {
      const isSupplierBill =
        t.type === 'short_term_liability' ||
        t.type === 'long_term_liability' ||
        (t.category && t.category.includes('Accounts Payable')) ||
        (t.vendor && t.vendor.startsWith('Supplier:'));

      if (isSupplierBill) {
        const rawVendor = (t.vendor || '').replace(/^Supplier:\s*/i, '').trim() || 'Supplier Creditor';
        const key = rawVendor.toLowerCase().trim();
        const amt = Number(t.amount || 0);
        if (key && amt > 0) {
          const existing = supsMap.get(key);
          if (!existing) {
            supsMap.set(key, {
              id: t.id || `sup_${Date.now()}`,
              business_id: b.id,
              name: rawVendor,
              phone: null,
              category: 'Accounts Payable',
              debt_type: t.type === 'long_term_liability' ? 'fixed_asset' : 'inventory',
              balance_owed: amt,
              payment_terms: 'Net 30',
              created_at: t.created_at || t.transaction_date || new Date().toISOString(),
            });
          } else if (Number(existing.balance_owed || 0) <= 0) {
            existing.balance_owed = amt;
          }
        }
      }
    });

    const activeSuppliers = Array.from(supsMap.values());
    if (activeSuppliers.length > cachedSups.length) {
      setCachedSuppliers(activeSuppliers, b.id);
    }

    let tradePayablesCurrentLiabilities = 0;
    let tradePayablesFixedAsset = 0;
    let tradePayablesLongTermLoan = 0;
    let tradePayablesLoanCashInflow = 0;
    let tradePayablesLoanBankInflow = 0;

    activeSuppliers.forEach((s) => {
      const bal = Number(s.balance_owed || 0);
      if (bal <= 0) return;
      const isBankChannel = s.loan_channel === 'bank';

      if (s.debt_type === 'fixed_asset') {
        // Fixed asset equipment financing -> Long Term Liability
        tradePayablesFixedAsset += bal;
      } else if (s.debt_type === 'long_term_loan') {
        // Long-term bank/institutional loan -> Long Term Liability
        tradePayablesLongTermLoan += bal;
        if (isBankChannel) tradePayablesLoanBankInflow += bal;
        else tradePayablesLoanCashInflow += bal;
      } else if (s.debt_type === 'cash_loan') {
        // Short-term loan / working capital borrowing -> Current Liability
        tradePayablesCurrentLiabilities += bal;
        if (isBankChannel) tradePayablesLoanBankInflow += bal;
        else tradePayablesLoanCashInflow += bal;
      } else {
        // inventory, raw_materials, packaging, logistics_freight, service_expense -> Current Liability
        tradePayablesCurrentLiabilities += bal;
      }
    });

    // Staff Salaries
    const staffList = staffRes.data ?? [];
    const monthlyRosterPayroll = staffList.reduce((sum: number, m: any) => sum + Number(m.salary || 0), 0);
    const recordedSalaryTxs = allTxs
      .filter((t: any) => t.type === 'operating_expense' && (t.category === 'Payroll & Salaries' || (t.vendor && t.vendor.startsWith('Salary:'))))
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const accruedPayroll = Math.max(0, monthlyRosterPayroll - recordedSalaryTxs);

    // True net Cash & Bank balances (without mid-stream zero-clamping that erases expenses)
    const netCash = (cashIn - cashOut) + tradePayablesLoanCashInflow;
    const netBank = (bankIn - bankOut) + tradePayablesLoanBankInflow;

    // 2. Accurate Comprehensive P&L Statement (Exact Format)
    const grossSales = periodRev;
    const returnsInwards = periodReturns;
    const netSales = grossSales - returnsInwards;

    // Direct Cost of Sales: Actual purchases & carriage disbursed this period + Opening Stock - Closing Stock
    const cashBankPurchases = periodStockPurchases + periodCarriageInwards;
    const cogas = periodOpeningStock + cashBankPurchases;
    const costOfSales = (periodOpeningStock > 0 || closingStockValuation > 0)
      ? Math.max(0, cogas - closingStockValuation)
      : cashBankPurchases;

    // Net Sales - Cost of Sales + Other Revenue = Gross Profit
    const otherRev = periodOtherRev;
    const grossProfit = (netSales - costOfSales) + otherRev;

    // 5. Gross Profit - Operating Expenses = Net Profit
    const totalOpex = periodOpex + accruedPayroll;
    const finalNetProfit = grossProfit - totalOpex;

    setPnl({
      revenue: netSales + otherRev,
      cost_of_goods: costOfSales,
      operating_expenses: totalOpex,
      net_profit: finalNetProfit,
      gross_sales: grossSales,
      returns_inwards: returnsInwards,
      net_sales: netSales,
      opening_stock: periodOpeningStock,
      cash_bank_purchases: cashBankPurchases,
      returns_outwards: 0,
      cogas: cogas,
      closing_stock: closingStockValuation,
      cost_of_sales: costOfSales,
      other_revenue: otherRev,
      gross_profit: grossProfit,
    });

    // 3. Balance Sheet
    const rawBs = bsRes.data?.[0] || {};
    const finalInventoryAsset = closingStockValuation;
    const finalPrepaids = prepaidsTotal;
    const finalOtherCurrentAssets = otherCurrentAssetsTotal;
    const finalCurrentAssets = netCash + netBank + finalDebtors + finalPrepaids + finalOtherCurrentAssets + finalInventoryAsset;

    const finalFixedCost = fixedAssetsPurchased + tradePayablesFixedAsset;
    const accumulatedDeprec = Math.max(Number(rawBs.accumulated_depreciation || 0), Math.round(computedAccumulatedDeprec * 100) / 100);
    const finalFixedNbv = Math.max(0, finalFixedCost - accumulatedDeprec);
    const finalTotalAssets = finalCurrentAssets + finalFixedNbv;

    const finalShortTerm = tradePayablesCurrentLiabilities + shortTermTxsPayable + accruedPayroll;
    const finalLongTerm = tradePayablesFixedAsset + tradePayablesLongTermLoan + longTermLoansFromTxs;
    const finalTotalLiab = finalShortTerm + finalLongTerm;

    const netProfitToDate = finalNetProfit || Number(rawBs.net_profit_to_date || 0);
    const drawingsToDate = Math.max(drawingsTotal, Number(rawBs.drawings_to_date || 0));
    // Fundamental Accounting Equation: Assets = Liabilities + (Owner's Capital + Retained Profit - Drawings)
    const ownersEquity = Math.round((finalTotalAssets - finalTotalLiab - netProfitToDate + drawingsToDate) * 100) / 100;

    setBalanceSheet({
      cash: netCash,
      bank: netBank,
      debtors: finalDebtors,
      prepaids: finalPrepaids,
      other_current_assets: finalOtherCurrentAssets,
      custom_current_liabilities: customCurrentLiabMap,
      current_assets_other: finalInventoryAsset,
      total_current_assets: finalCurrentAssets,
      fixed_assets_cost: finalFixedCost,
      accumulated_depreciation: accumulatedDeprec,
      fixed_assets_nbv: finalFixedNbv,
      total_assets: finalTotalAssets,
      short_term_liabilities: finalShortTerm,
      long_term_liabilities: finalLongTerm,
      total_liabilities: finalTotalLiab,
      owners_equity: ownersEquity,
      net_profit_to_date: netProfitToDate,
      drawings_to_date: drawingsToDate,
    });

    // 4. Cash Flow Statement (Live Ledger Compilation + RPC Fallback)
    const operatingCashFlow = cfOperatingIn - cfOperatingOut;
    const investingCashFlow = -cfInvestingOut;
    const financingCashFlow = (cfFinancingIn + tradePayablesLoanCashInflow + tradePayablesLoanBankInflow) - cfFinancingOut;
    const netCashFlowChange = operatingCashFlow + investingCashFlow + financingCashFlow;

    if (allTxs.length > 0 || tradePayablesLoanCashInflow > 0 || tradePayablesLoanBankInflow > 0) {
      setCashFlow({
        operating_activities: operatingCashFlow,
        investing_activities: investingCashFlow,
        financing_activities: financingCashFlow,
        net_cash_flow: netCashFlowChange,
      });
    } else if (cfRes.data?.[0]) {
      setCashFlow(cfRes.data[0]);
    } else {
      setCashFlow({
        operating_activities: 0,
        investing_activities: 0,
        financing_activities: 0,
        net_cash_flow: 0,
      });
    }

    // 5. Double-Entry Trial Balance Schedule (Compiled from Live Ledger Accounts so Debits == Credits)
    const tbRows: TrialBalanceRow[] = [];
    const pushTb = (category: string, debit: number, credit: number) => {
      const d = Math.round(debit * 100) / 100;
      const c = Math.round(credit * 100) / 100;
      if (d > 0 || c > 0) {
        tbRows.push({ category, debit: d, credit: c });
      }
    };

    if (netCash >= 0) pushTb('Cash on Hand', netCash, 0);
    else pushTb('Cash Overdraft / Shortfall', 0, Math.abs(netCash));

    if (netBank >= 0) pushTb('Bank & Mobile Money Accounts', netBank, 0);
    else pushTb('Bank Overdraft', 0, Math.abs(netBank));

    pushTb('Debtors (Accounts Receivable)', finalDebtors, 0);
    pushTb('Prepaid Expenses', finalPrepaids, 0);
    pushTb('Other Current Assets', finalOtherCurrentAssets, 0);
    pushTb('Closing Stock / Inventory Valuation', finalInventoryAsset, 0);
    pushTb('Fixed Assets (Historical Cost)', finalFixedCost, 0);
    pushTb('Accumulated Depreciation', 0, accumulatedDeprec);
    pushTb('Trade Creditors (Accounts Payable)', 0, finalShortTerm);
    pushTb('Long-Term Loans & Liabilities', 0, finalLongTerm);
    pushTb('Owner Drawings', drawingsToDate, 0);
    pushTb('Cost of Sales (COGS)', costOfSales, 0);
    pushTb('Operating Expenses (OpEx)', totalOpex, 0);
    pushTb('Sales Returns Inwards', returnsInwards, 0);
    pushTb('Gross Sales & Operating Revenue', 0, grossSales + otherRev);

    let dSum = tbRows.reduce((s, r) => s + r.debit, 0);
    let cSum = tbRows.reduce((s, r) => s + r.credit, 0);
    const balancingCapital = Math.round((dSum - cSum) * 100) / 100;
    if (balancingCapital >= 0) {
      pushTb("Owner's Capital & Reserves", 0, balancingCapital);
    } else {
      pushTb("Owner's Capital Deficit", Math.abs(balancingCapital), 0);
    }

    let finalDebits = 0;
    let finalCredits = 0;
    tbRows.forEach((r) => {
      finalDebits += Number(r.debit || 0);
      finalCredits += Number(r.credit || 0);
    });
    setTrialBalance(tbRows);
    setTotalDebits(Math.round(finalDebits * 100) / 100);
    setTotalCredits(Math.round(finalCredits * 100) / 100);

    setLoading(false);
  }, [periodPreset]);

  useEffect(() => {
    loadReports();

    const handleUpdate = () => {
      loadReports();
    };

    window.addEventListener('ams:inventory-updated', handleUpdate);
    window.addEventListener('ams:transactions-updated', handleUpdate);
    window.addEventListener('ams:invoices-updated', handleUpdate);
    window.addEventListener('ams:customers-updated', handleUpdate);
    window.addEventListener('ams:suppliers-data-updated', handleUpdate);
    window.addEventListener('ams:business-updated', handleUpdate);

    return () => {
      window.removeEventListener('ams:inventory-updated', handleUpdate);
      window.removeEventListener('ams:transactions-updated', handleUpdate);
      window.removeEventListener('ams:invoices-updated', handleUpdate);
      window.removeEventListener('ams:customers-updated', handleUpdate);
      window.removeEventListener('ams:suppliers-data-updated', handleUpdate);
      window.removeEventListener('ams:business-updated', handleUpdate);
    };
  }, [loadReports]);

  // Consolidated Financial Brief Export
  const exportConsolidatedBrief = () => {
    let brief = `====================================================\n`;
    brief += `FINANCIAL STATEMENTS BRIEF\n`;
    brief += `Business: ${businessName}\n`;
    brief += `Period: ${periodLabel}\n`;
    brief += `Currency: ${currency}\n`;
    brief += `Generated: ${new Date().toLocaleDateString()}\n`;
    brief += `====================================================\n\n`;

    if (pnl) {
      const gross = Number(pnl.revenue || 0) - Number(pnl.cost_of_goods || 0);
      brief += `1. PROFIT & LOSS STATEMENT\n`;
      brief += `• Revenue:              ${currency} ${Number(pnl.revenue).toLocaleString()}\n`;
      brief += `• Cost of Goods Sold:   ${currency} ${Number(pnl.cost_of_goods).toLocaleString()}\n`;
      brief += `• Gross Profit:         ${currency} ${gross.toLocaleString()}\n`;
      brief += `• Operating Expenses:   ${currency} ${Number(pnl.operating_expenses).toLocaleString()}\n`;
      brief += `• Net Profit:           ${currency} ${Number(pnl.net_profit).toLocaleString()}\n\n`;
    }

    if (balanceSheet) {
      const totEq = Number(balanceSheet.owners_equity || 0) + Number(balanceSheet.net_profit_to_date || 0) - Number(balanceSheet.drawings_to_date || 0);
      brief += `2. BALANCE SHEET\n`;
      brief += `• Total Current Assets: ${currency} ${Number(balanceSheet.total_current_assets).toLocaleString()} (Cash: ${Number(balanceSheet.cash).toLocaleString()}, Bank: ${Number(balanceSheet.bank).toLocaleString()})\n`;
      brief += `• Fixed Assets (NBV):   ${currency} ${Number(balanceSheet.fixed_assets_nbv).toLocaleString()}\n`;
      brief += `• Total Assets:         ${currency} ${Number(balanceSheet.total_assets).toLocaleString()}\n`;
      brief += `• Total Liabilities:    ${currency} ${Number(balanceSheet.total_liabilities).toLocaleString()}\n`;
      brief += `• Total Equity:         ${currency} ${totEq.toLocaleString()}\n\n`;
    }

    if (cashFlow) {
      brief += `3. CASH FLOW STATEMENT\n`;
      brief += `• Operating Cash Flow:  ${currency} ${Number(cashFlow.operating_activities).toLocaleString()}\n`;
      brief += `• Investing Cash Flow:  ${currency} ${Number(cashFlow.investing_activities).toLocaleString()}\n`;
      brief += `• Financing Cash Flow:  ${currency} ${Number(cashFlow.financing_activities).toLocaleString()}\n`;
      brief += `• Net Cash Flow Change: ${currency} ${Number(cashFlow.net_cash_flow).toLocaleString()}\n\n`;
    }

    if (trialBalance.length > 0) {
      brief += `4. TRIAL BALANCE\n`;
      trialBalance.forEach((r) => {
        brief += `  ${r.category.padEnd(20)} | Debit: ${r.debit > 0 ? r.debit.toLocaleString() : '—'} | Credit: ${r.credit > 0 ? r.credit.toLocaleString() : '—'}\n`;
      });
      brief += `  Total Debits:         ${currency} ${totalDebits.toLocaleString()}\n`;
      brief += `  Total Credits:        ${currency} ${totalCredits.toLocaleString()}\n\n`;
    }

    brief += `AMS Software · Certified Report Compilation`;

    const blob = new Blob([brief], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `financial_statements_${periodPreset}_${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportStylishPDF = (target?: 'pnl' | 'balance_sheet' | 'cash_flow' | 'trial_balance') => {
    const which = target || tab;
    if (which === 'all') {
      printAccountantAuditPackPDF(
        {
          periodLabel,
          pnl: pnl
            ? {
                revenue: pnl.revenue,
                cost_of_goods: pnl.cost_of_goods,
                operating_expenses: pnl.operating_expenses,
                net_profit: pnl.net_profit,
              }
            : null,
          balanceSheet: balanceSheet
            ? {
                total_assets: balanceSheet.total_assets,
                total_current_assets: balanceSheet.total_current_assets,
                total_liabilities: balanceSheet.total_liabilities,
                owners_equity: balanceSheet.owners_equity,
                net_profit_to_date: balanceSheet.net_profit_to_date,
                drawings_to_date: balanceSheet.drawings_to_date,
              }
            : null,
          trialBalance,
          totalDebits,
          totalCredits,
        },
        { name: businessName, currency }
      );
    } else if (which === 'balance_sheet' && balanceSheet) {
      printBalanceSheetPDF(balanceSheet, periodLabel, { name: businessName, currency });
    } else if (which === 'pnl' && pnl) {
      printProfitLossPDF(
        {
          revenue: pnl.revenue,
          costOfGoods: pnl.cost_of_goods,
          operatingExpenses: pnl.operating_expenses,
          netProfit: pnl.net_profit,
          gross_sales: pnl.gross_sales,
          returns_inwards: pnl.returns_inwards,
          net_sales: pnl.net_sales,
          opening_stock: pnl.opening_stock,
          cash_bank_purchases: pnl.cash_bank_purchases,
          returns_outwards: pnl.returns_outwards,
          cogas: pnl.cogas,
          closing_stock: pnl.closing_stock,
          cost_of_sales: pnl.cost_of_sales,
          other_revenue: pnl.other_revenue,
          gross_profit: pnl.gross_profit,
        },
        periodLabel,
        { name: businessName, currency }
      );
    } else if (which === 'cash_flow' && cashFlow) {
      printCashFlowPDF(
        {
          operating: cashFlow.operating_activities,
          investing: cashFlow.investing_activities,
          financing: cashFlow.financing_activities,
          net: cashFlow.net_cash_flow,
        },
        periodLabel,
        { name: businessName, currency }
      );
    } else if (which === 'trial_balance' && trialBalance.length > 0) {
      printTrialBalancePDF(trialBalance, totalDebits, totalCredits, periodLabel, { name: businessName, currency });
    } else if (pnl) {
      printProfitLossPDF(
        {
          revenue: pnl.revenue,
          costOfGoods: pnl.cost_of_goods,
          operatingExpenses: pnl.operating_expenses,
          netProfit: pnl.net_profit,
        },
        periodLabel,
        { name: businessName, currency }
      );
    }
  };

  const tbGap = Math.abs(totalDebits - totalCredits);

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Financial Reports &amp; Statements</h1>
          <p className="text-sm text-textSecondary">
            Executive accounting statements compiled directly from your general ledger for {periodLabel}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Presets */}
          <select
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-surface2 text-textPrimary shadow-sm"
          >
            <option value="current_month">Current Month</option>
            <option value="last_month">Last Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">Full Year</option>
          </select>

          <button
            onClick={() => handleExportStylishPDF()}
            className="px-3.5 py-2 text-xs font-bold rounded-lg bg-textPrimary text-white hover:opacity-90 shadow-sm flex items-center gap-1.5"
          >
            <Icon name="file" size={14} /> Export Stylish PDF
          </button>

          <button
            onClick={exportConsolidatedBrief}
            className="px-3.5 py-2 text-xs font-bold rounded-lg border border-border bg-surface2 hover:bg-surface1 text-textPrimary shadow-sm flex items-center gap-1.5"
          >
            <Icon name="download" size={14} /> Text Brief
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto print:hidden">
        <button
          onClick={() => setTab('all')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-bold transition cursor-pointer ${
            tab === 'all'
              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Icon name="file" size={14} />
          <span>Continuous All-in-One View</span>
        </button>
        <button
          onClick={() => setTab('pnl')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-bold transition cursor-pointer ${
            tab === 'pnl'
              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Profit &amp; Loss</span>
        </button>
        <button
          onClick={() => setTab('balance_sheet')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-bold transition cursor-pointer ${
            tab === 'balance_sheet'
              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Balance Sheet</span>
        </button>
        <button
          onClick={() => setTab('cash_flow')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-bold transition cursor-pointer ${
            tab === 'cash_flow'
              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Cash Flow</span>
        </button>
        <button
          onClick={() => setTab('trial_balance')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-bold transition cursor-pointer ${
            tab === 'trial_balance'
              ? 'bg-slate-900 text-white shadow-xs hover:bg-slate-800'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Trial Balance</span>
        </button>
      </div>

      {loading && <p className="text-sm text-textSecondary">Loading financial reports…</p>}
      {!loading && errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}

      {!loading && (
        <div className="space-y-6">
          {/* ======================================================== */}
          {/* 1. PROFIT & LOSS STATEMENT                               */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'pnl') && pnl && (
            <ReportCard
              title={`Statement of Profit or Loss (Trading & Income Statement) · ${periodLabel}`}
              icon="trending"
              onExport={() => handleExportStylishPDF('pnl')}
            >
              <p className="text-xs uppercase font-bold text-textMuted mb-2">1. Sales &amp; Net Revenue</p>
              <ReportRow label="Gross Sales / Turnover" value={Number(pnl.gross_sales ?? pnl.revenue)} currency={currency} />
              {Number(pnl.returns_inwards || 0) > 0 && (
                <ReportRow label="Less: Returns from Customers (Returns Inwards)" value={-Number(pnl.returns_inwards)} currency={currency} />
              )}
              <SubtotalRow
                label="Net Sales"
                value={Number(pnl.net_sales ?? pnl.revenue)}
                currency={currency}
              />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">2. Cost of Sales (COGS)</p>
              <ReportRow label="Opening Stock" value={Number(pnl.opening_stock || 0)} currency={currency} />
              <ReportRow label="Add: Purchases (Cash/Bank Stock Purchased)" value={Number(pnl.cash_bank_purchases || 0)} currency={currency} />
              {Number(pnl.returns_outwards || 0) > 0 && (
                <ReportRow label="Less: Returns Outwards (Supplier Returns)" value={-Number(pnl.returns_outwards)} currency={currency} />
              )}
              <SubtotalRow
                label="Cost of Goods Available for Sale (COGAS)"
                value={Number(pnl.cogas ?? 0)}
                currency={currency}
              />
              <ReportRow label="Less: Closing Stock (Inventory on Hand)" value={-Number(pnl.closing_stock ?? 0)} currency={currency} />
              <SubtotalRow
                label="Cost of Sales"
                value={-Number(pnl.cost_of_sales ?? pnl.cost_of_goods)}
                currency={currency}
              />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">3. Gross Profit &amp; Operating Results</p>
              {Number(pnl.other_revenue || 0) > 0 && (
                <ReportRow label="Add: Other Revenue / Non-Inventory Income" value={Number(pnl.other_revenue)} currency={currency} />
              )}
              <SubtotalRow
                label="Gross Profit"
                value={Number(pnl.gross_profit ?? (pnl.revenue - pnl.cost_of_goods))}
                currency={currency}
              />
              <ReportRow label="Less: Operating Expenses (OpEx)" value={-Number(pnl.operating_expenses)} currency={currency} />
              <TotalRow
                label="Net Profit / (Loss)"
                value={Number(pnl.net_profit)}
                currency={currency}
                isProfit
              />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 2. BALANCE SHEET                                         */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'balance_sheet') && balanceSheet && (
            <ReportCard
              title={`Balance Sheet · As of ${periodLabel}`}
              icon="briefcase"
              onExport={() => handleExportStylishPDF('balance_sheet')}
            >
              <p className="text-xs uppercase font-bold text-textMuted mb-2">Current Assets</p>
              <ReportRow label="Cash on Hand" value={Number(balanceSheet.cash)} currency={currency} />
              <ReportRow label="Bank / MoMo Balances" value={Number(balanceSheet.bank)} currency={currency} />
              <ReportRow label="Debtors (Accounts Receivable)" value={Number(balanceSheet.debtors || 0)} currency={currency} />
              {Number(balanceSheet.prepaids || 0) > 0 && (
                <ReportRow label="Prepaid Expenses" value={Number(balanceSheet.prepaids)} currency={currency} />
              )}
              {Number(balanceSheet.other_current_assets || 0) > 0 && (
                <ReportRow label="Other Current Assets" value={Number(balanceSheet.other_current_assets)} currency={currency} />
              )}
              <ReportRow label="Current Stock / Inventory Valuation" value={Number(balanceSheet.current_assets_other)} currency={currency} />
              <SubtotalRow label="Total Current Assets" value={Number(balanceSheet.total_current_assets)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">Fixed Assets</p>
              <ReportRow label="Equipment / Fixed Assets (Historical Cost)" value={Number(balanceSheet.fixed_assets_cost)} currency={currency} />
              <ReportRow label="Less: Accumulated Depreciation" value={-Number(balanceSheet.accumulated_depreciation)} currency={currency} />
              <SubtotalRow label="Net Book Value (Fixed Assets)" value={Number(balanceSheet.fixed_assets_nbv)} currency={currency} />

              <TotalRow label="TOTAL ASSETS" value={Number(balanceSheet.total_assets)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-6">Liabilities</p>
              <ReportRow label="Trade Creditors / Accounts Payable" value={Number(balanceSheet.short_term_liabilities) - Object.values(balanceSheet.custom_current_liabilities || {}).reduce((s, v) => s + v, 0)} currency={currency} />
              {Object.entries(balanceSheet.custom_current_liabilities || {}).map(([key, val]) => (
                <ReportRow key={`cl_${key}`} label={key} value={Number(val)} currency={currency} />
              ))}
              <ReportRow label="Long-term Liabilities (Loans)" value={Number(balanceSheet.long_term_liabilities)} currency={currency} />
              <SubtotalRow label="Total Liabilities" value={Number(balanceSheet.total_liabilities)} currency={currency} />

              <p className="text-xs uppercase font-bold text-textMuted mb-2 mt-4">Owner&apos;s Equity</p>
              <ReportRow label="Owner&apos;s Initial Capital" value={Number(balanceSheet.owners_equity)} currency={currency} />
              <ReportRow label="Retained Net Profit to Date" value={Number(balanceSheet.net_profit_to_date)} currency={currency} />
              <ReportRow label="Less: Drawings to Date" value={-Number(balanceSheet.drawings_to_date)} currency={currency} />
              <SubtotalRow
                label="Total Equity"
                value={
                  Number(balanceSheet.owners_equity) +
                  Number(balanceSheet.net_profit_to_date) -
                  Number(balanceSheet.drawings_to_date)
                }
                currency={currency}
              />

              <TotalRow
                label="TOTAL LIABILITIES &amp; EQUITY"
                value={
                  Number(balanceSheet.total_liabilities) +
                  Number(balanceSheet.owners_equity) +
                  Number(balanceSheet.net_profit_to_date) -
                  Number(balanceSheet.drawings_to_date)
                }
                currency={currency}
              />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 3. CASH FLOW STATEMENT                                   */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'cash_flow') && cashFlow && (
            <ReportCard
              title={`Cash Flow Statement · ${periodLabel}`}
              icon="refresh"
              onExport={() => handleExportStylishPDF('cash_flow')}
            >
              <ReportRow label="Operating Activities (Sales & Operating Payments)" value={Number(cashFlow.operating_activities)} currency={currency} />
              <ReportRow label="Investing Activities (Asset Purchases & Disposals)" value={Number(cashFlow.investing_activities)} currency={currency} />
              <ReportRow label="Financing Activities (Capital Contributions & Debt)" value={Number(cashFlow.financing_activities)} currency={currency} />
              <TotalRow label="NET CASH FLOW CHANGE" value={Number(cashFlow.net_cash_flow)} currency={currency} isProfit />
            </ReportCard>
          )}

          {/* ======================================================== */}
          {/* 4. TRIAL BALANCE                                         */}
          {/* ======================================================== */}
          {(tab === 'all' || tab === 'trial_balance') && trialBalance.length > 0 && (
            <ReportCard
              title={`Trial Balance Summary · ${periodLabel}`}
              icon="clipboard"
              onExport={() => handleExportStylishPDF('trial_balance')}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-textSecondary uppercase font-bold text-left">
                      <th className="py-2 font-bold">Category</th>
                      <th className="py-2 text-right w-36">Debit ({currency})</th>
                      <th className="py-2 text-right w-36">Credit ({currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trialBalance.map((r) => (
                      <tr key={r.category}>
                        <td className="py-2 text-textPrimary font-medium capitalize">{r.category.replace('_', ' ')}</td>
                        <td className="py-2 text-right text-textPrimary font-mono">
                          {Number(r.debit) > 0 ? Number(r.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="py-2 text-right text-textPrimary font-mono">
                          {Number(r.credit) > 0 ? Number(r.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-bold bg-surface1/60">
                      <td className="py-2.5 text-textPrimary uppercase">Total</td>
                      <td className="py-2.5 text-right text-textPrimary font-mono font-bold">
                        {totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 text-right text-textPrimary font-mono font-bold">
                        {totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Double-Entry Verification Note */}
              <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">Audit Verification: </span>
                  {tbGap < 0.01
                    ? 'Double-entry Trial Balance is in equilibrium (Total Debits = Total Credits).'
                    : `Variance of ${currency} ${tbGap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} detected.`}
                </div>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-800">
                  {tbGap < 0.01 ? 'Balanced ✓' : 'Unbalanced'}
                </span>
              </div>
            </ReportCard>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  title,
  icon,
  onExport,
  children,
}: {
  title: string;
  icon: string;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface2 rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-surface1 border border-border flex items-center justify-center text-textPrimary shrink-0">
            <Icon name={icon} size={15} />
          </span>
          <h2 className="text-base font-bold text-textPrimary">{title}</h2>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-border bg-surface1 hover:bg-surface2 text-textPrimary flex items-center gap-1 shadow-sm transition"
          >
            <Icon name="file" size={12} /> Export Stylish PDF
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReportRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between items-center text-xs py-1">
      <span className="text-textSecondary">{label}</span>
      <span className="font-mono text-textPrimary font-medium">
        {value < 0 ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}

function SubtotalRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between items-center text-xs py-2 border-t border-border font-bold text-textPrimary">
      <span>{label}</span>
      <span className="font-mono">
        {value < 0 ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  currency,
  isProfit,
}: {
  label: string;
  value: number;
  currency: string;
  isProfit?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div className="flex justify-between items-center text-sm py-2.5 mt-2 border-t-2 border-border font-black">
      <span className="text-textPrimary uppercase">{label}</span>
      <span className={`font-mono ${isProfit ? (isNeg ? 'text-danger' : 'text-success') : 'text-textPrimary'}`}>
        {isNeg ? `(${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
    </div>
  );
}
