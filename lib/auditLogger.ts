'use client';

import { supabase } from './supabase';
import { getCachedBusiness, getCachedUserId, getCachedTransactions, getCachedInvoices } from './offlineStore';

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'DISBURSE_PAYOUT'
  | 'ROLE_CHANGE'
  | 'STOCK_ADJUSTMENT'
  | 'EXPORT_REPORT'
  | 'RECONCILE';

export type AuditEntityType =
  | 'transaction'
  | 'invoice'
  | 'inventory_item'
  | 'supplier_payout'
  | 'staff_member'
  | 'business_profile'
  | 'bank_reconciliation'
  | 'customer_debt';

export interface AuditLogEntry {
  id: string;
  business_id: string;
  actor_id?: string;
  actor_email?: string;
  actor_role: string;
  action_type: AuditActionType;
  entity_type: AuditEntityType;
  entity_id: string;
  entity_name?: string;
  description: string;
  old_value?: any;
  new_value?: any;
  metadata?: Record<string, any>;
  ip_or_device?: string;
  created_at: string;
}

const STORAGE_KEY_AUDIT_LOGS = 'ams:audit_logs_cache_v1';

function getAuditStorageKey(businessId?: string): string {
  const bid = businessId || getCachedBusiness()?.id || 'default_biz';
  return `${STORAGE_KEY_AUDIT_LOGS}_${bid}`;
}

export function getCachedAuditLogs(businessId?: string): AuditLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = getAuditStorageKey(businessId);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

export function saveCachedAuditLogs(logs: AuditLogEntry[], businessId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = getAuditStorageKey(businessId);
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 500))); // keep latest 500 locally
  } catch (_e) {}
}

export async function logAuditEvent(params: {
  businessId?: string;
  actorRole?: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
}): Promise<AuditLogEntry> {
  const business = getCachedBusiness();
  const businessId = params.businessId || business?.id || 'default_biz';
  const userId = getCachedUserId() || 'unknown_user';
  
  let actorEmail = 'system@ams-pos.com';
  if (typeof window !== 'undefined') {
    const cachedUser = localStorage.getItem('ams:cache_user_v1');
    if (cachedUser) {
      try {
        actorEmail = JSON.parse(cachedUser)?.email || actorEmail;
      } catch (_e) {}
    }
  }

  const actorRole = params.actorRole || (typeof window !== 'undefined' ? localStorage.getItem('ams:web_user_role_v1') || 'owner' : 'owner');

  const entry: AuditLogEntry = {
    id: 'AUD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    business_id: businessId,
    actor_id: userId,
    actor_email: actorEmail,
    actor_role: actorRole,
    action_type: params.actionType,
    entity_type: params.entityType,
    entity_id: params.entityId,
    entity_name: params.entityName,
    description: params.description,
    old_value: params.oldValue,
    new_value: params.newValue,
    metadata: params.metadata,
    ip_or_device: typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 50)}...` : 'web-client',
    created_at: new Date().toISOString(),
  };

  // 1. Save to local audit cache
  try {
    const existing = getCachedAuditLogs(businessId);
    const updated = [entry, ...existing];
    saveCachedAuditLogs(updated, businessId);
  } catch (_e) {}

  // 2. Sync to Supabase in background
  try {
    await supabase.from('audit_logs').insert({
      id: entry.id,
      business_id: entry.business_id,
      actor_id: entry.actor_id,
      actor_email: entry.actor_email,
      actor_role: entry.actor_role,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      entity_name: entry.entity_name,
      description: entry.description,
      old_value: entry.old_value ? JSON.stringify(entry.old_value) : null,
      new_value: entry.new_value ? JSON.stringify(entry.new_value) : null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip_or_device: entry.ip_or_device,
      created_at: entry.created_at,
    });
  } catch (_e) {}

  return entry;
}

export async function fetchAuditLogs(businessId?: string, limit = 100): Promise<AuditLogEntry[]> {
  const business = getCachedBusiness();
  const bid = businessId || business?.id || 'default_biz';

  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('business_id', bid)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      const parsed: AuditLogEntry[] = data.map((d: any) => ({
        ...d,
        old_value: typeof d.old_value === 'string' ? JSON.parse(d.old_value) : d.old_value,
        new_value: typeof d.new_value === 'string' ? JSON.parse(d.new_value) : d.new_value,
        metadata: typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata,
      }));
      saveCachedAuditLogs(parsed, bid);
      return parsed;
    }
  } catch (_e) {}

  const cached = getCachedAuditLogs(bid);
  if (cached.length > 0) return cached;

  // Auto-backfill existing transactions & invoices into initial audit trail
  const initialLogs: AuditLogEntry[] = [];
  const existingTxs = getCachedTransactions(bid);
  const existingInvs = getCachedInvoices(bid);

  existingTxs.forEach((tx: any) => {
    initialLogs.push({
      id: 'AUD_HIST_' + (tx.id || Math.random().toString(36).slice(2, 8)),
      business_id: bid,
      actor_id: 'system_import',
      actor_email: 'finance@ams-pos.com',
      actor_role: 'owner',
      action_type: 'CREATE',
      entity_type: 'transaction',
      entity_id: tx.id || 'TX_UNKNOWN',
      entity_name: tx.vendor || tx.category || 'General Transaction',
      description: `Posted ${tx.type || 'entry'} of GHS ${Number(tx.amount || 0).toLocaleString()} for ${tx.vendor || tx.category || 'general bookkeeping'}`,
      ip_or_device: 'AMS Core Financial Ledger',
      created_at: tx.created_at || tx.transaction_date || new Date().toISOString(),
    });
  });

  existingInvs.forEach((inv: any) => {
    initialLogs.push({
      id: 'AUD_HIST_INV_' + (inv.id || Math.random().toString(36).slice(2, 8)),
      business_id: bid,
      actor_id: 'system_import',
      actor_email: 'finance@ams-pos.com',
      actor_role: 'owner',
      action_type: 'CREATE',
      entity_type: 'invoice',
      entity_id: inv.id || 'INV_UNKNOWN',
      entity_name: inv.customer_name || 'Customer Invoice',
      description: `Issued invoice #${inv.invoice_number || 'INV'} for GHS ${Number(inv.amount || 0).toLocaleString()} (Status: ${inv.status || 'draft'})`,
      ip_or_device: 'AMS Invoicing Desk',
      created_at: inv.created_at || new Date().toISOString(),
    });
  });

  if (initialLogs.length > 0) {
    saveCachedAuditLogs(initialLogs, bid);
    return initialLogs;
  }

  return [];
}
