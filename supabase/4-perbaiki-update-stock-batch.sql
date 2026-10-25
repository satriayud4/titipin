-- PERBAIKAN: "Could not find the function public.update_stock_batch(p_batch_id, p_cost_price,
-- p_expired_date, p_qty_in, p_sell_price, p_supplier_id) in the schema cache"
-- Artinya di database belum ada fungsi dengan 6 parameter itu (langkah 2 belum terpasang
-- atau gagal di tengah) atau cache PostgREST belum dimuat ulang.
-- Jalankan utuh di SQL Editor. Aman dijalankan berulang.

-- Prasyarat (aman kalau sudah ada)
alter table public.stock_batches add column if not exists expired_date date;

-- Hapus semua versi lama update_stock_batch supaya tidak ada yang bentrok
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'update_stock_batch'
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function public.update_stock_batch(
  p_batch_id bigint, p_supplier_id bigint, p_qty_in integer,
  p_cost_price integer, p_sell_price integer, p_expired_date date default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  b stock_batches%rowtype;
  v_sold integer;
  v_adj integer;
  v_exp date;
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;

  select * into b from stock_batches where id = p_batch_id for update;
  if not found then raise exception 'Data stok tidak ditemukan'; end if;

  if p_qty_in is null or p_qty_in <= 0 then raise exception 'Jumlah stok wajib diisi dan harus lebih dari 0'; end if;
  if p_cost_price is null or p_cost_price < 0 then raise exception 'Harga supplier wajib diisi'; end if;
  if p_sell_price is null or p_sell_price < 0 then raise exception 'Harga jual wajib diisi'; end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Supplier wajib dipilih';
  end if;
  if p_supplier_id <> b.supplier_id then
    raise exception 'Supplier tidak bisa diubah. Hapus stok ini lalu catat ulang di supplier yang benar.';
  end if;

  v_exp := coalesce(p_expired_date, b.expired_date, b.sellable_until);
  if v_exp < b.received_date then
    raise exception 'Tanggal expired tidak boleh sebelum tanggal masuk';
  end if;

  select coalesce(sum(qty), 0) into v_sold from sale_items where batch_id = b.id;
  select coalesce(sum(qty), 0) into v_adj  from stock_adjustments where batch_id = b.id;

  if v_sold + v_adj > 0 then
    if not is_admin() then
      raise exception 'Stok ini sudah ada penjualan, retur, atau barang rusak. Hanya admin yang boleh mengubahnya.';
    end if;
    if p_cost_price <> b.cost_price then
      raise exception 'Harga supplier tidak bisa diubah karena stok sudah terpakai';
    end if;
  end if;

  if p_qty_in < v_sold + v_adj then
    raise exception 'Jumlah stok tidak boleh kurang dari yang sudah terpakai (%)', v_sold + v_adj;
  end if;

  insert into stock_batch_edits (batch_id, action, old_values, new_values, edited_by)
  values (
    b.id, 'ubah',
    jsonb_build_object('supplier_id', b.supplier_id, 'qty_in', b.qty_in, 'cost_price', b.cost_price,
                       'sell_price', b.sell_price, 'expired_date', coalesce(b.expired_date, b.sellable_until)),
    jsonb_build_object('supplier_id', p_supplier_id, 'qty_in', p_qty_in, 'cost_price', p_cost_price,
                       'sell_price', p_sell_price, 'expired_date', v_exp),
    auth.uid()
  );

  update stock_batches
  set qty_in = p_qty_in,
      cost_price = p_cost_price,
      sell_price = p_sell_price,
      sellable_until = v_exp,
      expired_date = v_exp,
      return_due_date = v_exp
  where id = b.id;
end
$fn$;

grant execute on function public.update_stock_batch(bigint, bigint, integer, integer, integer, date) to authenticated;

-- Muat ulang cache schema PostgREST (ini yang membuat error "schema cache" hilang)
notify pgrst, 'reload schema';

-- Cek: harus keluar 1 baris dengan 6 parameter
select p.oid::regprocedure from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'update_stock_batch';
