-- ==============================================================================
-- AMS (Accounting Management System) - Full Schema & Data Migration
-- Target Project: ynqlfjoybxzrgczktrht
-- Source Project: wwbmayypdzisopdqlefg
-- ==============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==============================================================================
-- AMS (Accounting Management System) - Complete Database Setup & Schema
-- Run this script in your new Supabase Project SQL Editor
-- Project Reference: ynqlfjoybxzrgczktrht
-- ==============================================================================

-- 1. EXTENSIONS


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


-- ==============================================================================
-- STEP 2: DATA MIGRATION FROM wwbmayypdzisopdqlefg
-- ==============================================================================

-- 1. MIGRATED AUTH USERS
DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', '672f7fa4-7c8d-437a-ae48-8546a7ff269c', 'authenticated', 'authenticated', 'memoriesm415@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-10-16T15:34:42.001737Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"memoriesm415@gmail.com","email_verified":true,"full_name":"Melody","phone_verified":false,"sub":"672f7fa4-7c8d-437a-ae48-8546a7ff269c"}'::jsonb, '2026-10-16T15:33:59.041657Z', '2026-10-16T15:34:42.050139Z'),
    ('00000000-0000-0000-0000-000000000000', 'cb637ca2-3a2f-495a-b14a-3f29c4ad7c6e', 'authenticated', 'authenticated', 'vahodokpo73@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-10-16T15:20:33.705646Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"vahodokpo73@gmail.com","email_verified":true,"full_name":"Prevail","phone_verified":false,"sub":"cb637ca2-3a2f-495a-b14a-3f29c4ad7c6e"}'::jsonb, '2026-10-16T15:20:01.671268Z', '2026-10-16T15:30:43.907652Z'),
    ('00000000-0000-0000-0000-000000000000', '9154ff3d-957e-4835-81d3-a1ac4f8b0fa3', 'authenticated', 'authenticated', 'leokofiderksen@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-10-15T20:05:15.913737Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"leokofiderksen@gmail.com","email_verified":false,"full_name":"Leo Kofi Derksen","owner_pin":"9276","phone_verified":false,"sub":"9154ff3d-957e-4835-81d3-a1ac4f8b0fa3"}'::jsonb, '2026-10-15T20:05:15.913737Z', '2026-10-15T20:05:17.621325Z'),
    ('00000000-0000-0000-0000-000000000000', '7b13013c-8f86-409f-a5d7-2a53c6a4311b', 'authenticated', 'authenticated', 'lite_test_1791997176511@amslite.local', crypt('TempPassword123!', gen_salt('bf')), '2026-10-14T16:59:37.636602Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"app_mode":"lite","email":"lite_test_1791997176511@amslite.local","email_verified":false,"phone_number":"0240000000","phone_verified":false,"sub":"7b13013c-8f86-409f-a5d7-2a53c6a4311b"}'::jsonb, '2026-10-14T16:59:37.636602Z', '2026-10-14T16:59:39.514924Z'),
    ('00000000-0000-0000-0000-000000000000', '00a9835f-a846-48ac-8cd0-401b42fee2c7', 'authenticated', 'authenticated', 'prevail246@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-10-13T22:46:27.820744Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"prevail246@gmail.com","email_verified":true,"full_name":"Mivako ltd","phone_verified":false,"sub":"00a9835f-a846-48ac-8cd0-401b42fee2c7"}'::jsonb, '2026-10-13T22:43:43.956811Z', '2026-10-16T15:28:38.454112Z'),
    ('00000000-0000-0000-0000-000000000000', '09fe3d05-f11c-4af9-a22b-206a75970465', 'authenticated', 'authenticated', 'eliyaanaa84@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-10-09T22:16:27.833879Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"eliyaanaa84@gmail.com","email_verified":true,"full_name":"Mivako","phone_verified":false,"sub":"09fe3d05-f11c-4af9-a22b-206a75970465"}'::jsonb, '2026-10-09T22:15:45.123027Z', '2026-10-13T22:33:20.686293Z'),
    ('00000000-0000-0000-0000-000000000000', '79417bdf-3d00-4697-9b10-296ea8871b66', 'authenticated', 'authenticated', 'flowerindelle@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-09-28T08:39:06.163562Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"flowerindelle@gmail.com","email_verified":true,"full_name":"flower","owner_pin":"1210","phone_verified":false,"sub":"79417bdf-3d00-4697-9b10-296ea8871b66"}'::jsonb, '2026-09-28T08:38:35.447082Z', '2026-09-28T19:57:03.116367Z'),
    ('00000000-0000-0000-0000-000000000000', '645f5197-f765-477b-b2e2-5af9c2aa4299', 'authenticated', 'authenticated', 'accmadesimple01@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-09-25T07:33:00.462586Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"accmadesimple01@gmail.com","email_verified":true,"full_name":"Rejoice","owner_pin":"0000","phone_verified":false,"sub":"645f5197-f765-477b-b2e2-5af9c2aa4299"}'::jsonb, '2026-09-25T07:31:51.388548Z', '2026-10-14T17:06:47.509Z'),
    ('00000000-0000-0000-0000-000000000000', 'a6f71eab-b960-4aac-b05e-48c2667e2ee4', 'authenticated', 'authenticated', 'accmadeaimple01@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-09-25T07:29:52.198398Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"accmadeaimple01@gmail.com","email_verified":false,"full_name":"Rejoice","owner_pin":"0000","phone_verified":false,"sub":"a6f71eab-b960-4aac-b05e-48c2667e2ee4"}'::jsonb, '2026-09-25T07:29:52.198398Z', '2026-09-25T07:31:34.064078Z'),
    ('00000000-0000-0000-0000-000000000000', 'a4bc788d-e8fd-44c6-8ce0-c4ad65d29865', 'authenticated', 'authenticated', 'elioenailderksen@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-09-06T11:19:15.974052Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"elioenailderksen@gmail.com","email_verified":true,"full_name":"Kofi Deku","owner_pin":"0000","phone_verified":false,"sub":"a4bc788d-e8fd-44c6-8ce0-c4ad65d29865"}'::jsonb, '2026-09-06T11:17:12.488495Z', '2026-09-06T14:30:11.550927Z'),
    ('00000000-0000-0000-0000-000000000000', '4c244c98-97f3-4c32-987a-eb8614a2d413', 'authenticated', 'authenticated', 'millionschaw@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-30T11:29:09.641177Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"millionschaw@gmail.com","email_verified":true,"full_name":"Elioenail Kofi Elinam Deku","owner_pin":"0000","phone_verified":false,"sub":"4c244c98-97f3-4c32-987a-eb8614a2d413"}'::jsonb, '2026-08-30T11:27:48.934859Z', '2026-08-31T17:22:33.885001Z'),
    ('00000000-0000-0000-0000-000000000000', '4dabca49-fdc3-421a-808f-60144de28b8a', 'authenticated', 'authenticated', 'kofianan@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-30T11:25:30.932075Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"kofianan@gmail.com","email_verified":false,"full_name":"Kofi Anan","owner_pin":"1111","phone_verified":false,"sub":"4dabca49-fdc3-421a-808f-60144de28b8a"}'::jsonb, '2026-08-30T11:25:30.932075Z', '2026-08-30T11:25:32.636949Z'),
    ('00000000-0000-0000-0000-000000000000', '319cf78c-d1b8-4eea-b482-291d10b45231', 'authenticated', 'authenticated', 'oseirani@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-21T16:44:49.556048Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"oseirani@gmail.com","email_verified":true,"full_name":"Rani Osei","owner_pin":"1234","phone_verified":false,"sub":"319cf78c-d1b8-4eea-b482-291d10b45231"}'::jsonb, '2026-08-21T16:44:08.008343Z', '2026-08-22T15:44:41.367733Z'),
    ('00000000-0000-0000-0000-000000000000', 'a79d96a0-6a2c-43bf-bc85-005058fa29bc', 'authenticated', 'authenticated', 'mikeiltakyi79@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-20T21:59:48.443807Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"mikeiltakyi79@gmail.com","email_verified":true,"full_name":"Mikeil Takyi","owner_pin":"6789","phone_verified":false,"sub":"a79d96a0-6a2c-43bf-bc85-005058fa29bc"}'::jsonb, '2026-08-20T21:59:20.361576Z', '2026-08-21T10:37:45.984265Z'),
    ('00000000-0000-0000-0000-000000000000', '13520d78-daaa-418e-88a1-9b770b453a26', 'authenticated', 'authenticated', 'raildistress@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-20T20:23:48.829244Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"raildistress@gmail.com","email_verified":true,"full_name":"Nii Shemaiah","owner_pin":"55165","phone_verified":false,"sub":"13520d78-daaa-418e-88a1-9b770b453a26"}'::jsonb, '2026-08-20T20:22:04.919459Z', '2026-08-21T16:23:30.29556Z'),
    ('00000000-0000-0000-0000-000000000000', '1855bf67-5674-4caa-aba6-1b1c00cc7314', 'authenticated', 'authenticated', 'ekoccu@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-20T19:37:19.226204Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"ekoccu@gmail.com","email_verified":true,"full_name":"Major","owner_pin":"055563","phone_verified":false,"sub":"1855bf67-5674-4caa-aba6-1b1c00cc7314"}'::jsonb, '2026-08-20T19:08:11.465279Z', '2026-08-26T09:01:18.648584Z'),
    ('00000000-0000-0000-0000-000000000000', '09c426c6-bc54-413d-acf6-92f9d4e05c41', 'authenticated', 'authenticated', 'divinemagelland@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-20T14:17:38.520639Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"divinemagelland@gmail.com","email_verified":true,"full_name":"Divimsah","owner_pin":"1688","phone_verified":false,"sub":"09c426c6-bc54-413d-acf6-92f9d4e05c41"}'::jsonb, '2026-08-20T14:16:13.900352Z', '2026-08-20T17:11:07.467605Z'),
    ('00000000-0000-0000-0000-000000000000', 'b35e6d9f-bbab-4f44-aa4e-da4368dce1d2', 'authenticated', 'authenticated', 'emma@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T23:25:19.587972Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"emma@gmail.com","email_verified":true,"full_name":"Emma","owner_pin":"0000","phone_verified":false,"sub":"b35e6d9f-bbab-4f44-aa4e-da4368dce1d2"}'::jsonb, '2026-08-19T23:25:19.550143Z', '2026-08-19T23:25:19.600252Z'),
    ('00000000-0000-0000-0000-000000000000', 'cfad187b-7466-4a59-8627-76493d259c2a', 'authenticated', 'authenticated', 'boss@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T22:51:21.365622Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"boss@gmail.com","email_verified":true,"full_name":"Boss","owner_pin":"0000","phone_verified":false,"sub":"cfad187b-7466-4a59-8627-76493d259c2a"}'::jsonb, '2026-08-19T22:51:21.334478Z', '2026-08-19T22:51:21.388172Z'),
    ('00000000-0000-0000-0000-000000000000', '49ceaff4-02c4-45dc-83b7-62ede5f69abd', 'authenticated', 'authenticated', 'robert@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T20:02:31.626676Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"robert@gmail.com","email_verified":true,"full_name":"Robert","owner_pin":"0000","phone_verified":false,"sub":"49ceaff4-02c4-45dc-83b7-62ede5f69abd"}'::jsonb, '2026-08-19T20:02:31.584136Z', '2026-08-19T23:03:05.672695Z'),
    ('00000000-0000-0000-0000-000000000000', 'da6d92fe-b7f9-4f9a-a5db-bdbcf48b9058', 'authenticated', 'authenticated', 'afiroseline15@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T18:54:41.612941Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"afiroseline15@gmail.com","email_verified":true,"full_name":"Rosie M","owner_pin":"4514","phone_verified":false,"sub":"da6d92fe-b7f9-4f9a-a5db-bdbcf48b9058"}'::jsonb, '2026-08-19T18:54:41.567791Z', '2026-10-15T19:27:44.536377Z'),
    ('00000000-0000-0000-0000-000000000000', 'f1b02c3b-5d05-4cdd-8144-971c71163d69', 'authenticated', 'authenticated', 'mikeiltakyi11@icloud.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T15:16:30.101874Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"mikeiltakyi11@icloud.com","email_verified":true,"full_name":"Mikeil takyi","owner_pin":"2459","phone_verified":false,"sub":"f1b02c3b-5d05-4cdd-8144-971c71163d69"}'::jsonb, '2026-08-19T15:16:30.03763Z', '2026-09-09T11:03:23.520292Z'),
    ('00000000-0000-0000-0000-000000000000', '688cb8b7-1a3c-4b13-88a6-b25b47260c0d', 'authenticated', 'authenticated', 'millicentadonu7@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T14:42:48.663074Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"millicentadonu7@gmail.com","email_verified":true,"full_name":"Nathaniel","owner_pin":"0000","phone_verified":false,"sub":"688cb8b7-1a3c-4b13-88a6-b25b47260c0d"}'::jsonb, '2026-08-19T14:42:48.640622Z', '2026-08-19T20:36:10.005705Z'),
    ('00000000-0000-0000-0000-000000000000', 'f7298c97-7703-4098-8e55-a019999532ad', 'authenticated', 'authenticated', 'ayeokem@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T14:15:27.275196Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"business_profile":{"address":"","bank_account":"00464838437540","bank_name":"Cal bank","email":"ayeokem@gmail.com","momo_network":"MTN MoMo","momo_number":"0598680056","phone":""},"email":"ayeokem@gmail.com","email_verified":true,"full_name":"Nii","owner_pin":"3103","phone_verified":false,"sub":"f7298c97-7703-4098-8e55-a019999532ad"}'::jsonb, '2026-08-19T14:15:27.25067Z', '2026-09-10T17:05:18.768491Z'),
    ('00000000-0000-0000-0000-000000000000', '8292e132-43e8-4838-979d-83ea7be20c0d', 'authenticated', 'authenticated', 'pizzagigs@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T12:15:40.529307Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"pizzagigs@gmail.com","email_verified":true,"full_name":"Darko Joseph","owner_pin":"00881","phone_verified":false,"sub":"8292e132-43e8-4838-979d-83ea7be20c0d"}'::jsonb, '2026-08-19T12:15:40.493188Z', '2026-08-24T13:10:57.186666Z'),
    ('00000000-0000-0000-0000-000000000000', '8231f6c5-6a59-4e3d-8349-29ebf02ce41f', 'authenticated', 'authenticated', 'adonumillicent183@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T10:14:27.694487Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"adonumillicent183@gmail.com","email_verified":true,"full_name":"Millicent Emma","owner_pin":"0000","phone_verified":false,"sub":"8231f6c5-6a59-4e3d-8349-29ebf02ce41f"}'::jsonb, '2026-08-19T10:14:27.649388Z', '2026-08-19T10:14:27.730639Z'),
    ('00000000-0000-0000-0000-000000000000', '1b99c9a2-de9c-4230-8069-319bb4f90934', 'authenticated', 'authenticated', 'addonana@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-19T02:13:18.541602Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"addonana@gmail.com","email_verified":true,"full_name":"Dr. Addo","owner_pin":"0000","phone_verified":false,"sub":"1b99c9a2-de9c-4230-8069-319bb4f90934"}'::jsonb, '2026-08-19T02:13:18.508233Z', '2026-08-19T02:13:18.554609Z'),
    ('00000000-0000-0000-0000-000000000000', '68e2c326-01bc-45ca-8107-6ec418a1457c', 'authenticated', 'authenticated', 'bhsisk@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-18T23:58:03.51794Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"bhsisk@gmail.com","email_verified":true,"full_name":"Eli","phone_verified":false,"sub":"68e2c326-01bc-45ca-8107-6ec418a1457c"}'::jsonb, '2026-08-18T23:58:03.476587Z', '2026-08-18T23:58:03.539193Z'),
    ('00000000-0000-0000-0000-000000000000', '0e35a792-e860-4ecf-b293-5a292fe3fb70', 'authenticated', 'authenticated', 'brownmensah@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-18T16:01:20.43406Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"brownmensah@gmail.com","email_verified":true,"full_name":"Mr Brown ","phone_verified":false,"sub":"0e35a792-e860-4ecf-b293-5a292fe3fb70"}'::jsonb, '2026-08-18T16:01:20.395443Z', '2026-08-18T16:01:20.452833Z'),
    ('00000000-0000-0000-0000-000000000000', 'cc45168a-5111-459f-8c63-a8e6bf74f3da', 'authenticated', 'authenticated', 'peter@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-17T12:10:41.695726Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"peter@gmail.com","email_verified":true,"full_name":"Peter","phone_verified":false,"sub":"cc45168a-5111-459f-8c63-a8e6bf74f3da"}'::jsonb, '2026-08-17T12:10:41.673739Z', '2026-08-17T13:53:58.66641Z'),
    ('00000000-0000-0000-0000-000000000000', 'f7d1455b-c4f4-4753-afbb-844e46d20513', 'authenticated', 'authenticated', 'dede@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-12T16:26:18.483313Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"dede@gmail.com","email_verified":true,"full_name":"Dede","phone_verified":false,"sub":"f7d1455b-c4f4-4753-afbb-844e46d20513"}'::jsonb, '2026-08-12T16:26:18.464212Z', '2026-08-12T19:25:36.939135Z'),
    ('00000000-0000-0000-0000-000000000000', '9bbb85aa-a219-446a-976a-ffdccfad6df2', 'authenticated', 'authenticated', 'melinda@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-11T13:12:03.989403Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"melinda@gmail.com","email_verified":true,"full_name":"Melinda","phone_verified":false,"sub":"9bbb85aa-a219-446a-976a-ffdccfad6df2"}'::jsonb, '2026-08-11T13:12:03.955924Z', '2026-08-12T16:25:19.730648Z'),
    ('00000000-0000-0000-0000-000000000000', '6190f44c-55e5-499a-86a9-97ca7c922680', 'authenticated', 'authenticated', 'yeokemadonu@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-09T20:15:38.53972Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"yeokemadonu@gmail.com","email_verified":true,"full_name":"Yeokem","phone_verified":false,"sub":"6190f44c-55e5-499a-86a9-97ca7c922680"}'::jsonb, '2026-08-09T20:15:38.523827Z', '2026-08-09T20:15:38.551503Z'),
    ('00000000-0000-0000-0000-000000000000', '21b4515b-290f-4130-92f9-c5709e2392d8', 'authenticated', 'authenticated', 'adonumillicent193@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-09T16:16:43.601891Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"adonumillicent193@gmail.com","email_verified":true,"full_name":"Millimas Pasteries","phone_verified":false,"sub":"21b4515b-290f-4130-92f9-c5709e2392d8"}'::jsonb, '2026-08-09T16:16:43.577169Z', '2026-09-28T07:17:53.12953Z'),
    ('00000000-0000-0000-0000-000000000000', '8517ebd9-ca4c-451a-8e54-2755cdfaaae5', 'authenticated', 'authenticated', 'nathanieldeku@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-09T16:10:19.273611Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"nathanieldeku@gmail.com","email_verified":true,"full_name":"Nathaniel","phone_verified":false,"sub":"8517ebd9-ca4c-451a-8e54-2755cdfaaae5"}'::jsonb, '2026-08-09T16:10:19.223184Z', '2026-08-09T16:13:14.866322Z'),
    ('00000000-0000-0000-0000-000000000000', 'c5737118-5d04-4e50-8a72-80e4337a73f6', 'authenticated', 'authenticated', 'rosie@gmail.com', crypt('TempPassword123!', gen_salt('bf')), '2026-08-09T15:07:46.120371Z', '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"rosie@gmail.com","email_verified":true,"full_name":"Rosie","phone_verified":false,"sub":"c5737118-5d04-4e50-8a72-80e4337a73f6"}'::jsonb, '2026-08-09T15:07:46.088383Z', '2026-08-13T13:57:09.424102Z')
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Auth users notice: %', SQLERRM;
END $$;

