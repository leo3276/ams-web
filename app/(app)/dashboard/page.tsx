'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/lib/types';
import { useArchetype } from '@/lib/ArchetypeContext';
import { Icon } from '@/components/Icons';
import {
  getCachedBusiness,
  setCachedBusiness,
  getCachedTransactions,
  setCachedTransactions,
  getCachedInventory,
  setCachedInventory,
  getCachedInvoices,
  setCachedInvoices,
  getCachedSuppliers,
  setCachedSuppliers,
  getCachedCustomers,
  reconcileCustomerDebtors,
  resolveActiveBusiness,
} from '@/lib/offlineStore';

interface PnLSummary {
  revenue: number;
  costOfGoods: number;
  operatingExpenses: number;
  netProfit: number;
}

interface BalanceSheetSummary {
  cash: number;
  bank: number;
  debtors?: number;
  currentAssetsOther: number;
  totalCurrentAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface LiveLedgerEntry extends Transaction {
  isInflow: boolean;
  deltaAmount: number;
  runningCash: number;
  runningBank: number;
}

export type DashboardPeriodPreset = 'all' | 'month' | 'quarter' | 'year';

function getPeriodRange(preset: DashboardPeriodPreset) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), (q + 1) * 3, 0);
    return { start: iso(start), end: iso(end), label: `Q${q + 1} ${now.getFullYear()}` };
  }

  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { start: iso(start), end: iso(end), label: `Full Year ${now.getFullYear()}` };
  }

  if (preset === 'all') {
    return { start: '1970-01-01', end: '2099-12-31', label: 'All-Time Cumulative' };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: iso(start), end: iso(end), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue Inflow',
  cost_of_goods: 'Cost of Goods',
  operating_expense: 'Operating Expense',
  fixed_asset: 'Fixed Asset Purchase',
  current_asset: 'Current Asset Purchase',
  short_term_liability: 'Supplier Liability',
  long_term_liability: 'Long-term Debt',
  drawings: 'Owner Drawings',
};

