'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AuditLogEntry, fetchAuditLogs, logAuditEvent, getCachedAuditLogs } from '@/lib/auditLogger';
import { getCachedBusiness } from '@/lib/offlineStore';
import { useUserRole } from '@/lib/RoleContext';
import { printAuditTrailReportPDF } from '@/lib/pdfGenerator';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const { isOwner, isAccountant } = useUserRole();

  const business = getCachedBusiness();

  useEffect(() => {
    // 1. Instant 0ms load from local cache
    const cached = getCachedAuditLogs(business?.id);
    if (cached.length > 0) {
      setLogs(cached);
      setLoading(false);
    }

    // 2. Fetch remote / backfill in background
    const loadLogs = async () => {
      try {
        const data = await fetchAuditLogs(business?.id);
        if (data && data.length > 0) {
          setLogs(data);
        }
      } finally {
        setLoading(false);
      }
    };
    loadLogs();

    const handleAuditUpdate = () => {
      const refreshed = getCachedAuditLogs(business?.id);
      if (refreshed.length > 0) setLogs(refreshed);
    };

    window.addEventListener('ams:audit-logs-updated', handleAuditUpdate);
    return () => {
      window.removeEventListener('ams:audit-logs-updated', handleAuditUpdate);
    };
  }, [business?.id]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchSearch =
        log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.actor_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity_id?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchAction = selectedAction === 'ALL' || log.action_type === selectedAction;
      const matchEntity = selectedEntity === 'ALL' || log.entity_type === selectedEntity;

      return matchSearch && matchAction && matchEntity;
    });
  }, [logs, searchTerm, selectedAction, selectedEntity]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity ID / Name', 'Actor Email', 'Role', 'Description', 'IP / Device'];
    const rows = filteredLogs.map((l) => [
      `"${new Date(l.created_at).toLocaleString()}"`,
      `"${l.action_type}"`,
      `"${l.entity_type}"`,
      `"${l.entity_name || l.entity_id}"`,
      `"${l.actor_email || 'N/A'}"`,
      `"${l.actor_role}"`,
      `"${l.description.replace(/"/g, '""')}"`,
      `"${l.ip_or_device || 'N/A'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_trail_${business?.name || 'business'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Log the export event
    logAuditEvent({
      actionType: 'EXPORT_REPORT',
      entityType: 'business_profile',
      entityId: business?.id || 'default_biz',
      description: `Exported ${filteredLogs.length} audit log compliance entries to CSV`,
    });
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
      case 'UPDATE':
      case 'STOCK_ADJUSTMENT':
        return 'bg-blue-50 text-blue-800 border-blue-300 font-bold';
      case 'DELETE':
      case 'VOID':
        return 'bg-red-50 text-red-800 border-red-300 font-bold';
      case 'DISBURSE_PAYOUT':
        return 'bg-indigo-50 text-indigo-900 border-indigo-300 font-bold';
      case 'ROLE_CHANGE':
        return 'bg-amber-50 text-amber-900 border-amber-300 font-bold';
      default:
        return 'bg-slate-100 text-slate-900 border-slate-300 font-bold';
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🛡️</span>
            <span className="text-xs font-bold text-accentText uppercase tracking-wider">
              {business?.name || 'Compliance & Governance'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-textPrimary">Immutable Financial Audit Trail</h1>
          <p className="text-xs text-textSecondary mt-0.5">
            Tamper-evident activity logs for transactions, creditor disbursements, inventory changes, and user roles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              printAuditTrailReportPDF(
                filteredLogs,
                { name: business?.name || 'My Business', currency: business?.currency || 'GHS', taxId: null }
              )
            }
            disabled={filteredLogs.length === 0}
            className="px-3.5 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>📄</span> Export Stylish PDF
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="px-3.5 py-2 rounded-lg border border-border bg-surface2 text-textPrimary text-xs font-bold hover:bg-surface1 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>📥</span> CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-surface2 border border-border">
          <p className="text-xs text-textSecondary font-medium">Total Logged Events</p>
          <p className="text-2xl font-bold text-textPrimary mt-1">{logs.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-surface2 border border-border">
          <p className="text-xs text-textSecondary font-medium">Payouts &amp; Disbursements</p>
          <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 mt-1">
            {logs.filter((l) => l.action_type === 'DISBURSE_PAYOUT').length}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-surface2 border border-border">
          <p className="text-xs text-textSecondary font-medium">Deletions & Voids</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
            {logs.filter((l) => l.action_type === 'DELETE' || l.action_type === 'VOID').length}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-surface2 border border-border">
          <p className="text-xs text-textSecondary font-medium">Compliance Status</p>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1">
            <span>✓</span> Immutable &amp; Synchronized
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-surface2 border border-border flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by keyword, actor email, entity ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 text-xs rounded-lg bg-surface1 border border-border text-textPrimary focus:outline-none focus:ring-1 focus:ring-accent"
        />

        <div className="flex gap-2">
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-surface1 border border-border text-textPrimary focus:outline-none"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="VOID">VOID</option>
            <option value="DISBURSE_PAYOUT">DISBURSE_PAYOUT</option>
            <option value="ROLE_CHANGE">ROLE_CHANGE</option>
            <option value="STOCK_ADJUSTMENT">STOCK_ADJUSTMENT</option>
            <option value="EXPORT_REPORT">EXPORT_REPORT</option>
          </select>

          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-surface1 border border-border text-textPrimary focus:outline-none"
          >
            <option value="ALL">All Entities</option>
            <option value="transaction">Transactions / Sales</option>
            <option value="invoice">Invoices &amp; Bills</option>
            <option value="inventory_item">Stock &amp; Inventory</option>
            <option value="supplier_payout">Supplier Payouts</option>
            <option value="staff_member">Staff &amp; Payroll</option>
            <option value="business_profile">Business Settings</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl bg-surface2 border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-textSecondary">Loading audit trail records...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <span className="text-3xl">📋</span>
            <p className="text-sm font-bold text-textPrimary">No audit records found</p>
            <p className="text-xs text-textSecondary">All subsequent system modifications will appear here in real time.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface1 border-b border-border text-textSecondary uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Actor &amp; Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface1/60 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-textSecondary whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getActionBadgeColor(log.action_type)}`}>
                        {log.action_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-textPrimary whitespace-nowrap">
                      <span className="font-semibold capitalize">{log.entity_type.replace('_', ' ')}</span>
                      {log.entity_name && <span className="text-textSecondary block text-[11px]">{log.entity_name}</span>}
                    </td>
                    <td className="py-3 px-4 text-textPrimary max-w-md">
                      <p className="line-clamp-2">{log.description}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-textPrimary block">{log.actor_email || 'Staff Member'}</span>
                      <span className="text-[10px] uppercase font-bold text-accentText">{log.actor_role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
