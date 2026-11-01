-- ==============================================================================
-- AMS (Accounting Management System) - Complete Database Setup & Schema
-- Run this script in your new Supabase Project SQL Editor
-- Project Reference: ynqlfjoybxzrgczktrht
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. BUSINESSES TABLE
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  industry text,
  currency text default 'GHS',
  fiscal_year_start text default 'January',
  business_type text default 'sole_proprietorship',
  tax_id text,
  tax_filing_frequency text,
  next_tax_filing_date date,
  created_at timestamp with time zone default now()
);

alter table public.businesses enable row level security;

create policy "Users can view their own businesses"
  on public.businesses for select
  using (auth.uid() = user_id);

create policy "Users can insert their own businesses"
  on public.businesses for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own businesses"
  on public.businesses for update
  using (auth.uid() = user_id);

create policy "Users can delete their own businesses"
  on public.businesses for delete
  using (auth.uid() = user_id);

-- 3. TRANSACTIONS TABLE
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  vendor text not null,
  amount numeric(14,2) not null,
  type text not null,
  category text,
  transaction_date date not null default current_date,
  document_url text,
  depreciation_rate numeric,
  payment_method text default 'cash',
  created_at timestamp with time zone default now()
);

alter table public.transactions enable row level security;

create policy "Users can view their own transactions"
  on public.transactions for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own transactions"
  on public.transactions for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can update their own transactions"
  on public.transactions for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can delete their own transactions"
  on public.transactions for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 4. INVENTORY ITEMS TABLE
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  name text not null,
  barcode text,
  quantity numeric default 0,
  unit_cost numeric(14,2) default 0,
  unit_price numeric(14,2) default 0,
  cost_price numeric(14,2) default 0,
  selling_price numeric(14,2) default 0,
  created_at timestamp with time zone default now()
);

alter table public.inventory_items enable row level security;

create policy "Users can view their own inventory"
  on public.inventory_items for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own inventory"
  on public.inventory_items for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can update their own inventory"
  on public.inventory_items for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can delete their own inventory"
  on public.inventory_items for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 5. INVOICES TABLE
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  invoice_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  amount numeric(14,2) not null,
  description text,
  due_date date not null,
  status text not null default 'draft',
  created_at timestamp with time zone default now()
);

alter table public.invoices enable row level security;

create policy "Users can view their own invoices"
  on public.invoices for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own invoices"
  on public.invoices for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can update their own invoices"
  on public.invoices for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can delete their own invoices"
  on public.invoices for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 6. BUSINESS MEMBERS TABLE (TEAM & ROLES)
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'employee',
  phone text,
  branch text default 'Main Branch',
  salary numeric(14,2) default 0,
  created_at timestamp with time zone default now()
);

alter table public.business_members enable row level security;

create policy "Users can view their own team members"
  on public.business_members for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own team members"
  on public.business_members for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can update their own team members"
  on public.business_members for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can delete their own team members"
  on public.business_members for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 7. INVENTORY SALES TABLE
create table if not exists public.inventory_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  quantity_sold numeric not null,
  sale_amount numeric(14,2) not null,
  sale_date date default current_date,
  created_at timestamp with time zone default now()
);

alter table public.inventory_sales enable row level security;

create policy "Users can view their own inventory sales"
  on public.inventory_sales for select
  using (
    business_id is null or business_id in (select id from public.businesses where user_id = auth.uid())
  );

create policy "Users can insert their own inventory sales"
  on public.inventory_sales for insert
  with check (
    business_id is null or business_id in (select id from public.businesses where user_id = auth.uid())
  );

-- 8. SUPPLIERS TABLE
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  name text not null,
  phone text,
  email text,
  category text,
  debt_type text,
  loan_channel text,
  balance_owed numeric(14,2) default 0,
  payment_terms text,
  due_date date,
  notes text,
  created_at timestamp with time zone default now()
);

alter table public.suppliers enable row level security;

create policy "Users can view their own suppliers"
  on public.suppliers for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own suppliers"
  on public.suppliers for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can update their own suppliers"
  on public.suppliers for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can delete their own suppliers"
  on public.suppliers for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 9. SUPPLIER TRANSACTIONS TABLE
create table if not exists public.supplier_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  type text not null check (type in ('bill', 'payment')),
  amount numeric(14,2) not null,
  reference text,
  notes text,
  transaction_date date not null default current_date,
  created_at timestamp with time zone default now()
);

alter table public.supplier_transactions enable row level security;