export default function DashboardPage() {
  const { archetype, isEducation, students, schoolSettings } = useArchetype();
  const [businessName, setBusinessName] = useState('My Business');
  const [currency, setCurrency] = useState('GHS');
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<DashboardPeriodPreset>('all');
  const [periodLabel, setPeriodLabel] = useState('');
  const [pnl, setPnl] = useState<PnLSummary | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetSummary | null>(null);
  const [liveEntries, setLiveEntries] = useState<LiveLedgerEntry[]>([]);
  const [activeLedgerTab, setActiveLedgerTab] = useState<'all' | 'cash' | 'bank'>('all');

  const [uncollectedInvoicesAmount, setUncollectedInvoicesAmount] = useState(0);
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const shouldShow = localStorage.getItem('ams:show_migration_welcome');
      if (shouldShow === 'true') {
        setShowMigrationModal(true);
      }
    }
  }, []);

  const handleDismissModal = () => {
    setShowMigrationModal(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ams:show_migration_welcome');
    }
  };

  const loadDashboard = useCallback(async () => {
    const { start, end, label } = getPeriodRange(selectedPeriod);
    setPeriodLabel(label);

    // 1. Instantly load from local cache
    const cachedBiz = getCachedBusiness();
    if (cachedBiz) {
      setBusinessId(cachedBiz.id);
      setBusinessName(cachedBiz.name);
      setCurrency(cachedBiz.currency || 'GHS');
    }

    const activeBid = cachedBiz?.id || 'default_biz';
    const cachedTxs = getCachedTransactions(activeBid);
    if (cachedTxs.length > 0) {
      let initCash = 0;
      let initBank = 0;
      let rev = 0;
      let exp = 0;
      let cogs = 0;

      // Chronological sort (oldest to newest)
      const sortedCached = [...cachedTxs].sort((a: any, b: any) => {
        const timeA = new Date(a.transaction_date || a.created_at || 0).getTime();
        const timeB = new Date(b.transaction_date || b.created_at || 0).getTime();
        return timeA - timeB;
      });

      const processedInit: LiveLedgerEntry[] = sortedCached.map((t: any) => {
        const amt = Number(t.amount || 0);
        const isBank = t.payment_method === 'bank';
        let isInflow = false;

        if (t.type === 'revenue' || t.type === 'deposit' || t.category === 'Opening Balances') {
          isInflow = true;
          if (isBank) initBank += amt;
          else initCash += amt;
        } else if (t.type === 'operating_expense' || t.type === 'cost_of_goods' || t.type === 'drawings' || t.type === 'return' || t.type === 'fixed_asset') {
          isInflow = false;
          if (isBank) initBank -= amt;
          else initCash -= amt;
        }

        if (t.type === 'revenue') rev += amt;
        if (t.type === 'operating_expense') exp += amt;
        if (t.type === 'cost_of_goods') cogs += amt;

        return {
          ...t,
          isInflow,
          deltaAmount: isInflow ? amt : -amt,
          runningCash: initCash,
          runningBank: initBank,
        };
      });

      setPnl({
        revenue: rev,
        costOfGoods: cogs,
        operatingExpenses: exp,
        netProfit: rev - cogs - exp,
      });

      setBalanceSheet({
        cash: initCash,
        bank: initBank,
        currentAssetsOther: 0,
        totalCurrentAssets: initCash + initBank,
        totalLiabilities: 0,
        totalEquity: initCash + initBank,
      });

      setLiveEntries([...processedInit].reverse());
    }

    const cachedInv = getCachedInventory(cachedBiz?.id);
    if (cachedInv.length > 0) {
      const totalVal = cachedInv.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
      setInventoryValue(totalVal);
    }

    setLoading(false);

    try {
      const business = await resolveActiveBusiness();
      if (!business) return;

      setBusinessId(business.id);
      setBusinessName(business.name);
      setCurrency(business.currency || 'GHS');

      const today = new Date().toISOString().slice(0, 10);

      const [pnlRes, bsRes, invRes, itemsRes, allTxRes, staffRes] = await Promise.all([
        supabase.rpc('get_pnl_report', { p_business_id: business.id, p_start_date: start, p_end_date: end }),
        supabase.rpc('get_balance_sheet', { p_business_id: business.id, p_as_of_date: end }),
        supabase.from('invoices').select('*').eq('business_id', business.id),
        supabase.from('inventory_items').select('*').eq('business_id', business.id),
        supabase.from('transactions').select('*').eq('business_id', business.id).order('transaction_date', { ascending: true }),
        supabase.from('business_members').select('*').eq('business_id', business.id),
      ]);

      const remoteTxs = allTxRes.data ?? [];
      const localTxs = getCachedTransactions(business.id);
      const mergedMap = new Map();
      localTxs.forEach((t: any) => mergedMap.set(t.id, t));
      remoteTxs.forEach((t: any) => mergedMap.set(t.id, t));
      const allTxs = Array.from(mergedMap.values());
      setCachedTransactions(allTxs, business.id);

      // 1. Calculate live inventory valuation strictly for this business
      const remoteInv = itemsRes.data ?? [];
      const localInv = getCachedInventory(business.id);
      const invMap = new Map();
      localInv.forEach((i: any) => invMap.set(i.id, i));
      remoteInv.forEach((i: any) => invMap.set(i.id, i));
      const allInv = Array.from(invMap.values()).map((item: any) => ({
        ...item,
        unit_cost: Number(item.unit_cost ?? item.cost_price ?? 0),
        unit_price: Number(item.unit_price ?? item.selling_price ?? 0),
        quantity: Number(item.quantity ?? 0),
      }));
      setCachedInventory(allInv as any, business.id);
      const totalInvVal = allInv.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_cost || 0)), 0);
      setInventoryValue(totalInvVal);

      // 2. Process Running Cash & Bank entries chronologically & calculate period P&L
      let runningC = 0;
      let runningB = 0;

      let periodRev = 0;
      let periodStockPurchases = 0;
      let periodCarriageInwards = 0;
      let periodOpeningStock = 0;
      let periodReturns = 0;
      let periodOtherRev = 0;
      let periodOpex = 0;
      let fixedAssetsPurchased = 0;
      let computedAccumulatedDeprec = 0;

      // Chronological sort (oldest to newest)
      const sortedAllTxs = [...allTxs].sort((a: any, b: any) => {
        const timeA = new Date(a.transaction_date || a.created_at || 0).getTime();
        const timeB = new Date(b.transaction_date || b.created_at || 0).getTime();
        return timeA - timeB;
      });

      const processedEntries: LiveLedgerEntry[] = sortedAllTxs.map((t: any) => {
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

        let deltaCash = 0;
        let deltaBank = 0;
        let isInflow = false;

        if (isOpeningBalance) {
          isInflow = true;
          if (t.type === 'current_asset' && (t.vendor?.toLowerCase().includes('inventory') || t.vendor?.toLowerCase().includes('stock') || t.category?.toLowerCase().includes('stock') || t.category?.toLowerCase().includes('inventory'))) {
            periodOpeningStock = Math.max(periodOpeningStock, amt);
            isInflow = false; // non-cash opening inventory asset
          } else if (t.type === 'fixed_asset') {
            fixedAssetsPurchased += amt;
            const depRate = Number(t.depreciation_rate || 0);
            if (depRate > 0) computedAccumulatedDeprec += amt * (depRate > 1 ? depRate / 100 : depRate);
            isInflow = false;
          } else {
            // Cash / Bank Opening Balance
            if (isBank) { deltaBank = amt; runningB += amt; }
            else { deltaCash = amt; runningC += amt; }
          }
        } else if (t.type === 'revenue') {
          if (inPeriod) {
            if (t.category === 'Other Income' || t.category === 'External Revenue') periodOtherRev += amt;
            else periodRev += amt;
          }
          isInflow = true;
          if (isBank) { deltaBank = amt; runningB += amt; }
          else { deltaCash = amt; runningC += amt; }
        } else if (t.type === 'deposit') {
          // Owner Capital Injection / Cash Deposit
          isInflow = true;
          if (isBank) { deltaBank = amt; runningB += amt; }
          else { deltaCash = amt; runningC += amt; }
        } else if (t.type === 'cost_of_goods') {
          if (inPeriod) {
            if (t.category?.toLowerCase().includes('carriage') || t.vendor?.toLowerCase().includes('carriage')) {
              periodCarriageInwards += amt;
            } else {
              periodStockPurchases += amt;
            }
          }
          isInflow = false;
          if (isBank) { deltaBank = -amt; runningB -= amt; }
          else { deltaCash = -amt; runningC -= amt; }
        } else if (t.type === 'return' || (t.category && t.category.toLowerCase().includes('customer sales return')) || (t.vendor && t.vendor.toLowerCase().startsWith('customer refund:'))) {
          // Customer Sales Return: Subtracted from Gross Sales to arrive at Net Sales, reduces Cash/Bank
          if (inPeriod) periodReturns += amt;
          isInflow = false;
          if (isBank) { deltaBank = -amt; runningB -= amt; }
          else { deltaCash = -amt; runningC -= amt; }
        } else if (t.type === 'operating_expense') {
          if (inPeriod) periodOpex += amt;
          isInflow = false;
          if (isBank) { deltaBank = -amt; runningB -= amt; }
          else { deltaCash = -amt; runningC -= amt; }
        } else if (['drawings', 'fixed_asset'].includes(t.type)) {
          if (t.type === 'fixed_asset') {
            fixedAssetsPurchased += amt;
            const depRate = Number(t.depreciation_rate || 0);
            if (depRate > 0) computedAccumulatedDeprec += amt * (depRate > 1 ? depRate / 100 : depRate);
          }
          isInflow = false;
          if (isBank) { deltaBank = -amt; runningB -= amt; }
          else { deltaCash = -amt; runningC -= amt; }
        } else if (t.type === 'current_asset') {
          const catLower = (t.category || '').toLowerCase().trim();
          const venLower = (t.vendor || '').toLowerCase().trim();
          const isStockCategory = catLower.includes('stock') || catLower.includes('inventory') || venLower.includes('stock') || venLower.includes('inventory');
          const isDebtorCategory = catLower.includes('debtor') || catLower.includes('receivable') || venLower.includes('debtor');
          const isBankCategory = !isStockCategory && !isDebtorCategory && (isBank || catLower.includes('bank') || catLower.includes('momo') || venLower.includes('bank') || venLower.includes('momo'));
          const isCashCategory = !isStockCategory && !isDebtorCategory && !isBankCategory;

          if (isStockCategory) {
            periodOpeningStock = Math.max(periodOpeningStock, amt);
            isInflow = false;
          } else if (isDebtorCategory) {
            isInflow = false; // Non-cash asset entry
          } else if (isBankCategory) {
            isInflow = true;
            deltaBank = amt;
            runningB += amt;
          } else if (isCashCategory) {
            isInflow = true;
            deltaCash = amt;
            runningC += amt;
          }
        } else if ((t.type === 'short_term_liability' || t.type === 'long_term_liability') && !isSupplierBill) {
          isInflow = true;
          if (isBank) { deltaBank = amt; runningB += amt; }
          else { deltaCash = amt; runningC += amt; }
        }

        return {
          ...t,
          isInflow,
          deltaAmount: isInflow ? amt : -amt,
          runningCash: runningC,
          runningBank: runningB,
        };
      });

      // Newest entries first for live feed
      setLiveEntries([...processedEntries].reverse());

      // Invoices & Receivables (Debtors - Reconciled without Double-Counting)
      const remoteInvs = invRes.data ?? [];
      const localInvs = getCachedInvoices(business.id);
      const invoicesMap = new Map();
      localInvs.forEach((i: any) => invoicesMap.set(i.id || i.invoice_number, i));
      remoteInvs.forEach((i: any) => invoicesMap.set(i.id || i.invoice_number, i));
      const allInvoices = Array.from(invoicesMap.values());
      setCachedInvoices(allInvoices as any, business.id);

      const reconciledDebtors = reconcileCustomerDebtors(
        allInvoices as any,
        allTxs,
        getCachedCustomers(business.id)
      );
      const finalDebtors = reconciledDebtors.totalDebtors;
      const invoiceDebtorsTotal = reconciledDebtors.invoiceDebtorsTotal;

      const cachedSups = getCachedSuppliers(business.id);
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
                business_id: business.id,
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
        setCachedSuppliers(activeSuppliers, business.id);
      }

      let tradePayablesCurrentLiabilities = 0;
      let tradePayablesFixedAsset = 0;
      let tradePayablesLongTermLoan = 0;
      let tradePayablesLoanCashInflow = 0;
      let tradePayablesLoanBankInflow = 0;

      activeSuppliers.forEach((s) => {
        const b = Number(s.balance_owed || 0);
        if (b <= 0) return;
        const isBankChannel = s.loan_channel === 'bank';

        if (s.debt_type === 'fixed_asset') {
          tradePayablesFixedAsset += b;
        } else if (s.debt_type === 'long_term_loan') {
          tradePayablesLongTermLoan += b;
          if (isBankChannel) tradePayablesLoanBankInflow += b;
          else tradePayablesLoanCashInflow += b;
        } else if (s.debt_type === 'cash_loan') {
          tradePayablesCurrentLiabilities += b;
          if (isBankChannel) tradePayablesLoanBankInflow += b;
          else tradePayablesLoanCashInflow += b;
        } else {
          tradePayablesCurrentLiabilities += b;
        }
      });

      // Staff Salaries
      const staffList = staffRes.data ?? [];
      const monthlyRosterPayroll = staffList.reduce((sum: number, m: any) => sum + Number(m.salary || 0), 0);
      const recordedSalaryTxs = allTxs
        .filter((t: any) => t.type === 'operating_expense' && (t.category === 'Payroll & Salaries' || (t.vendor && t.vendor.startsWith('Salary:'))))
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
      const accruedPayroll = Math.max(0, monthlyRosterPayroll - recordedSalaryTxs);

      const netCash = runningC + tradePayablesLoanCashInflow;
      const netBank = runningB + tradePayablesLoanBankInflow;
      const finalInventoryValue = totalInvVal;
      const finalCurrentAssets = netCash + netBank + finalDebtors + finalInventoryValue;
      const finalFixedCost = fixedAssetsPurchased + tradePayablesFixedAsset;
      const rawBs = bsRes.data?.[0] || {};
      const accumulatedDeprec = Math.max(Number(rawBs.accumulated_depreciation || 0), Math.round(computedAccumulatedDeprec * 100) / 100);
      const finalFixedNbv = Math.max(0, finalFixedCost - accumulatedDeprec);
      const finalTotalAssets = finalCurrentAssets + finalFixedNbv;
      const finalShortTerm = tradePayablesCurrentLiabilities + accruedPayroll;
      const finalLongTerm = tradePayablesFixedAsset + tradePayablesLongTermLoan;

      // P&L Formula:
      // COGS is calculated as Opening Stock + Added Purchases (Bookkeeping) - Closing Stock
      const addedPurchases = periodStockPurchases + periodCarriageInwards;
      const cogas = periodOpeningStock + addedPurchases;
      const cogs = (periodOpeningStock > 0 || totalInvVal > 0)
        ? Math.max(0, cogas - totalInvVal)
        : addedPurchases;
      const netSales = periodRev - periodReturns;
      const grossProfit = (netSales - cogs) + periodOtherRev;
      const finalOpex = periodOpex + accruedPayroll;
      const finalNetProfit = grossProfit - finalOpex;

      setPnl({
        revenue: netSales + periodOtherRev,
        costOfGoods: cogs,
        operatingExpenses: finalOpex,
        netProfit: finalNetProfit,
      });

      setBalanceSheet({
        cash: netCash,
        bank: netBank,
        debtors: finalDebtors,
        currentAssetsOther: finalInventoryValue,
        totalCurrentAssets: finalCurrentAssets,
        totalLiabilities: finalShortTerm + finalLongTerm,
        totalEquity: finalTotalAssets - (finalShortTerm + finalLongTerm),
      });

      setUncollectedInvoicesAmount(invoiceDebtorsTotal);

      const overdue = allInvoices.filter(
        (inv: any) => inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date && inv.due_date < today
      ).length;
      setOverdueInvoicesCount(overdue);
    } catch (_err) {
      // offline mode operates smoothly on cache
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ams:dashboard_period') as DashboardPeriodPreset | null;
      if (saved && ['all', 'month', 'quarter', 'year'].includes(saved)) {
        setSelectedPeriod(saved);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    const handleDataUpdate = () => {
      loadDashboard();
    };

    window.addEventListener('ams:inventory-updated', handleDataUpdate);
    window.addEventListener('ams:transactions-updated', handleDataUpdate);
    window.addEventListener('ams:invoices-updated', handleDataUpdate);
    window.addEventListener('ams:customers-updated', handleDataUpdate);
    window.addEventListener('ams:suppliers-data-updated', handleDataUpdate);
    window.addEventListener('ams:business-updated', handleDataUpdate);

    return () => {
      window.removeEventListener('ams:inventory-updated', handleDataUpdate);
      window.removeEventListener('ams:transactions-updated', handleDataUpdate);
      window.removeEventListener('ams:invoices-updated', handleDataUpdate);
      window.removeEventListener('ams:customers-updated', handleDataUpdate);
      window.removeEventListener('ams:suppliers-data-updated', handleDataUpdate);
      window.removeEventListener('ams:business-updated', handleDataUpdate);
    };
  }, [loadDashboard]);

  // Safe-to-Spend Calculation
  const liquidity = useMemo(() => {
    const cash = balanceSheet?.cash || 0;
    const bank = balanceSheet?.bank || 0;
    const totalCashBank = cash + bank;

    // 15% estimated tax reserve from net profit
    const netProf = pnl?.netProfit || 0;
    const taxReserve = netProf > 0 ? netProf * 0.15 : 0;

    // 7-day operating overhead buffer (monthly opex / 4)
    const monthlyOpex = pnl?.operatingExpenses || 0;
    const weeklyOpBuffer = monthlyOpex > 0 ? monthlyOpex / 4 : 0;

    const safeToSpend = Math.max(0, totalCashBank - taxReserve - weeklyOpBuffer);

    // Runway calculation
    const dailyBurn = monthlyOpex > 0 ? monthlyOpex / 30 : 0;
    const runwayDays = dailyBurn > 0 ? Math.round(totalCashBank / dailyBurn) : totalCashBank > 0 ? 999 : 0;

    return {
      cash,
      bank,
      totalCashBank,
      taxReserve,
      weeklyOpBuffer,
      safeToSpend,
      runwayDays,
    };
  }, [balanceSheet, pnl]);

  // Filtered entries according to active tab
  const filteredEntries = useMemo(() => {
    if (activeLedgerTab === 'cash') {
      return liveEntries.filter((t) => t.payment_method === 'cash' || !t.payment_method);
    }
    if (activeLedgerTab === 'bank') {
      return liveEntries.filter((t) => t.payment_method === 'bank');
    }
    return liveEntries;
  }, [liveEntries, activeLedgerTab]);

  const cashEntriesCount = useMemo(() => liveEntries.filter((t) => t.payment_method === 'cash' || !t.payment_method).length, [liveEntries]);
  const bankEntriesCount = useMemo(() => liveEntries.filter((t) => t.payment_method === 'bank').length, [liveEntries]);

  if (loading) return <p className="text-sm text-textSecondary">Loading executive dashboard…</p>;
  if (errorMsg && !businessId) return <p className="text-sm text-danger">{errorMsg}</p>;

  const grossProfit = (pnl?.revenue || 0) - (pnl?.costOfGoods || 0);
  const marginPct = (pnl?.revenue || 0) > 0 ? (grossProfit / (pnl?.revenue || 1)) * 100 : 0;

  return (
    <div className="max-w-6xl space-y-8">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Icon name={archetype.icon} size={15} className="text-slate-500" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{businessName}</p>
            {isEducation && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {schoolSettings.academicYear} · {schoolSettings.currentTerm}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{archetype.vocabulary.dashboardTitle || 'Executive Financial Dashboard'}</h1>
          <p className="text-xs text-slate-500 mt-1">{archetype.vocabulary.dashboardSubtitle || `Real-time liquidity and live ledger for ${periodLabel}`}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Period Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            {([
              { id: 'all', label: 'All-Time' },
              { id: 'month', label: 'This Month' },
              { id: 'quarter', label: 'Quarter' },
              { id: 'year', label: 'Year' },
            ] as { id: DashboardPeriodPreset; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedPeriod(tab.id);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('ams:dashboard_period', tab.id);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  selectedPeriod === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/sales"
              className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs flex items-center gap-1.5"
            >
              <Icon name={isEducation ? 'book' : 'cart'} size={14} /> {isEducation ? 'Record Fee Inflow' : 'Record Sale'}
            </Link>
            <Link
              href="/invoices"
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <Icon name={isEducation ? 'zap' : 'receipt'} size={14} /> {isEducation ? 'Issue Term Bills' : 'Issue Invoice'}
            </Link>
            <Link
              href="/bookkeeping"
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition flex items-center gap-1.5"
            >
              <span>+</span> Add Entry
            </Link>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. SAFE-TO-SPEND LIQUIDITY HERO                          */}
      {/* ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Safe-to-Spend Liquidity</span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                Available Working Cash
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">
              {currency} {liquidity.safeToSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Net liquid capital after setting aside {currency} {liquidity.taxReserve.toFixed(0)} for tax provisions and {currency} {liquidity.weeklyOpBuffer.toFixed(0)} for 7-day operating overhead.
            </p>
          </div>

          {/* Runway Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center gap-4 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0">
              <Icon name="clock" size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cash Runway</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {liquidity.runwayDays >= 999 ? '∞ Unlimited' : `${liquidity.runwayDays} Days`}
              </p>
              <p className="text-[11px] text-slate-500">At current daily burn rate</p>
            </div>
          </div>
        </div>

        {/* CASH & BANK EXPLICIT BREAKDOWN CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {/* Cash in Hand */}
          <div
            onClick={() => setActiveLedgerTab('cash')}
            className={`cursor-pointer flex items-center justify-between p-4 rounded-xl border transition ${
              activeLedgerTab === 'cash'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <Icon name="cash" size={14} className={activeLedgerTab === 'cash' ? 'text-slate-300' : 'text-slate-500'} />
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${activeLedgerTab === 'cash' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Cash in Hand
                </span>
              </div>
              <p className="font-bold text-lg mt-1">
                {currency} {liquidity.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] mt-0.5 ${activeLedgerTab === 'cash' ? 'text-slate-300' : 'text-slate-500'}`}>
                {cashEntriesCount} cash entries
              </p>
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${
              activeLedgerTab === 'cash' ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-600 border-slate-200'
            }`}>
              Filter
            </span>
          </div>

          {/* Bank & MoMo */}
          <div
            onClick={() => setActiveLedgerTab('bank')}
            className={`cursor-pointer flex items-center justify-between p-4 rounded-xl border transition ${
              activeLedgerTab === 'bank'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <Icon name="bank" size={14} className={activeLedgerTab === 'bank' ? 'text-slate-300' : 'text-slate-500'} />
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${activeLedgerTab === 'bank' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Bank &amp; MoMo
                </span>
              </div>
              <p className="font-bold text-lg mt-1">
                {currency} {liquidity.bank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] mt-0.5 ${activeLedgerTab === 'bank' ? 'text-slate-300' : 'text-slate-500'}`}>
                {bankEntriesCount} bank/momo entries
              </p>
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${
              activeLedgerTab === 'bank' ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-600 border-slate-200'
            }`}>
              Filter
            </span>
          </div>

          {/* Combined Total Liquid Cash & Bank */}
          <div
            onClick={() => setActiveLedgerTab('all')}
            className={`cursor-pointer flex items-center justify-between p-4 rounded-xl border transition ${
              activeLedgerTab === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5">
                <Icon name="coin" size={14} className={activeLedgerTab === 'all' ? 'text-slate-300' : 'text-slate-500'} />
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${activeLedgerTab === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total Cash &amp; Bank
                </span>
              </div>
              <p className="font-bold text-lg mt-1">
                {currency} {liquidity.totalCashBank.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className={`text-[11px] mt-0.5 ${activeLedgerTab === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                {liveEntries.length} total ledger entries
              </p>
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${
              activeLedgerTab === 'all' ? 'bg-white/10 text-white border-white/20' : 'bg-white text-slate-600 border-slate-200'
            }`}>
              All
            </span>
          </div>
        </div>

        {/* Tied Working Capital */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <Link
            href="/customers"
            className="flex items-center justify-between bg-slate-50/60 hover:bg-slate-100/70 p-3.5 rounded-xl border border-slate-200 transition group cursor-pointer"
          >
            <div>
              <span className="text-slate-500 group-hover:text-slate-800 transition">Debtors (Accounts Receivable):</span>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{currency} {uncollectedInvoicesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
              {overdueInvoicesCount > 0 ? `${overdueInvoicesCount} overdue` : 'View Debtors →'}
            </span>
          </Link>

          <Link
            href="/inventory"
            className="flex items-center justify-between bg-slate-50/60 hover:bg-slate-100/70 p-3.5 rounded-xl border border-slate-200 transition group cursor-pointer"
          >
            <div>
              <span className="text-slate-500 group-hover:text-slate-800 transition">Closing Stock Valuation:</span>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{currency} {inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <span className="text-xs font-medium text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
              View Stock →
            </span>
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CORE MONTHLY KPI GRID                                 */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/bookkeeping"
          className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200 shadow-xs transition group cursor-pointer"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Revenue</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">
            {currency} {(pnl?.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">Total inflows this period →</p>
        </Link>

        <Link
          href="/inventory"
          className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200 shadow-xs transition group cursor-pointer"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cost of Goods (COGS)</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">
            {currency} {(pnl?.costOfGoods || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">Direct stock &amp; purchase cost →</p>
        </Link>

        <Link
          href="/bookkeeping"
          className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200 shadow-xs transition group cursor-pointer"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Operating Expenses</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">
            {currency} {(pnl?.operatingExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">Rent, utilities, overhead &amp; depreciation →</p>
        </Link>

        <Link
          href="/reports"
          className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200 shadow-xs transition group cursor-pointer"
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Net Profit</p>
          <p className={`text-2xl font-bold tracking-tight ${(pnl?.netProfit || 0) >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            {currency} {(pnl?.netProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">{marginPct.toFixed(1)}% gross margin (View P&amp;L) →</p>
        </Link>
      </div>

      {/* ======================================================== */}
      {/* 3. LIVE CASH & BANK LEDGER ENTRIES STREAM                */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Entries Stream Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-t-0 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Recent Ledger Activity
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                  Live Stream
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chronological cashbook entries with running Cash and Bank balances
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveLedgerTab('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                  activeLedgerTab === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({liveEntries.length})
              </button>
              <button
                onClick={() => setActiveLedgerTab('cash')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1 ${
                  activeLedgerTab === 'cash'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cash ({cashEntriesCount})
              </button>
              <button
                onClick={() => setActiveLedgerTab('bank')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1 ${
                  activeLedgerTab === 'bank'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bank ({bankEntriesCount})
              </button>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs text-slate-400">
                {activeLedgerTab === 'cash'
                  ? 'No cash drawer transactions recorded yet.'
                  : activeLedgerTab === 'bank'
                  ? 'No bank or MoMo transactions recorded yet.'
                  : 'No transactions recorded yet. Click "+ Add Entry" to record your first sale or expense.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 pr-1 select-none">
              {filteredEntries.map((t) => {
                const isBank = t.payment_method === 'bank';
                const runningBal = isBank ? t.runningBank : t.runningCash;

                return (
                  <div key={t.id} className="py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 px-2.5 rounded-xl transition">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 bg-slate-100 text-slate-700 border border-slate-200/80">
                        {t.isInflow ? '↓' : '↑'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate text-xs">{t.vendor}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span>{t.transaction_date}</span>
                          <span>·</span>
                          <span>{TYPE_LABELS[t.type] || t.type}</span>
                          <span>·</span>
                          <span className="px-1.5 py-0.5 rounded font-medium text-[10px] bg-slate-100 text-slate-600">
                            {isBank ? 'Bank / MoMo' : 'Cash'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${t.isInflow ? 'text-slate-900' : 'text-slate-600'}`}>
                        {t.isInflow ? '+' : '-'} {currency} {Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isBank ? 'Bank Bal:' : 'Cash Bal:'} <strong className="text-slate-600">{currency} {runningBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-3 flex items-center justify-between border-t border-slate-100 text-xs">
            <span className="text-slate-400">Showing {filteredEntries.length} entries</span>
            <Link href="/bookkeeping" className="font-semibold text-slate-800 hover:underline flex items-center gap-1">
              Open General Ledger →
            </Link>
          </div>
        </div>

        {/* Action Hub & Quick Shortcuts */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900">Accounting Modules</h2>

            <Link
              href="/customers"
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition group"
            >
              <div className="flex items-center gap-3">
                <Icon name="users" size={16} className="text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Customers &amp; Debtors</p>
                  <p className="text-[11px] text-slate-500">Accounts receivable &amp; debtor balances</p>
                </div>
              </div>
              <span className="text-xs text-slate-400">→</span>
            </Link>

            <Link
              href="/invoices"
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition group"
            >
              <div className="flex items-center gap-3">
                <Icon name="receipt" size={16} className="text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Invoices &amp; Billing</p>
                  <p className="text-[11px] text-slate-500">Issue invoices &amp; record payments</p>
                </div>
              </div>
              <span className="text-xs text-slate-400">→</span>
            </Link>

            <Link
              href="/suppliers"
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition group"
            >
              <div className="flex items-center gap-3">
                <Icon name="factory" size={16} className="text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Suppliers &amp; Creditors</p>
                  <p className="text-[11px] text-slate-500">Accounts payable &amp; vendor bills</p>
                </div>
              </div>
              <span className="text-xs text-slate-400">→</span>
            </Link>

            <Link
              href="/inventory"
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition group"
            >
              <div className="flex items-center gap-3">
                <Icon name="package" size={16} className="text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Inventory &amp; Stock</p>
                  <p className="text-[11px] text-slate-500">Stock valuation, costs &amp; margins</p>
                </div>
              </div>
              <span className="text-xs text-slate-400">→</span>
            </Link>

            <Link
              href="/reports"
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/70 transition group"
            >
              <div className="flex items-center gap-3">
                <Icon name="trending" size={16} className="text-slate-500" />
                <div>
                  <p className="text-xs font-semibold text-slate-900">Financial Statements</p>
                  <p className="text-[11px] text-slate-500">P&amp;L, Balance Sheet, Cash Flow &amp; Trial Balance</p>
                </div>
              </div>
              <span className="text-xs text-slate-400">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Migration Welcome Modal */}
      {showMigrationModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 max-w-lg w-full rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
                  <Icon name="upload" size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Welcome to AMS</h3>
                  <p className="text-xs text-slate-500">Financial &amp; accounting workstation</p>
                </div>
              </div>
              <button
                onClick={handleDismissModal}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
              <p className="text-xs text-slate-900 font-semibold">
                Have existing spreadsheets or accounting records?
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Our <strong>Data Migration Engine</strong> senses and imports Excel, CSV, and JSON files of any structure directly into your ledgers:
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center gap-2">
                  <Icon name="package" size={14} className="text-slate-500" />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">Inventory &amp; Stock</p>
                    <p className="text-[10px] text-slate-500">Costs, prices &amp; quantities</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center gap-2">
                  <Icon name="users" size={14} className="text-slate-500" />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">Customer Debtors</p>
                    <p className="text-[10px] text-slate-500">Receivables &amp; contacts</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center gap-2">
                  <Icon name="receipt" size={14} className="text-slate-500" />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">Invoices &amp; Sales</p>
                    <p className="text-[10px] text-slate-500">Billing &amp; revenue logs</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center gap-2">
                  <Icon name="briefcase" size={14} className="text-slate-500" />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">Assets &amp; Balances</p>
                    <p className="text-[10px] text-slate-500">Equipment &amp; trial balance</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <Link
                href="/migrate"
                onClick={handleDismissModal}
                className="w-full sm:flex-1 py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs rounded-xl transition text-center flex items-center justify-center gap-1.5"
              >
                <Icon name="upload" size={14} /> Import Existing Data
              </Link>
              <button
                onClick={handleDismissModal}
                className="w-full sm:w-auto py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition text-center"
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
