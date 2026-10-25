-- LANGKAH 6: transaksi tidak bisa tersimpan dua kali + batas nominal di database.
-- Jalankan utuh di SQL Editor. Tidak mengubah fungsi create_sale yang sudah ada;
-- fungsi baru create_sale_once hanya "membungkusnya".

create table if not exists public.sale_requests (
  client_key uuid primary key,
  cashier_id uuid not null default auth.uid(),
  sale_id bigint,
  created_at timestamptz not null default now()
);
alter table public.sale_requests enable row level security;
-- sengaja tanpa policy: tabel hanya disentuh oleh fungsi di bawah (security definer)

create or replace function public.create_sale_once(
  p_client_key uuid,
  p_method payment_method,
  p_cash_received integer,
  p_items jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  v_sale bigint;
  v_rows integer;
  it jsonb;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_active) then
    raise exception 'Akun tidak aktif';
  end if;
  if p_client_key is null then raise exception 'Kunci transaksi wajib ada'; end if;

  -- batas nominal wajar
  if p_cash_received is not null and p_cash_received > 100000000 then
    raise exception 'Uang diterima terlalu besar. Periksa angka yang diketik.';
  end if;
  if p_items is not null then
    for it in select * from jsonb_array_elements(p_items) loop
      if coalesce((it->>'qty')::integer, 0) > 10000 then
        raise exception 'Jumlah barang terlalu besar. Periksa angka yang diketik.';
      end if;
    end loop;
  end if;

  -- klaim kunci; bila kunci yang sama sedang diproses permintaan lain, insert ini menunggu hasilnya
  insert into sale_requests (client_key, cashier_id) values (p_client_key, auth.uid())
  on conflict (client_key) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- sudah pernah diproses: kembalikan transaksi yang sama, jangan buat baru
    select sale_id into v_sale from sale_requests
    where client_key = p_client_key and cashier_id = auth.uid();
    if v_sale is null then raise exception 'Transaksi dengan kunci ini tidak ditemukan'; end if;
    return v_sale;
  end if;

  v_sale := create_sale(p_method, p_cash_received, p_items);
  update sale_requests set sale_id = v_sale where client_key = p_client_key;
  return v_sale;
end
$fn$;

grant execute on function public.create_sale_once(uuid, payment_method, integer, jsonb) to authenticated;