-- 2. MIGRATED BUSINESSES (37 rows)
INSERT INTO public.businesses (
  id, user_id, name, industry, currency, fiscal_year_start, business_type, tax_id, tax_filing_frequency, next_tax_filing_date, created_at
) VALUES
  ('4c68230e-aa7e-4630-b51c-e788d5b0b71c', 'c5737118-5d04-4e50-8a72-80e4337a73f6', 'Leos ', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T16:09:12.603231+00:00'),
  ('0163cc9d-f1ff-47d0-889e-271754d8637f', 'c5737118-5d04-4e50-8a72-80e4337a73f6', 'Leos ', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T16:09:15.265292+00:00'),
  ('29de6489-043c-4e42-97f4-6691222722ff', 'c5737118-5d04-4e50-8a72-80e4337a73f6', 'Leos ', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T16:09:16.43187+00:00'),
  ('fa29920a-2032-4d51-91f5-96873245915b', '8517ebd9-ca4c-451a-8e54-2755cdfaaae5', 'Photography', 'Services', 'GHS', 'July', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T16:10:55.221627+00:00'),
  ('8e926e63-22e4-4eb3-b3a6-c10188db20a1', '21b4515b-290f-4130-92f9-c5709e2392d8', 'millilas', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T16:16:57.556294+00:00'),
  ('44206764-5a61-460c-922c-04c51965443e', '21b4515b-290f-4130-92f9-c5709e2392d8', 'g', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T20:04:35.456615+00:00'),
  ('d773f1a7-7435-4674-bd6d-647f6f447b62', '21b4515b-290f-4130-92f9-c5709e2392d8', 'g', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T20:04:37.199462+00:00'),
  ('6d2807e2-c75a-43ff-8f69-6f7b2b8ee25a', '21b4515b-290f-4130-92f9-c5709e2392d8', 'Emma''s Bakery', 'Food and beverage', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-09T20:11:14.249068+00:00'),
  ('c9632d0f-b963-4afb-ac22-144a71c42a83', '9bbb85aa-a219-446a-976a-ffdccfad6df2', 'Melinda Exports', 'Transportation and logistics', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-11T13:12:27.156837+00:00'),
  ('0a58c323-2264-48e4-8c21-2d44e146dc3c', 'f7d1455b-c4f4-4753-afbb-844e46d20513', 'Fidd', 'Retail', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-12T16:26:45.830198+00:00'),
  ('72a302d7-a0c7-4253-897b-c418b30c4068', 'c5737118-5d04-4e50-8a72-80e4337a73f6', 'Rosie''s Cosmeics', 'Services', 'GHS', 'January', 'sole_proprietorship', '779020', 'quarterly', '2026-08-13', '2026-08-09T15:08:17.046795+00:00'),
  ('2f260cad-b0e0-485b-9a54-c8390d6f863d', '09c426c6-bc54-413d-acf6-92f9d4e05c41', 'DivimsahImport', 'General Trading & Import/Export', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-20T14:19:46.3363+00:00'),
  ('14d4903b-2066-4485-b419-582ef3f8a7d2', '1855bf67-5674-4caa-aba6-1b1c00cc7314', 'Majorlite', 'IT, Software, Graphic Design & Digital Agency', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-20T19:38:34.377462+00:00'),
  ('9b09d0cf-ac79-44bd-82b1-c6608ffea972', '13520d78-daaa-418e-88a1-9b770b453a26', 'Pets and grooming', 'Beauty Salon, Barbershop & Cosmetics', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-20T20:25:18.545248+00:00'),
  ('dd349824-5132-41ca-8144-d3c6ff060e67', 'a79d96a0-6a2c-43bf-bc85-005058fa29bc', 'perfectstat', 'Education, Schools & Training Centers', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-20T22:00:41.295548+00:00'),
  ('763d7695-e5ec-4adb-a412-6ce171684e59', '319cf78c-d1b8-4eea-b482-291d10b45231', 'Rani Drugs', 'Retail & Supermarket / Provision Shop', 'USD', 'October', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-21T16:45:14.598888+00:00'),
  ('dafb3d58-c311-4d51-8dc1-6f44dfc95754', 'cc45168a-5111-459f-8c63-a8e6bf74f3da', 'Peter and Sons', 'Transportation and logistics', 'USD', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-17T12:11:05.197246+00:00'),
  ('cd06a32a-596f-4245-a80a-76c176d03940', '0e35a792-e860-4ecf-b293-5a292fe3fb70', 'Browns Enterprise', 'Other', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-18T16:02:26.505128+00:00'),
  ('c0272d56-f396-4995-a613-2368bc1f9320', '68e2c326-01bc-45ca-8107-6ec418a1457c', 'bzi', 'Agriculture', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-18T23:58:21.344253+00:00'),
  ('2eccecf5-98aa-4add-8bfa-64b9b855b1df', '1b99c9a2-de9c-4230-8069-319bb4f90934', 'Addo Int', 'Other', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T02:13:42.651732+00:00'),
  ('6277fc02-e60c-4db8-bf96-052fadc45f46', 'f7298c97-7703-4098-8e55-a019999532ad', 'NextTech Solutions', 'IT, Software, Graphic Design & Digital Agency', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T14:16:52.326031+00:00'),
  ('0e6ce4bd-90f5-4722-aea4-931c9278795d', '8231f6c5-6a59-4e3d-8349-29ebf02ce41f', 'Millimas', 'Food & Beverage / Restaurant / Bar / Bakery', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T10:15:07.95572+00:00'),
  ('a092281f-f5e4-491c-b27f-3a752452bd7a', 'a4bc788d-e8fd-44c6-8ce0-c4ad65d29865', 'My Enterprise', 'Commercial Retail & Wholesale', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-09-06T15:06:12.498312+00:00'),
  ('f7016fc6-bd79-466f-af5a-02d4904bcf76', '8292e132-43e8-4838-979d-83ea7be20c0d', 'Pizza Gigs', 'Food & Beverage / Restaurant / Bar / Bakery', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T12:16:29.780467+00:00'),
  ('4f19fcba-1a3f-4ea6-81d9-9bb12fb52f06', '688cb8b7-1a3c-4b13-88a6-b25b47260c0d', 'Nats logistics ', 'Agriculture, Poultry & Farming', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T14:43:31.222182+00:00'),
  ('ff5d3cec-d587-4f4e-861f-7dc129c6666c', 'f1b02c3b-5d05-4cdd-8144-971c71163d69', 'Musks ', 'Retail & Supermarket / Provision Shop', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T15:16:50.79147+00:00'),
  ('d63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'da6d92fe-b7f9-4f9a-a5db-bdbcf48b9058', 'Rosie''s lingerie', 'Fashion, Boutique & Apparel / Tailoring', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T18:55:07.361461+00:00'),
  ('b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', '49ceaff4-02c4-45dc-83b7-62ede5f69abd', 'A&S mart', 'Retail & Supermarket / Provision Shop', 'GHS', 'August', 'sole_proprietorship', NULL, 'quarterly', NULL, '2026-08-19T20:02:57.9957+00:00'),
  ('6147d6f4-8bc1-41a6-8b9a-b858248784aa', 'cfad187b-7466-4a59-8627-76493d259c2a', 'Boss Int', 'General Trading & Import/Export', 'GHS', 'August', 'sole_proprietorship', NULL, NULL, NULL, '2026-08-19T22:51:35.22685+00:00'),
  ('a4a99e11-4752-476b-8a8d-635d54236d07', 'a4bc788d-e8fd-44c6-8ce0-c4ad65d29865', 'My Enterprise', 'Commercial Retail & Wholesale', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-09-06T15:06:12.596324+00:00'),
  ('298602dd-a7a4-4723-bd40-4099f356f5b1', '645f5197-f765-477b-b2e2-5af9c2aa4299', 'My Enterprise', 'Commercial Retail & Wholesale', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-09-25T07:33:02.322352+00:00'),
  ('058fa1fd-3f6b-463f-a925-670ed080bad1', '79417bdf-3d00-4697-9b10-296ea8871b66', 'My Enterprise', 'Commercial Retail & Wholesale', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-09-28T08:39:07.11118+00:00'),
  ('1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'Mivako', 'Transportation, Haulage & Logistics', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-10-09T22:18:34.849189+00:00'),
  ('4c94d66b-b5fa-4d62-835e-e7b4e64f788f', '09fe3d05-f11c-4af9-a22b-206a75970465', 'Mivako', 'Transportation, Haulage & Logistics', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-10-09T22:19:10.681208+00:00'),
  ('1dbc1b84-59f5-46b8-9f23-5e88ad03b6f7', '00a9835f-a846-48ac-8cd0-401b42fee2c7', 'Mivako Farms Ltd', 'Agriculture, Poultry & Farming', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-10-13T22:47:23.207811+00:00'),
  ('ded6edf2-ba2d-4782-a645-ae2e798073e0', 'cb637ca2-3a2f-495a-b14a-3f29c4ad7c6e', 'My Enterprise', 'Commercial Retail & Wholesale', 'GHS', 'January', 'sole_proprietorship', NULL, NULL, NULL, '2026-10-16T15:20:35.115601+00:00'),
  ('80f93e4a-085e-45fc-814d-8a5853a36da0', '672f7fa4-7c8d-437a-ae48-8546a7ff269c', 'Mivako airbnb', 'Hospitality, Hotels & Guest Houses', 'GHS', 'July', 'sole_proprietorship', NULL, NULL, NULL, '2026-10-16T15:35:46.429352+00:00')
ON CONFLICT (id) DO NOTHING;

-- 3. MIGRATED TRANSACTIONS (74 rows)
INSERT INTO public.transactions (
  id, business_id, vendor, amount, type, category, transaction_date, document_url, depreciation_rate, payment_method, created_at
) VALUES
  ('b233cad8-1340-4586-ba23-949829359159', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Supplier Settlement: Fan milk', 800, 'operating_expense', 'Accounts Payable Settlement | MOMO', '2026-08-31', NULL, NULL, 'cash', '2026-08-31T17:13:50.108177+00:00'),
  ('24dc2777-598e-44e9-b30d-c1d51f1ab257', '72a302d7-a0c7-4253-897b-c418b30c4068', 'Book', 60, 'revenue', 'sales', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T15:10:44.798301+00:00'),
  ('ea75895e-4730-491e-b5ba-2b80162325dd', '72a302d7-a0c7-4253-897b-c418b30c4068', 'table', 100, 'operating_expense', 'purchase', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T15:11:12.408634+00:00'),
  ('d77b1f7b-61ec-4001-87dd-bee15762f538', 'fa29920a-2032-4d51-91f5-96873245915b', 'Camera', 2000, 'operating_expense', 'Purchases', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T16:13:33.664374+00:00'),
  ('ccefa05c-ce63-4e29-b35b-bf50cc901f3e', 'fa29920a-2032-4d51-91f5-96873245915b', 'Wedding reception', 4000, 'revenue', 'Services', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T16:14:07.690783+00:00'),
  ('1e1b1dab-b918-4c01-a5bb-09a0070b02d5', '8e926e63-22e4-4eb3-b3a6-c10188db20a1', 'Meat pie', 500, 'revenue', 'Sales', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T16:17:20.552374+00:00'),
  ('40e0c829-cc5e-4d6b-8699-7375a15a8183', '8e926e63-22e4-4eb3-b3a6-c10188db20a1', 'Flour ', 200, 'operating_expense', 'Purchase', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T16:17:50.289795+00:00'),
  ('7a413cec-05e9-417c-99d4-6040193a9458', '8e926e63-22e4-4eb3-b3a6-c10188db20a1', 'Drink', 600, 'revenue', 'Sale', '2026-08-09', NULL, NULL, 'cash', '2026-08-09T20:11:43.750824+00:00'),
  ('0819b75a-f337-4be7-a55f-8520fa851ebc', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Opening Stock: Imported Inventory (3 Items)', 10650, 'current_asset', 'Opening Stock', '2026-09-25', NULL, NULL, 'cash', '2026-09-25T07:38:31.132+00:00'),
  ('4ad95101-b43c-4b10-b6ad-4a6c79783f20', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Desk Lamp', 27.99, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:32.148922+00:00'),
  ('dbc66396-5349-4764-9dd3-9a9bec00e617', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Water Bottle', 24, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:35.230411+00:00'),
  ('53b42807-9e8d-4a56-93b7-4994bf6191f2', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Wireless Keyboard', 34.99, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:38.202184+00:00'),
  ('ac9ec0b3-55a4-4a0d-ac07-542cd58a3189', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sale: Cooking Oil 1L (x23)', 805, 'revenue', 'Sales', '2026-09-28', NULL, NULL, 'bank', '2026-09-28T21:47:31.491442+00:00'),
  ('db78b341-50e7-443e-9785-f99175930572', '72a302d7-a0c7-4253-897b-c418b30c4068', 'Fhg', 500, 'operating_expense', 'Expense', '2026-08-11', NULL, NULL, 'cash', '2026-08-11T13:13:11.471757+00:00'),
  ('a436c43b-f601-4c2f-b8a6-84f41e78dab0', 'c9632d0f-b963-4afb-ac22-144a71c42a83', 'Ghh', 500, 'operating_expense', 'Purchase', '2026-08-11', NULL, NULL, 'cash', '2026-08-11T13:14:00.121057+00:00'),
  ('1fa866dc-2c55-4430-a283-dfcdb3447e6a', '0a58c323-2264-48e4-8c21-2d44e146dc3c', 'Table', 500, 'operating_expense', 'Purchases', '2026-08-12', NULL, NULL, 'cash', '2026-08-12T16:28:25.260852+00:00'),
  ('069252ce-0863-4215-8c84-65396d1d2c87', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier Settlement: Vaccine', 250, 'operating_expense', 'Accounts Payable Settlement | CASH', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:34:00.486756+00:00'),
  ('35dd9d90-16df-4fbf-aba5-c7c513710f11', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sale: Basmati Rice 5kg (x10)', 1100, 'operating_expense', 'Sales', '2026-09-25', NULL, NULL, 'cash', '2026-09-25T07:40:03.379079+00:00'),
  ('839f67e6-5d65-44ff-ba3c-3ee030fc6167', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier: Transport', 50, 'short_term_liability', 'Accounts Payable', '2026-10-09', NULL, NULL, 'bank', '2026-10-09T22:34:35.007128+00:00'),
  ('7db6448d-2eae-419b-8999-12781921eb11', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier Settlement: Transport', 50, 'operating_expense', 'Accounts Payable Settlement | CASH', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:34:43.761088+00:00'),
  ('33a5b429-ac81-4485-a5b1-0af06b614453', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'NEWLUCKY ELECTRICALS CO. LTD.', 520, 'cost_of_goods', 'Electrical Supplies', '2026-09-02', NULL, NULL, 'cash', '2026-09-02T16:57:52.198374+00:00'),
  ('de751e0c-562e-4eb0-bc01-85534d3755b4', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Invoice Payment: #INV-0001 (Rejoice)', 100, 'revenue', 'Invoicing — Cash', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:24:15.545536+00:00'),
  ('636cda88-ef5b-470b-b870-b3825c7225ec', '80f93e4a-085e-45fc-814d-8a5853a36da0', 'FAR MELCOM 01', 1440.91, 'cost_of_goods', 'Inventory Restock', '2026-10-01', NULL, NULL, 'cash', '2026-10-16T15:41:24.522059+00:00'),
  ('30f57290-261f-4062-9d54-3019fd8f8cbc', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sale: Basmati Rice 5kg (x1)', 110, 'revenue', 'Sales', '2026-09-28', NULL, NULL, 'bank', '2026-09-28T21:43:24.601288+00:00'),
  ('f9cb0f89-8664-478e-ae08-4e85a0437001', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier: Feeding', 50, 'short_term_liability', 'Accounts Payable', '2026-10-09', NULL, NULL, 'bank', '2026-10-09T22:26:46.225915+00:00'),
  ('34d892a4-10c0-4460-bc53-ea721f6fe4d7', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Supplier Settlement: Adama', 50, 'operating_expense', 'Accounts Payable Settlement | MOMO', '2026-08-31', NULL, NULL, 'cash', '2026-08-31T17:47:13.806275+00:00'),
  ('74c141f8-42af-4b4e-ad2b-37af9d1a32bc', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Wireless Mouse', 39.98, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:29.801579+00:00'),
  ('9e601d48-83f4-4554-ba66-061827fc02ab', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Bluetooth Headphones', 59, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:32.814939+00:00'),
  ('97b08fcd-3a09-4664-be1f-1f2de25e1238', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Phone Case', 15.5, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:36.051712+00:00'),
  ('5426233e-5585-4d82-8797-7e761f71635a', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Desk Organizer', 18.25, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:38.741586+00:00'),
  ('f6080590-9535-4af3-a235-b62cee51a554', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier Settlement: Feeding', 50, 'operating_expense', 'Accounts Payable Settlement | CASH', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:27:26.352525+00:00'),
  ('309a34bb-9b31-4552-9d75-0f23babbe268', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'USB-C Cable', 25.5, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:30.559932+00:00'),
  ('e0ea26f0-5967-43ed-9525-a69f36066358', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Printer Paper (Ream)', 25.96, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:33.279904+00:00'),
  ('c87796eb-2037-4272-a9a1-20cc3cc5dccc', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Backpack', 45, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:36.498682+00:00'),
  ('1dd49694-d303-4b0b-b8c2-738e68019df8', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'LED Light Strip', 26.8, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:39.197196+00:00'),
  ('34826c99-924d-4674-b292-7874ffba39de', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier Settlement: Feeding', 50, 'operating_expense', 'Accounts Payable Settlement | CASH', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:29:31.093153+00:00'),
  ('4ca61ae2-5346-47d1-8626-679873942b9e', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Notebook (A5)', 16.25, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:31.030117+00:00'),
  ('9f92db38-f6fb-45cd-8224-aed7a707ff96', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Ballpoint Pens (12pk)', 14.97, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:33.845183+00:00'),
  ('82797a9c-3741-4cb6-a5cf-f293a5bd482b', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'HDMI Cable', 19.98, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:37.172943+00:00'),
  ('2ce91dc4-5056-492e-806a-b576478b14be', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Invoice Payment: #INV-0003 (John)', 500, 'revenue', 'Invoicing — Cash', '2026-10-09', NULL, NULL, 'cash', '2026-10-09T22:31:55.205626+00:00'),
  ('76f19e45-c392-462e-b86f-538fab168916', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Invoice Payment: #INV-0002 (John)', 500, 'revenue', 'Invoicing — Bank / MoMo', '2026-10-09', NULL, NULL, 'bank', '2026-10-09T22:32:21.906035+00:00'),
  ('c51332c6-7527-42d2-8416-3279e2a3dc02', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'University Health Services Directorate - University of Ghana, Legon', 35, 'operating_expense', 'Medical Expense', '2026-07-16', NULL, NULL, 'cash', '2026-08-19T19:19:32.048935+00:00'),
  ('a660f76c-bb11-4099-80e8-0fbfbea666dd', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'University Health Services Directorate - University of Ghana, Legon', 35, 'operating_expense', 'Medical Expense', '2026-07-16', NULL, NULL, 'cash', '2026-08-19T19:20:10.307392+00:00'),
  ('1cb9be0b-df69-4588-942a-1e236e71f6f9', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'Mylorea', 500000, 'cost_of_goods', 'Sales', '2026-08-19', NULL, NULL, 'cash', '2026-08-19T19:35:25.806091+00:00'),
  ('e182e060-1a24-4b0e-9fbe-696e57286a4f', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'Mylorea', 500000, 'cost_of_goods', 'Sales', '2026-08-19', NULL, NULL, 'cash', '2026-08-19T19:36:17.383988+00:00'),
  ('a2117c25-392e-4366-ac51-e1fd008aa4a3', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'Zzz', 20000, 'revenue', 'Sales', '2026-08-19', NULL, NULL, 'cash', '2026-08-19T19:37:04.20747+00:00'),
  ('d5800102-2ee3-4984-8877-d5d7c9b02239', 'd63071b0-9dd5-4d72-92b1-cf28c3eedd5d', 'Leo''s lingerie depot', 5000, 'cost_of_goods', 'Sales', '2026-08-19', NULL, NULL, 'cash', '2026-08-19T19:39:42.407965+00:00'),
  ('fb719815-690e-45dd-9df2-594b6717ca8f', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Wireless Mouse', 39.98, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:48.234197+00:00'),
  ('3692e9a5-c272-4e00-95cc-01ea90251b87', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'USB-C Cable', 25.5, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:48.78306+00:00'),
  ('0612baeb-879c-4784-9008-d36069a22d40', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Notebook (A5)', 16.25, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:49.335179+00:00'),
  ('4c8a4107-fe9d-475d-a32f-b9d3bf6d6142', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Coffee Beans (1kg)', 29.5, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:49.77838+00:00'),
  ('fca096c3-7b6c-400e-852b-280b3ff73c3a', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Desk Lamp', 27.99, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:50.294773+00:00'),
  ('68dab0b7-3a84-43f9-868f-df679beed9f3', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Bluetooth Headphones', 59, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:51.028178+00:00'),
  ('6476b5d1-e9fa-4524-bdb6-c02f05e06461', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Printer Paper (Ream)', 25.96, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:51.651737+00:00'),
  ('733a783c-00fb-433d-808a-139fc0be63af', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Ballpoint Pens (12pk)', 14.97, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:52.087382+00:00'),
  ('8d5d164f-44b5-4aa0-8830-f20f0f4cef4f', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'External Hard Drive 1TB', 64.99, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:52.603525+00:00'),
  ('aa2c546e-0d70-411e-95dd-fe12c54fa901', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Water Bottle', 24, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:53.064565+00:00'),
  ('1240c065-2e2c-4c8c-8d44-d508a963bcc1', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Phone Case', 15.5, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:53.53642+00:00'),
  ('32e0b1c3-a02e-43e8-8e7a-aa3131005e56', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Backpack', 45, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:54.072852+00:00'),
  ('c86589ea-b372-4bd5-9066-35bd298f7e40', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'HDMI Cable', 19.98, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:54.54272+00:00'),
  ('a02bfa99-f3a4-4379-bae7-d4d4195854d5', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Sticky Notes (Pack)', 16.5, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:54.97775+00:00'),
  ('0279f061-17d5-43aa-aaee-dc12052a6a5f', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Wireless Keyboard', 34.99, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:55.4262+00:00'),
  ('f8a414ea-3555-4b02-b2ed-f5f4799f9b2b', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Desk Organizer', 18.25, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:55.904416+00:00'),
  ('4d4f22e7-5f70-4974-b3d1-41e34cd6fa32', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'LED Light Strip', 26.8, 'current_asset', 'Inventory restock', '2026-08-19', NULL, NULL, 'bank', '2026-08-19T20:04:56.363338+00:00'),
  ('7ae28f44-bde8-41d4-a63a-44165e1e3249', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Sale: Notebook (A5) (x1)', 4.23, 'revenue', 'Sales', '2026-08-19', NULL, NULL, 'cash', '2026-08-19T20:05:16.393583+00:00'),
  ('46e18c72-d699-41ae-bf75-fafc510ca603', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Coffee Beans (1kg)', 29.5, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:31.696387+00:00'),
  ('32b80d51-9815-43e6-ba77-de40ce8f1a73', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'External Hard Drive 1TB', 64.99, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:34.487432+00:00'),
  ('76cdf926-01e7-4d5d-a218-a74a6743ccaa', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sticky Notes (Pack)', 16.5, 'current_asset', 'Inventory restock', '2026-09-28', NULL, NULL, 'cash', '2026-09-28T21:46:37.706625+00:00'),
  ('c23280e7-a845-4ecb-afa0-3a59a41b4a7b', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Supplier: Adama', 0, 'short_term_liability', 'Accounts Payable', '2026-09-28', NULL, NULL, 'bank', '2026-09-28T21:48:55.745295+00:00'),
  ('1c7b1862-ce42-4a03-8ac7-91c71c5721b8', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Supplier: Vaccine', 0, 'short_term_liability', 'Accounts Payable', '2026-10-09', NULL, NULL, 'bank', '2026-10-09T22:33:06.731245+00:00'),
  ('01187c47-7508-4039-a26d-056a7e6f109e', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Food', 240, 'operating_expense', NULL, '2026-08-28', NULL, NULL, 'cash', '2026-08-29T21:12:45.607654+00:00'),
  ('6b81c998-0fa3-45cb-b26b-7e4d1f3762b3', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Food', 240, 'operating_expense', NULL, '2026-08-28', NULL, NULL, 'cash', '2026-08-30T20:16:03.051503+00:00'),
  ('dca6edfc-40b9-4f19-bf3a-7d778535886b', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Hardware store', 70, 'cost_of_goods', NULL, '2026-08-30', NULL, NULL, 'cash', '2026-08-30T20:18:44.877301+00:00'),
  ('f97ec69b-f637-4d16-8d7a-11a89eb2b976', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Fueling station', 400, 'operating_expense', NULL, '2026-08-28', NULL, NULL, 'cash', '2026-08-30T20:19:56.487308+00:00')
ON CONFLICT (id) DO NOTHING;

-- 4. MIGRATED INVENTORY ITEMS (40 rows)
INSERT INTO public.inventory_items (
  id, business_id, name, barcode, quantity, unit_cost, unit_price, cost_price, selling_price, created_at
) VALUES
  ('5be9774a-adc6-48e6-a99b-b1944a5570ff', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sugar 1kg', '8901234567892', 200, 18, 22.5, 18, 22.5, '2026-09-25T07:38:30.331788+00:00'),
  ('51d66ee0-8271-40b4-a2e2-c2c88b1d7d1f', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Basmati Rice 5kg', '8901234567890', 39, 85, 110, 85, 110, '2026-09-25T07:38:30.331788+00:00'),
  ('cbeae85a-6ec6-4ae0-b301-89e8ef0deef1', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Desk Lamp', NULL, 1, 27.99, 36.39, 27.99, 36.39, '2026-09-28T21:46:31.926262+00:00'),
  ('6de0d31f-36d6-47e4-91b8-d39b27ee63fe', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Water Bottle', NULL, 2, 12, 15.6, 12, 15.6, '2026-09-28T21:46:34.739409+00:00'),
  ('4c7301fc-d4c2-43e8-8ee3-5eb13513d35c', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Wireless Keyboard', NULL, 1, 34.99, 45.49, 34.99, 45.49, '2026-09-28T21:46:37.899352+00:00'),
  ('58fa56f9-b3f8-4bdc-88c8-8d545009a66f', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Cooking Oil 1L', '8901234567891', 77, 28, 35, 28, 35, '2026-09-25T07:38:30.331788+00:00'),
  ('363e70e2-26f0-4cfa-b076-ee728b99dc32', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Wireless Mouse', NULL, 2, 19.99, 25.99, 19.99, 25.99, '2026-08-19T20:04:48.004507+00:00'),
  ('7fbb5fb0-20e5-41f1-a1dc-97608eefbda1', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Desk Lamp', NULL, 1, 27.99, 36.39, 27.99, 36.39, '2026-08-19T20:04:50.06519+00:00'),
  ('9cabf1da-8060-499b-8c40-c11979e7ea8c', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Bluetooth Headphones', NULL, 1, 59, 76.7, 59, 76.7, '2026-08-19T20:04:50.598943+00:00'),
  ('a903013c-ad73-4e61-9506-512468f23fda', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Backpack', NULL, 1, 45, 58.5, 45, 58.5, '2026-08-19T20:04:53.845981+00:00'),
  ('a106fc88-5df1-47f4-a2ad-98f2572f8d4c', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'HDMI Cable', NULL, 2, 9.99, 12.99, 9.99, 12.99, '2026-08-19T20:04:54.335358+00:00'),
  ('c71182d9-dced-4077-a584-af8a458d6cec', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Wireless Mouse', NULL, 2, 19.99, 25.99, 19.99, 25.99, '2026-09-28T21:46:29.474018+00:00'),
  ('b6c59dc3-43c9-4044-824c-6100ba6bb84d', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Bluetooth Headphones', NULL, 1, 59, 76.7, 59, 76.7, '2026-09-28T21:46:32.401414+00:00'),
  ('40b72981-fb6b-454a-a28b-15ea409df0e3', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Phone Case', NULL, 1, 15.5, 20.15, 15.5, 20.15, '2026-09-28T21:46:35.742665+00:00'),
  ('59cc6e02-e9b9-4c95-8222-00ec72abd6ac', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Desk Organizer', NULL, 1, 18.25, 23.73, 18.25, 23.73, '2026-09-28T21:46:38.527772+00:00'),
  ('7f8f4bd4-458b-4be4-9dba-7f3e6bb1d619', 'a4a99e11-4752-476b-8a8d-635d54236d07', 'Ghana Rubber Products Ltd - Raw Materials', '', 1, 18500, 23125, 18500, 23125, '2026-09-06T15:07:31.444+00:00'),
  ('9a68e675-8e2d-4263-a4d8-8d8fdedf8182', 'a4a99e11-4752-476b-8a8d-635d54236d07', 'Olam Agri Ghana - Inventory Goods', '', 1, 45000, 56250, 45000, 56250, '2026-09-06T15:07:31.444+00:00'),
  ('4d548cf6-3843-4e73-a272-4afd7e8ed3d0', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'USB-C Cable', NULL, 3, 8.5, 11.05, 8.5, 11.05, '2026-09-28T21:46:30.29922+00:00'),
  ('1bc2571d-8e54-418d-bcb7-c0f2de3b2280', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'USB-C Cable', NULL, 3, 8.5, 11.05, 8.5, 11.05, '2026-08-19T20:04:48.500307+00:00'),
  ('36123c75-f601-4dd7-8595-54fa2bc22593', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Printer Paper (Ream)', NULL, 4, 6.49, 8.44, 6.49, 8.44, '2026-08-19T20:04:51.378424+00:00'),
  ('59d53cd4-019c-49d1-b8c7-801c85fdfa34', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'External Hard Drive 1TB', NULL, 1, 64.99, 84.49, 64.99, 84.49, '2026-08-19T20:04:52.352339+00:00'),
  ('b369f666-1e42-4e7a-ac58-0f9fc75d5eb7', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Sticky Notes (Pack)', NULL, 6, 2.75, 3.58, 2.75, 3.58, '2026-08-19T20:04:54.773325+00:00'),
  ('c606e81a-a05e-4a8c-a763-bf65cc8b7f02', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Printer Paper (Ream)', NULL, 4, 6.49, 8.44, 6.49, 8.44, '2026-09-28T21:46:33.066732+00:00'),
  ('fcc292ed-90e1-406c-99eb-03cef50fce13', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Backpack', NULL, 1, 45, 58.5, 45, 58.5, '2026-09-28T21:46:36.267325+00:00'),
  ('9a99d997-1576-4d52-b5fa-993626de4a81', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Desk Organizer', NULL, 1, 18.25, 23.73, 18.25, 23.73, '2026-08-19T20:04:55.665585+00:00'),
  ('d5d7f815-70f2-4111-8f4b-7e38faa86454', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'LED Light Strip', NULL, 2, 13.4, 17.42, 13.4, 17.42, '2026-09-28T21:46:38.98534+00:00'),
  ('8909893d-dda4-463e-8384-e4a462969008', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'Yogurt ', NULL, 10, 50, 67.5, 50, 67.5, '2026-08-31T17:46:26.411473+00:00'),
  ('2a46f285-c227-42c0-a73f-901aa98668db', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Ballpoint Pens (12pk)', NULL, 3, 4.99, 6.49, 4.99, 6.49, '2026-08-19T20:04:51.843818+00:00'),
  ('6c9b484f-ff53-4279-bba5-361a9c32f1c9', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Water Bottle', NULL, 2, 12, 15.6, 12, 15.6, '2026-08-19T20:04:52.840614+00:00'),
  ('f307e496-676c-4b0e-9d59-67d7c06d8fff', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Wireless Keyboard', NULL, 1, 34.99, 45.49, 34.99, 45.49, '2026-08-19T20:04:55.20119+00:00'),
  ('68ef21b6-8eb0-43f4-836d-fff476b2f2c8', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'LED Light Strip', NULL, 2, 13.4, 17.42, 13.4, 17.42, '2026-08-19T20:04:56.143042+00:00'),
  ('590a24db-48be-4894-8580-6a7af626b11a', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Notebook (A5)', NULL, 4, 3.25, 4.23, 3.25, 4.23, '2026-08-19T20:04:49.054518+00:00'),
  ('75304036-ccf3-464e-a362-b29e0ba20796', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Notebook (A5)', NULL, 5, 3.25, 4.23, 3.25, 4.23, '2026-09-28T21:46:30.796241+00:00'),
  ('5c155ce3-fb40-4207-90a9-11ff0bf16caf', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Ballpoint Pens (12pk)', NULL, 3, 4.99, 6.49, 4.99, 6.49, '2026-09-28T21:46:33.453745+00:00'),
  ('e65f23c3-ce35-4af0-bf78-ef43081f2123', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'HDMI Cable', NULL, 2, 9.99, 12.99, 9.99, 12.99, '2026-09-28T21:46:37.002976+00:00'),
  ('3f3d1e82-f248-46fc-bb48-18ea3ce35052', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Coffee Beans (1kg)', NULL, 2, 14.75, 19.18, 14.75, 19.18, '2026-08-19T20:04:49.560424+00:00'),
  ('82fc70b5-ef76-4d4d-9cb7-8c25a9157d2a', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'Phone Case', NULL, 1, 15.5, 20.15, 15.5, 20.15, '2026-08-19T20:04:53.306895+00:00'),
  ('f7685680-17be-4571-b854-d988ea4b7389', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Coffee Beans (1kg)', NULL, 2, 14.75, 19.18, 14.75, 19.18, '2026-09-28T21:46:31.270465+00:00'),
  ('867f1da0-0149-4cc2-8063-754860bbde3d', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'External Hard Drive 1TB', NULL, 1, 64.99, 84.49, 64.99, 84.49, '2026-09-28T21:46:34.26365+00:00'),
  ('21f5df40-4189-432a-b6f8-0aba1fdb54be', '298602dd-a7a4-4723-bd40-4099f356f5b1', 'Sticky Notes (Pack)', NULL, 6, 2.75, 3.58, 2.75, 3.58, '2026-09-28T21:46:37.487572+00:00')
ON CONFLICT (id) DO NOTHING;

-- 5. MIGRATED INVOICES (7 rows)
INSERT INTO public.invoices (
  id, business_id, invoice_number, customer_name, customer_email, customer_phone, amount, description, due_date, status, created_at
) VALUES
  ('5ca42045-d96d-49fd-b7a3-a0b887f7a7b1', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'INV-0001', 'Rejoice', 'Eliyaanaa84@gmail.com', NULL, 100, 'Phone: 0423125292', '2026-10-23', 'paid', '2026-10-09T22:23:00.039762+00:00'),
  ('40958436-3ac9-4539-b16b-3bfda865e55d', 'dafb3d58-c311-4d51-8dc1-6f44dfc95754', 'INV-0001', 'Nathaniel Deku', 'nathanieldeku01@gmail.com', NULL, 3000, 'Credit sales', '2026-08-19', 'sent', '2026-08-17T13:55:13.645625+00:00'),
  ('89364a59-d210-41df-8b83-c26d46b1b772', 'b9d13079-06f1-4ed7-b9e4-cdae65fb8ace', 'INV-0001', 'Ama', NULL, NULL, 600, 'Credit sales | Phone: 0553958062', '2026-09-02', 'sent', '2026-08-19T20:07:40.186155+00:00'),
  ('9b8c9620-9b42-4d4d-a106-d8ce60ec2fbc', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'INV-0003', 'John', 'hyggh@gmail.com', NULL, 500, 'Phone: 0565596684', '2026-10-23', 'paid', '2026-10-09T22:30:52.334651+00:00'),
  ('f46367a2-27f2-4422-a67e-fffe0d23b7f4', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'INV-0002', 'John', 'hyggh@gmail.com', NULL, 500, 'Phone: 0565596684', '2026-10-23', 'paid', '2026-10-09T22:30:51.225464+00:00'),
  ('a81ff656-3358-4414-8494-da3f6a0ee9db', '14d4903b-2066-4485-b419-582ef3f8a7d2', 'INV-0001', 'Yeokem', NULL, NULL, 500, 'Ajax siren | Phone: 0551659550', '2026-09-05', 'sent', '2026-08-22T06:20:21.234146+00:00'),
  ('6827756d-1bde-4ca6-b33e-4787154a7d0b', '6277fc02-e60c-4db8-bf96-052fadc45f46', 'INV-0001', 'Bob', 'ayeokem@gmail.com', NULL, 600, 'Credit sales | Phone: 0551659550', '2026-08-01', 'sent', '2026-08-31T17:18:21.818478+00:00')
ON CONFLICT (id) DO NOTHING;

-- 6. MIGRATED BUSINESS MEMBERS (1 rows)
INSERT INTO public.business_members (
  id, business_id, user_id, name, email, role, phone, branch, salary, created_at
) VALUES
  ('b069b8ad-f2ae-4474-b10f-c116f336b6d8', '6277fc02-e60c-4db8-bf96-052fadc45f46', NULL, 'Joe', 'jdod@gmail.com', 'employee', NULL, 'Main Branch', 600, '2026-08-31T17:47:58.966961+00:00')
ON CONFLICT (id) DO NOTHING;

-- 7. MIGRATED AUDIT LOGS (19 rows)
INSERT INTO public.audit_logs (
  id, business_id, actor_id, actor_email, actor_role, action_type, entity_type, entity_id, entity_name, description, old_value, new_value, metadata, ip_or_device, created_at
) VALUES
  ('2e961a48-8bb8-4f6e-ad16-9fdffb6d64e2', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'owner (client-reported)', 'CREATE', 'business_profile', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', 'Mivako', 'Created the business workspace "Mivako" (Transportation, Haulage & Logistics) with GHS as the recording currency and the fiscal year starting January.', NULL, '{"name":"Mivako","currency":"GHS","industry":"Transportation, Haulage & Logistics","fiscal_year_start":"January"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:18:35.258+00:00'),
  ('4372d38d-6005-45a4-95f8-ee66bee562fe', '4c94d66b-b5fa-4d62-835e-e7b4e64f788f', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'owner (client-reported)', 'CREATE', 'business_profile', '4c94d66b-b5fa-4d62-835e-e7b4e64f788f', 'Mivako', 'Created the business workspace "Mivako" (Transportation, Haulage & Logistics) with GHS as the recording currency and the fiscal year starting January.', NULL, '{"name":"Mivako","currency":"GHS","industry":"Transportation, Haulage & Logistics","fiscal_year_start":"January"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:19:11.082+00:00'),
  ('9d2285b4-2eac-4954-8764-c2f4f1aeefb3', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'invoice', 'INV-0001', 'Rejoice', 'Created invoice INV-0001 for Rejoice with a total amount of 100.00 in status sent, due 2026-10-23.', NULL, NULL, '{"amount":100,"status":"sent","due_date":"2026-10-23","customer_name":"Rejoice","customer_email":"Eliyaanaa84@gmail.com","customer_phone":null,"invoice_number":"INV-0001"}', 'Mobile Expo Native App', '2026-10-09T22:23:00.504+00:00'),
  ('7feb08dc-58f6-4103-bd4a-e96a5a708233', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'UPDATE', 'invoice', '5ca42045-d96d-49fd-b7a3-a0b887f7a7b1', 'Rejoice', 'Marked invoice #INV-0001 (Rejoice, GHS 100.00) as paid on 2026-10-09 via cash; revenue logged as "Invoice Payment: #INV-0001 (Rejoice)".', '{"status":"sent"}', '{"amount":100,"status":"paid","paid_at":"2026-10-09T22:24:14.905Z","payment_method":"cash"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:24:16.037+00:00'),
  ('66fbc285-4001-45d3-8d92-427ccf347a5c', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'transaction', 'supplier:sup_1791584805654_66fz', 'Feeding', 'Onboarded supplier Feeding with an opening payable of 50.00 booked as short_term_liability under Accounts Payable on 2026-10-09.', NULL, '{"debt_type":"inventory","supplier_id":"sup_1791584805654_66fz","supplier_name":"Feeding","synced_online":true,"liability_type":"short_term_liability","opening_balance":50,"transaction_date":"2026-10-09"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:26:46.656+00:00'),
  ('6f2d1897-35f4-47ef-b9c7-15d2091cbef6', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'DISBURSE_PAYOUT', 'supplier_payout', 'pv_1791584846145_eijx', 'Feeding', 'Paid supplier Feeding: voucher PV-2026-001, gross 50, withholding tax 0, net disbursed 50 via cash from Cash Drawer. Balance still owed to supplier after this payment: 0.', NULL, '{"amountPaid":50,"paymentMethod":"cash","voucherNumber":"PV-2026-001","paymentReference":"BILL-845402","netAmountDisbursed":50,"withholdingTaxRate":0,"remainingBalanceOwed":0,"withholdingTaxAmount":0}', NULL, 'Mobile Expo Native App', '2026-10-09T22:27:26.769+00:00'),
  ('51746b28-bfcf-48b2-abab-fb4341675578', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'DISBURSE_PAYOUT', 'supplier_payout', 'pv_1791584970883_t8bs', 'Feeding', 'Paid supplier Feeding: voucher PV-2026-002, gross 50, withholding tax 0, net disbursed 50 via cash from Cash Drawer. Balance still owed to supplier after this payment: 0.', NULL, '{"amountPaid":50,"paymentMethod":"cash","voucherNumber":"PV-2026-002","paymentReference":"BILL-970224","netAmountDisbursed":50,"withholdingTaxRate":0,"remainingBalanceOwed":0,"withholdingTaxAmount":0}', NULL, 'Mobile Expo Native App', '2026-10-09T22:29:31.508+00:00'),
  ('f5f27e05-1330-4bf6-94ff-2a6c0010ac09', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'invoice', 'INV-0002', 'John', 'Created invoice INV-0002 for John with a total amount of 500.00 in status sent, due 2026-10-23.', NULL, NULL, '{"amount":500,"status":"sent","due_date":"2026-10-23","customer_name":"John","customer_email":"hyggh@gmail.com","customer_phone":null,"invoice_number":"INV-0002"}', 'Mobile Expo Native App', '2026-10-09T22:30:51.589+00:00'),
  ('82503f92-961e-48c8-a992-ae0d217830ea', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'invoice', 'INV-0003', 'John', 'Created invoice INV-0003 for John with a total amount of 500.00 in status sent, due 2026-10-23.', NULL, NULL, '{"amount":500,"status":"sent","due_date":"2026-10-23","customer_name":"John","customer_email":"hyggh@gmail.com","customer_phone":null,"invoice_number":"INV-0003"}', 'Mobile Expo Native App', '2026-10-09T22:30:52.738+00:00'),
  ('37738c08-0532-4bd5-bada-933864a9e250', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'UPDATE', 'invoice', '9b8c9620-9b42-4d4d-a106-d8ce60ec2fbc', 'John', 'Marked invoice #INV-0003 (John, GHS 500.00) as paid on 2026-10-09 via cash; revenue logged as "Invoice Payment: #INV-0003 (John)".', '{"status":"sent"}', '{"amount":500,"status":"paid","paid_at":"2026-10-09T22:31:54.693Z","payment_method":"cash"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:31:55.592+00:00'),
  ('09c32828-ba15-409d-b597-1eb9536a150e', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'EXPORT_REPORT', 'invoice', 'invoice:INV-0002', 'John', 'Exported invoice PDF #INV-0002 for John totalling GHS 500.00 of Mivako.', NULL, NULL, NULL, 'Mobile Expo Native App', '2026-10-09T22:32:19.054+00:00'),
  ('6e0e620d-fe4a-438c-bb19-8b76ad6f572e', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'UPDATE', 'invoice', 'f46367a2-27f2-4422-a67e-fffe0d23b7f4', 'John', 'Marked invoice #INV-0002 (John, GHS 500.00) as paid on 2026-10-09 via bank / MoMo; revenue logged as "Invoice Payment: #INV-0002 (John)".', '{"status":"sent"}', '{"amount":500,"status":"paid","paid_at":"2026-10-09T22:32:21.386Z","payment_method":"bank"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:32:22.276+00:00'),
  ('f58bf9e5-9a0b-41db-802b-9f4c2faa8291', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'transaction', 'supplier:sup_1791585186044_vugw', 'Vaccine', 'Onboarded supplier Vaccine with an opening payable of 0.00 booked as short_term_liability under Accounts Payable on 2026-10-09.', NULL, '{"debt_type":"inventory","supplier_id":"sup_1791585186044_vugw","supplier_name":"Vaccine","synced_online":true,"liability_type":"short_term_liability","opening_balance":0,"transaction_date":"2026-10-09"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:33:07.412+00:00'),
  ('d76bf903-9f3c-43f4-88ee-b09abb374410', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'DISBURSE_PAYOUT', 'supplier_payout', 'pv_1791585240274_vn46', 'Vaccine', 'Paid supplier Vaccine: voucher PV-2026-003, gross 250, withholding tax 0, net disbursed 250 via cash from Cash Drawer. Balance still owed to supplier after this payment: 0.', NULL, '{"amountPaid":250,"paymentMethod":"cash","voucherNumber":"PV-2026-003","paymentReference":"BILL-239357","netAmountDisbursed":250,"withholdingTaxRate":0,"remainingBalanceOwed":0,"withholdingTaxAmount":0}', NULL, 'Mobile Expo Native App', '2026-10-09T22:34:00.925+00:00'),
  ('2a4cb735-3ca0-458f-b20c-41012ecbd7c1', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'CREATE', 'transaction', 'supplier:sup_1791585274197_sfs0', 'Transport', 'Onboarded supplier Transport with an opening payable of 50.00 booked as short_term_liability under Accounts Payable on 2026-10-09.', NULL, '{"debt_type":"inventory","supplier_id":"sup_1791585274197_sfs0","supplier_name":"Transport","synced_online":true,"liability_type":"short_term_liability","opening_balance":50,"transaction_date":"2026-10-09"}', NULL, 'Mobile Expo Native App', '2026-10-09T22:34:35.429+00:00'),
  ('eadd9287-24e1-4809-94b0-f275533b02d9', '1dbf89c6-91d0-4509-a84e-9c1f5ebe8714', '09fe3d05-f11c-4af9-a22b-206a75970465', 'eliyaanaa84@gmail.com', 'unknown (client-reported)', 'DISBURSE_PAYOUT', 'supplier_payout', 'pv_1791585283548_mhsk', 'Transport', 'Paid supplier Transport: voucher PV-2026-004, gross 50, withholding tax 0, net disbursed 50 via cash from Cash Drawer. Balance still owed to supplier after this payment: 0.', NULL, '{"amountPaid":50,"paymentMethod":"cash","voucherNumber":"PV-2026-004","paymentReference":"BILL-282900","netAmountDisbursed":50,"withholdingTaxRate":0,"remainingBalanceOwed":0,"withholdingTaxAmount":0}', NULL, 'Mobile Expo Native App', '2026-10-09T22:34:44.168+00:00'),
  ('de9322ad-f1d5-46ea-9da6-d5606d775a02', '1dbc1b84-59f5-46b8-9f23-5e88ad03b6f7', '00a9835f-a846-48ac-8cd0-401b42fee2c7', 'prevail246@gmail.com', 'owner (client-reported)', 'CREATE', 'business_profile', '1dbc1b84-59f5-46b8-9f23-5e88ad03b6f7', 'Mivako Farms Ltd', 'Created the business workspace "Mivako Farms Ltd" (Agriculture, Poultry & Farming) with GHS as the recording currency and the fiscal year starting January.', NULL, '{"name":"Mivako Farms Ltd","currency":"GHS","industry":"Agriculture, Poultry & Farming","fiscal_year_start":"January"}', NULL, 'Mobile Expo Native App', '2026-10-13T22:47:23.7+00:00'),
  ('deb50dab-b653-4be6-9c96-18b07eb3eeb2', '80f93e4a-085e-45fc-814d-8a5853a36da0', '672f7fa4-7c8d-437a-ae48-8546a7ff269c', 'memoriesm415@gmail.com', 'owner (client-reported)', 'CREATE', 'business_profile', '80f93e4a-085e-45fc-814d-8a5853a36da0', 'Mivako airbnb', 'Created the business workspace "Mivako airbnb" (Hospitality, Hotels & Guest Houses) with GHS as the recording currency and the fiscal year starting July.', NULL, '{"name":"Mivako airbnb","currency":"GHS","industry":"Hospitality, Hotels & Guest Houses","fiscal_year_start":"July"}', NULL, 'Mobile Expo Native App', '2026-10-16T15:35:46.909+00:00'),
  ('249a517f-5ea9-4fc2-ae07-d3e97efb192d', '80f93e4a-085e-45fc-814d-8a5853a36da0', '672f7fa4-7c8d-437a-ae48-8546a7ff269c', 'memoriesm415@gmail.com', 'unknown (client-reported)', 'CREATE', 'transaction', 'transaction:80f93e4a-085e-45fc-814d-8a5853a36da0:2026-10-01:FAR MELCOM 01', 'FAR MELCOM 01', 'Captured receipt entry for FAR MELCOM 01 of GHS 1440.91 saved as transaction type cost_of_goods in category Inventory Restock on 2026-10-01, paid via cash.', NULL, NULL, '{"type":"cost_of_goods","amount":1440.91,"vendor":"FAR MELCOM 01","category":"Inventory Restock","currency":"GHS","line_items":1,"receipt_file":"file:///data/user/0/com.ams.accounting/cache/ImagePicker/80cbc4d5-2342-40b2-88ec-bdc8978cf977.jpeg","payment_method":"cash","transaction_date":"2026-10-01","depreciation_rate":null}', 'Mobile Expo Native App', '2026-10-16T15:41:25.082+00:00')
ON CONFLICT (id) DO NOTHING;

