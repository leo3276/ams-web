'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  printProfitLossPDF,
  printBalanceSheetPDF,
  printCashFlowPDF,
  printTrialBalancePDF,
  printAccountantAuditPackPDF,
} from '@/lib/pdfGenerator';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedSuppliers,
  getCachedTransactions,
  setCachedTransactions,
  getCachedInventory,
  getCachedInvoices,
  setCachedInvoices,
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

    // Customer Owings / Unpaid Invoices (Debtors)
    const remoteInvs = invsRes.data ?? [];
    const localInvs = getCachedInvoices(b.id);
    const invsMap = new Map();
    localInvs.forEach((i: any) => invsMap.set(i.id || i.invoice_number, i));
    remoteInvs.forEach((i: any) => invsMap.set(i.id || i.invoice_number, i));
    const allInvoices = Array.from(invsMap.values());
    setCachedInvoices(allInvoices as any, b.id);
    const invoiceDebtorsTotal = allInvoices
      .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0);

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
    let drawingsTotal = 0;

    let longTermLoansFromTxs = 0;
    let shortTermTxsPayable = 0;
    let openingCapitalInjected = 0;
    let debtorsTotal = 0;
    let prepaidsTotal = 0;
    let otherCurrentAssetsTotal = 0;

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
            periodOpeningStock += amt;
          } else if (isDebtorCategory) {
            debtorsTotal += amt;
          } else if (isPrepaidCategory) {
            prepaidsTotal += amt;
          } else if (isBankCategory) {
            bankIn += amt;
          } else if (isCashCategory) {
            cashIn += amt;
          } else {
            otherCurrentAssetsTotal += amt;
          }
          return;
        }

        // Live Current Asset Deposit / Entry (positive inflow into designated asset)
        if (isDebtorCategory) {
          debtorsTotal += amt;
        } else if (isPrepaidCategory) {
          prepaidsTotal += amt;
        } else if (isBankCategory) {
          bankIn += amt; // Bank / MoMo deposit increases bank balance
        } else if (isCashCategory) {
          cashIn += amt; // Cash deposit increases cash balance
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
        }
        return;
      }

      if (isOpeningBalance) {
        openingCapitalInjected += amt;
        if (t.type === 'fixed_asset') {
          fixedAssetsPurchased += amt;
        } else {
          if (isBank) bankIn += amt;
          else cashIn += amt;
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
        }
        if (isBank) bankIn += amt;
        else cashIn += amt;
      } else if (t.type === 'deposit') {
        // Owner Capital Injection / Cash Deposit into Business
        openingCapitalInjected += amt;
        if (isBank) bankIn += amt;
        else cashIn += amt;
      } else if (t.type === 'return' || (t.category && t.category.toLowerCase().includes('customer sales return')) || (t.vendor && t.vendor.toLowerCase().startsWith('customer refund:'))) {
        // Customer Sales Return: Subtracted from Gross Sales in P&L for Net Sales
        if (inPeriod) periodReturns += amt;
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'cost_of_goods') {
        if (inPeriod) {
          if (t.category?.toLowerCase().includes('carriage') || t.vendor?.toLowerCase().includes('carriage')) {
            periodCarriageInwards += amt;
          } else {
            periodStockPurchases += amt;
          }
        }
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'operating_expense') {
        if (inPeriod) periodOpex += amt;
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'drawings') {
        drawingsTotal += amt;
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'fixed_asset') {
        fixedAssetsPurchased += amt;
        if (isBank) bankOut += amt;
        else cashOut += amt;
      } else if (t.type === 'long_term_liability' && !isSupplierBill) {
        longTermLoansFromTxs += amt;
        if (isBank) bankIn += amt;
        else cashIn += amt;
      }
    });

    const cachedSups = getCachedSuppliers(b.id);
    let tradePayablesCurrentLiabilities = 0;
    let tradePayablesFixedAsset = 0;
    let tradePayablesLongTermLoan = 0;
    let tradePayablesLoanCashInflow = 0;
    let tradePayablesLoanBankInflow = 0;

    cachedSups.forEach((s) => {
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

    // Exact chronological running Cash & Bank synchronization (matching Dashboard)
    let runningC = 0;
    let runningB = 0;

    const sortedAllTxs = [...allTxs].sort((a: any, b: any) => {
      const timeA = new Date(a.transaction_date || a.created_at || 0).getTime();
      const timeB = new Date(b.transaction_date || b.created_at || 0).getTime();
      return timeA - timeB;
    });

    sortedAllTxs.forEach((t: any) => {
      const amt = Number(t.amount || 0);
      const isBank = t.payment_method === 'bank';
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

      if (isOpeningBalance) {
        if (t.type === 'current_asset' && (t.vendor?.toLowerCase().includes('inventory') || t.vendor?.toLowerCase().includes('stock') || t.category?.toLowerCase().includes('stock') || t.category?.toLowerCase().includes('inventory'))) {
          // Inventory stock opening balance (non-cash)
        } else if (t.type === 'fixed_asset') {
          // Fixed asset opening balance (non-cash)
        } else {
          if (isBank) runningB += amt;
          else runningC += amt;
        }
      } else if (t.type === 'revenue' || t.type === 'deposit') {
        if (isBank) runningB += amt;
        else runningC += amt;
      } else if (t.type === 'cost_of_goods' || t.type === 'operating_expense' || t.type === 'return' || ['drawings', 'fixed_asset'].includes(t.type)) {
        if (isBank) runningB = Math.max(0, runningB - amt);
        else runningC = Math.max(0, runningC - amt);
      } else if (t.type === 'current_asset') {
        const catLower = (t.category || '').toLowerCase().trim();
        const venLower = (t.vendor || '').toLowerCase().trim();
        const isStockCategory = catLower.includes('stock') || catLower.includes('inventory') || venLower.includes('stock') || venLower.includes('inventory');
        const isDebtorCategory = catLower.includes('debtor') || catLower.includes('receivable') || venLower.includes('debtor');
        const isBankCategory = !isStockCategory && !isDebtorCategory && (isBank || catLower.includes('bank') || catLower.includes('momo') || venLower.includes('bank') || venLower.includes('momo'));
        const isCashCategory = !isStockCategory && !isDebtorCategory && !isBankCategory;

        if (isStockCategory || isDebtorCategory) {
          // Stock and Debtors are non-cash asset line items on Balance Sheet
        } else if (isBankCategory) {
          runningB += amt;
        } else if (isCashCategory) {
          runningC += amt;
        }
      } else if ((t.type === 'short_term_liability' || t.type === 'long_term_liability') && !isSupplierBill) {
        if (isBank) runningB += amt;
        else runningC += amt;
      }
    });

    const netCash = runningC + tradePayablesLoanCashInflow;
    const netBank = runningB + tradePayablesLoanBankInflow;

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
    const finalDebtors = debtorsTotal + invoiceDebtorsTotal;
    const finalPrepaids = prepaidsTotal;
    const finalOtherCurrentAssets = otherCurrentAssetsTotal;
    const finalCurrentAssets = netCash + netBank + finalDebtors + finalPrepaids + finalOtherCurrentAssets + finalInventoryAsset;

    const finalFixedCost = fixedAssetsPurchased + tradePayablesFixedAsset;
    const accumulatedDeprec = Number(rawBs.accumulated_depreciation || 0);
    const finalFixedNbv = Math.max(0, finalFixedCost - accumulatedDeprec);
    const finalTotalAssets = finalCurrentAssets + finalFixedNbv;

    const finalShortTerm = tradePayablesCurrentLiabilities + shortTermTxsPayable;
    const finalLongTerm = tradePayablesFixedAsset + tradePayablesLongTermLoan + longTermLoansFromTxs;
    const finalTotalLiab = finalShortTerm + finalLongTerm;

    const calculatedBaseEquity = finalTotalAssets - finalTotalLiab - (finalNetProfit - drawingsTotal);
    const ownersEquity = Math.max(openingCapitalInjected, Number(rawBs.owners_equity || 0), calculatedBaseEquity > 0 ? calculatedBaseEquity : 0);
    const netProfitToDate = finalNetProfit || Number(rawBs.net_profit_to_date || 0);
    const drawingsToDate = Math.max(drawingsTotal, Number(rawBs.drawings_to_date || 0));

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

    if (cfRes.data?.[0]) setCashFlow(cfRes.data[0]);

    if (tbRes.data) {
      const rows: TrialBalanceRow[] = [...tbRes.data];
      if (finalShortTerm > 0 && !rows.some((r) => r.category.includes('Creditors') || r.category.includes('Accounts Payable'))) {
        rows.push({
          category: 'Trade Creditors (Accounts Payable)',
          debit: 0,
          credit: finalShortTerm,
        });
      }
      setTrialBalance(rows);
      let d = 0;
      let c = 0;
      rows.forEach((r) => {
        d += Number(r.debit || 0);
        c += Number(r.credit || 0);
      });
      setTotalDebits(d);
      setTotalCredits(c);
    }

    const firstError = pnlRes.error || bsRes.error || cfRes.error || tbRes.error;
    if (firstError) setErrorMsg(firstError.message);

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

    brief += `AMS (Accounting Made Simple) · Certified Report Compilation`;

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
            📄 Export Stylish PDF
          </button>

          <button
            onClick={exportConsolidatedBrief}
            className="px-3.5 py-2 text-xs font-bold rounded-lg border border-border bg-surface2 hover:bg-surface1 text-textPrimary shadow-sm flex items-center gap-1.5"
          >
            📥 Text Brief
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto print:hidden">
        <button
          onClick={() => setTab('all')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'all' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          📄 Continuous All-in-One View
        </button>
        <button
          onClick={() => setTab('pnl')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'pnl' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Profit &amp; Loss
        </button>
        <button
          onClick={() => setTab('balance_sheet')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'balance_sheet' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Balance Sheet
        </button>
        <button
          onClick={() => setTab('cash_flow')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'cash_flow' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Cash Flow
        </button>
        <button
          onClick={() => setTab('trial_balance')}
          className={`px-3.5 py-1.5 text-xs rounded-lg font-bold transition ${
            tab === 'trial_balance' ? 'bg-accentText text-white' : 'text-textSecondary hover:bg-surface1'
          }`}
        >
          Trial Balance
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
              icon="📈"
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
              icon="⚖️"
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
              icon="🔄"
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
              icon="📋"
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

              {/* Single-Ledger Gap Explanation */}
              <div className="mt-4 p-3 bg-surface1 rounded-lg border border-border text-xs text-textSecondary">
                <span className="font-bold text-textPrimary">💡 Ledger Structure Note: </span>
                Trial Balance difference of {currency} {tbGap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} reflects period Net Profit, Depreciation, and Financing movements in this single-ledger schema.
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
          <span className="text-lg">{icon}</span>
          <h2 className="text-base font-bold text-textPrimary">{title}</h2>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-border bg-surface1 hover:bg-surface2 text-textPrimary flex items-center gap-1 shadow-sm transition"
          >
            📄 Export Stylish PDF
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