create policy "Users can view supplier transactions"
  on public.supplier_transactions for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert supplier transactions"
  on public.supplier_transactions for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 10. AUDIT LOGS TABLE
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role text default 'owner',
  action_type text not null,
  entity_type text not null,
  entity_id text not null,
  entity_name text,
  description text,
  old_value text,
  new_value text,
  metadata text,
  ip_or_device text,
  created_at timestamp with time zone default now()
);

alter table public.audit_logs enable row level security;

create policy "Users can view their own audit logs"
  on public.audit_logs for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create policy "Users can insert their own audit logs"
  on public.audit_logs for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

-- 11. STORAGE BUCKET FOR RECEIPTS
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Users can upload their own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view their own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 12. RPC FUNCTIONS (FINANCIAL ENGINES)

-- 12.1 Profit & Loss Report
create or replace function get_pnl_report(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  revenue numeric,
  cost_of_goods numeric,
  operating_expenses numeric,
  net_profit numeric
)
language sql
security definer
as $$
  select
    coalesce(sum(amount) filter (where type = 'revenue'), 0) as revenue,
    coalesce(sum(amount) filter (where type in ('cost_of_goods', 'cogs')), 0) as cost_of_goods,
    coalesce(sum(amount) filter (where type in ('operating_expense', 'expense')), 0) as operating_expenses,
    coalesce(sum(amount) filter (where type = 'revenue'), 0)
      - coalesce(sum(amount) filter (where type in ('cost_of_goods', 'cogs')), 0)
      - coalesce(sum(amount) filter (where type in ('operating_expense', 'expense')), 0) as net_profit
  from transactions
  where business_id = p_business_id
    and transaction_date between p_start_date and p_end_date
    and business_id in (select id from businesses where user_id = auth.uid());
$$;

-- 12.2 Balance Sheet
create or replace function get_balance_sheet(
  p_business_id uuid,
  p_as_of_date date
)
returns table (
  cash numeric,
  fixed_assets numeric,
  total_assets numeric,
  total_liabilities numeric,
  equity numeric
)
language sql
security definer
as $$
  with totals as (
    select
      coalesce(sum(amount) filter (where type = 'revenue'), 0) as total_revenue,
      coalesce(sum(amount) filter (where type in ('cost_of_goods', 'cogs')), 0) as total_cogs,
      coalesce(sum(amount) filter (where type in ('operating_expense', 'expense')), 0) as total_opex,
      coalesce(sum(amount) filter (where type in ('asset', 'fixed_asset')), 0) as total_asset_purchases,
      coalesce(sum(amount) filter (where type in ('liability', 'short_term_liability', 'long_term_liability')), 0) as total_liabilities
    from transactions
    where business_id = p_business_id
      and transaction_date <= p_as_of_date
      and business_id in (select id from businesses where user_id = auth.uid())
  )
  select
    (total_revenue - total_cogs - total_opex - total_asset_purchases + total_liabilities) as cash,
    total_asset_purchases as fixed_assets,
    (total_revenue - total_cogs - total_opex - total_asset_purchases + total_liabilities)
      + total_asset_purchases as total_assets,
    total_liabilities as total_liabilities,
    ((total_revenue - total_cogs - total_opex - total_asset_purchases + total_liabilities)
      + total_asset_purchases) - total_liabilities as equity
  from totals;
$$;

-- 12.3 Cash Flow Statement
create or replace function get_cash_flow_statement(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  operating_activities numeric,
  investing_activities numeric,
  financing_activities numeric,
  net_cash_flow numeric
)
language sql
security definer
as $$
  with totals as (
    select
      coalesce(sum(amount) filter (where type = 'revenue'), 0) as total_revenue,
      coalesce(sum(amount) filter (where type in ('cost_of_goods', 'cogs')), 0) as total_cogs,
      coalesce(sum(amount) filter (where type in ('operating_expense', 'expense')), 0) as total_opex,
      coalesce(sum(amount) filter (where type in ('asset', 'fixed_asset')), 0) as total_asset_purchases,
      coalesce(sum(amount) filter (where type in ('liability', 'short_term_liability', 'long_term_liability')), 0) as total_liabilities
    from transactions
    where business_id = p_business_id
      and transaction_date between p_start_date and p_end_date
      and business_id in (select id from businesses where user_id = auth.uid())
  )
  select
    (total_revenue - total_cogs - total_opex) as operating_activities,
    (-1 * total_asset_purchases) as investing_activities,
    total_liabilities as financing_activities,
    (total_revenue - total_cogs - total_opex) - total_asset_purchases + total_liabilities as net_cash_flow
  from totals;
