-- LANGKAH 6: TRANSAKSI AMAN (anti ganda) DAN RIWAYAT PERUBAHAN DATA (audit trail)
-- Jalankan utuh di SQL Editor. Aman dijalankan berulang.

-- ============================================================== 1) Pencegahan transaksi ganda
-- Setiap transaksi dari Kasir membawa satu kunci unik (request_id). Bila kunci yang sama dikirim lagi
-- (klik berulang, koneksi lambat, kirim ulang setelah timeout), server mengembalikan transaksi yang
-- sudah tersimpan dan TIDAK membuat yang baru.
create table if not exists public.sale_request_log (
  request_id uuid primary key,
  created_by uuid default auth.uid(),
  sale_id bigint not null,
  created_at timestamptz not null default now()
);
alter table public.sale_request_log enable row level security; -- tanpa kebijakan: hanya fungsi di bawah yang boleh mengakses

create or replace function public.create_sale_idem(
  p_request_id uuid, p_method text, p_cash_received integer, p_items jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  v_prev record;
  v_id bigint;
  v_cash text;
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;
  if p_request_id is null then raise exception 'Kunci permintaan wajib ada'; end if;

  -- permintaan dengan kunci yang sama dilayani satu per satu
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 17));

  select sale_id, created_by into v_prev from sale_request_log where request_id = p_request_id;
  if found then
    if v_prev.created_by is distinct from auth.uid() then raise exception 'Kunci permintaan sudah dipakai'; end if;
    return v_prev.sale_id; -- sudah pernah tersimpan: kembalikan yang lama
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if p_cash_received is not null and p_cash_received < 0 then raise exception 'Nominal uang diterima tidak valid'; end if;

  -- create_sale dipanggil lewat literal bertipe "unknown" agar cocok dengan tipe parameter aslinya
  v_cash := case when p_cash_received is null then 'NULL' else p_cash_received::text end;
  execute format('select public.create_sale(p_method => %L, p_cash_received => %s, p_items => %L)',
                 p_method, v_cash, p_items::text)
    into v_id;

  insert into sale_request_log (request_id, sale_id) values (p_request_id, v_id);
  if random() < 0.02 then
    delete from sale_request_log where created_at < now() - interval '30 days';
  end if;
  return v_id;
end
$fn$;
grant execute on function public.create_sale_idem(uuid, text, integer, jsonb) to authenticated;

-- ============================================================== 2) Riwayat perubahan data (audit trail)
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  user_email text,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated using (is_admin());
-- tidak ada kebijakan insert/update/delete: log hanya bisa ditulis oleh pemicu di bawah, dan tidak bisa diubah dari aplikasi

create or replace function public.audit_row()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  o jsonb;
  n jsonb;
  ch jsonb := '{}'::jsonb;
  k text;
  rid text;
  mail text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    rid := coalesce(n ->> 'id', n ->> 'day', n ->> 'weekday');
    insert into audit_log (user_email, table_name, row_id, action, new_data) values (mail, tg_table_name, rid, 'INSERT', n);
    return new;
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old);
    n := to_jsonb(new);
    rid := coalesce(n ->> 'id', n ->> 'day', n ->> 'weekday');
    for k in select jsonb_object_keys(n) loop
      if (o -> k) is distinct from (n -> k) and k <> 'updated_at' and k not like 'last\_%' then
        ch := ch || jsonb_build_object(k, jsonb_build_object('dari', o -> k, 'jadi', n -> k));
      end if;
    end loop;
    if ch = '{}'::jsonb then return new; end if; -- tidak ada perubahan berarti
    insert into audit_log (user_email, table_name, row_id, action, changed) values (mail, tg_table_name, rid, 'UPDATE', ch);
    return new;
  else
    o := to_jsonb(old);
    rid := coalesce(o ->> 'id', o ->> 'day', o ->> 'weekday');
    insert into audit_log (user_email, table_name, row_id, action, old_data) values (mail, tg_table_name, rid, 'DELETE', o);
    return old;
  end if;
end
$fn$;

-- Transaksi (sales) tidak diaudit di sini: Riwayat Transaksi sudah mencatat perubahannya sendiri.
-- Pemicu lama (bila pernah terpasang) dilepas supaya proses bayar di Kasir tidak tersentuh.
do $$
begin
  if to_regclass('public.sales') is not null then
    execute 'drop trigger if exists audit_row_trg on public.sales';
  end if;
end $$;

-- Pasang pemicu hanya pada tabel yang memang ada di proyekmu
do $$
declare t text;
begin
  foreach t in array array[
    'products', 'categories', 'suppliers', 'stock_batches', 'stock_adjustments',
    'promo_rules', 'day_overrides', 'store_hours', 'payment_accounts', 'profiles', 'store_settings',
    'packages', 'supplier_payments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_row_trg on public.%I', t);
      execute format('create trigger audit_row_trg after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ============================================================== 1b) Anti-ganda untuk Barang Masuk
create table if not exists public.request_dedup_keys (
  request_id uuid primary key,
  scope text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.request_dedup_keys enable row level security; -- tanpa kebijakan: hanya fungsi di bawah

create or replace function public.add_stock_batches_idem(p_request_id uuid, p_supplier_id bigint, p_items jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;
  if p_request_id is null then raise exception 'Kunci permintaan wajib ada'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 23));
  if exists (select 1 from request_dedup_keys where request_id = p_request_id) then
    return; -- sudah pernah tersimpan: tidak dicatat dua kali
  end if;
  execute format('select public.add_stock_batches(p_supplier_id => %s, p_items => %L)', p_supplier_id, p_items::text);
  insert into request_dedup_keys (request_id, scope) values (p_request_id, 'add_stock_batches');
  if random() < 0.02 then
    delete from request_dedup_keys where created_at < now() - interval '30 days';
  end if;
end
$fn$;
grant execute on function public.add_stock_batches_idem(uuid, bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