$$;

-- 12.4 Trial Balance
create or replace function get_trial_balance(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  category text,
  debit numeric,
  credit numeric
)
language sql
security definer
as $$
  select
    case
      when type = 'revenue' then 'Revenue'
      when type in ('cost_of_goods', 'cogs') then 'Cost of goods'
      when type in ('operating_expense', 'expense') then 'Operating expense'
      when type in ('asset', 'fixed_asset', 'current_asset') then 'Asset purchases'
      when type in ('liability', 'short_term_liability', 'long_term_liability') then 'Liabilities'
      else 'Other'
    end as category,
    case
      when type in ('cost_of_goods', 'cogs', 'operating_expense', 'expense', 'asset', 'fixed_asset', 'current_asset')
      then coalesce(sum(amount), 0) else 0
    end as debit,
    case
      when type in ('revenue', 'liability', 'short_term_liability', 'long_term_liability')
      then coalesce(sum(amount), 0) else 0
    end as credit
  from transactions
  where business_id = p_business_id
    and transaction_date between p_start_date and p_end_date
    and business_id in (select id from businesses where user_id = auth.uid())
  group by 1
  order by 1;
$$;

-- 12.5 Next Sequential Invoice Number
create or replace function get_next_invoice_number(p_business_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
begin
  select coalesce(count(*), 0) + 1 into next_num
  from public.invoices
  where business_id = p_business_id;

  return 'INV-' || lpad(next_num::text, 4, '0');
end;
$$;

-- 12.6 Customer Receivables & Debt Summary
create or replace function get_customer_summary(p_business_id uuid)
returns table (
  customer_name text,
  customer_email text,
  customer_phone text,
  invoice_count bigint,
  total_invoiced numeric,
  total_paid numeric,
  total_outstanding numeric,
  last_invoice_date text
)
language sql
security definer
as $$
  select
    customer_name,
    max(customer_email) as customer_email,
    max(customer_phone) as customer_phone,
    count(*) as invoice_count,
    coalesce(sum(amount), 0) as total_invoiced,
    coalesce(sum(amount) filter (where status = 'paid'), 0) as total_paid,
    coalesce(sum(amount) filter (where status in ('draft', 'sent', 'overdue')), 0) as total_outstanding,
    max(due_date)::text as last_invoice_date
  from public.invoices
  where business_id = p_business_id
  group by customer_name
  order by total_outstanding desc;
$$;

-- 12.7 Restock Inventory Item (Atomic Stock Increment + COGS Transaction)
create or replace function restock_inventory_item(
  p_inventory_item_id uuid,
  p_quantity_added numeric,
  p_payment_method text default 'cash'
)
returns void
language plpgsql
security definer
as $$
declare
  v_item record;
  v_total_cost numeric;
begin
  select * into v_item from public.inventory_items where id = p_inventory_item_id;
  if not found then
    raise exception 'Inventory item not found';
  end if;

  update public.inventory_items
  set quantity = coalesce(quantity, 0) + p_quantity_added
  where id = p_inventory_item_id;

  v_total_cost := coalesce(v_item.unit_cost, 0) * p_quantity_added;

  if v_total_cost > 0 then
    insert into public.transactions (
      business_id,
      vendor,
      amount,
      type,
      category,
      payment_method,
      transaction_date
    ) values (
      v_item.business_id,
      'Purchases: ' || p_quantity_added || 'x ' || v_item.name,
      v_total_cost,
      'cost_of_goods',
      'Cost of Goods: Purchases (' || case when p_payment_method = 'bank' then 'Bank / MoMo' else 'Cash Drawer' end || ')',
      p_payment_method,
      current_date
    );
  end if;
end;
$$;

-- 12.8 Mark Invoice Paid (Atomic Status Update + Revenue Transaction)
create or replace function mark_invoice_paid(
  p_invoice_id uuid,
  p_payment_method text default 'cash'
)
returns void
language plpgsql
security definer
as $$
declare
  v_inv record;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found';
  end if;

  update public.invoices
  set status = 'paid'
  where id = p_invoice_id;

  insert into public.transactions (
    business_id,
    vendor,
    amount,
    type,
    category,
    payment_method,
    transaction_date
  ) values (
    v_inv.business_id,
    'Invoice Payment: ' || v_inv.customer_name || ' (' || v_inv.invoice_number || ')',
    v_inv.amount,
    'revenue',
    'Sales',
    p_payment_method,
    current_date
  );
end;
$$;
