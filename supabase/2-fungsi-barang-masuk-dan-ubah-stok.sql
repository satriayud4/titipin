-- LANGKAH 2: add_stock_batches (expired wajib) dan update_stock_batch (bisa ubah expired).
-- Jalankan utuh di SQL Editor SETELAH langkah 1.

create or replace function public.add_stock_batches(p_supplier_id bigint, p_items jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  it jsonb;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_name text; v_cat text; v_img text; v_unit text;
  v_qty integer; v_cost integer; v_sell integer;
  v_exp date; v_active boolean;
  v_cat_id bigint; v_prod_id bigint; v_prod_img text;
  v_count integer := 0;
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;
  if p_supplier_id is null
     or not exists (select 1 from suppliers where id = p_supplier_id and is_active) then
    raise exception 'Supplier wajib dipilih';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada item';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_name   := btrim(coalesce(it->>'name', ''));
    v_cat    := btrim(coalesce(it->>'category', ''));
    v_unit   := coalesce(nullif(btrim(coalesce(it->>'unit', '')), ''), 'pcs');
    v_img    := nullif(btrim(coalesce(it->>'image_path', '')), '');
    v_qty    := (it->>'qty')::integer;
    v_cost   := (it->>'cost_price')::integer;
    v_sell   := (it->>'sell_price')::integer;
    v_exp    := nullif(it->>'expired_date', '')::date;
    v_active := coalesce((it->>'is_active')::boolean, true);

    if v_name = '' then raise exception 'Nama produk wajib diisi'; end if;
    if v_cat = '' then raise exception 'Kategori % wajib diisi', v_name; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Stok % wajib diisi dan harus lebih dari 0', v_name; end if;
    if v_cost is null or v_cost < 0 then raise exception 'Harga supplier % wajib diisi', v_name; end if;
    if v_sell is null or v_sell < 0 then raise exception 'Harga jual % wajib diisi', v_name; end if;
    if v_exp is null then raise exception 'Tanggal expired % wajib diisi', v_name; end if;
    if v_exp < v_today then raise exception 'Tanggal expired % sudah lewat', v_name; end if;

    select id into v_cat_id from categories where lower(name) = lower(v_cat);
    if v_cat_id is null then
      insert into categories (name) values (v_cat) returning id into v_cat_id;
    end if;

    select id, image_path into v_prod_id, v_prod_img
    from products
    where supplier_id = p_supplier_id and lower(name) = lower(v_name);

    if v_prod_id is null then
      if v_img is null then raise exception 'Gambar % wajib diunggah', v_name; end if;
      insert into products (name, category_id, unit, is_active, image_path, supplier_id)
      values (v_name, v_cat_id, v_unit, v_active, v_img, p_supplier_id)
      returning id into v_prod_id;
    else
      if v_img is null and v_prod_img is null then
        raise exception 'Gambar % wajib diunggah', v_name;
      end if;
      update products
      set is_active   = v_active,
          category_id = v_cat_id,
          unit        = v_unit,
          image_path  = coalesce(v_img, image_path)
      where id = v_prod_id;
    end if;

    insert into stock_batches
      (received_date, supplier_id, product_id, qty_in, cost_price, sell_price,
       sellable_until, expired_date, created_by)
    values
      (v_today, p_supplier_id, v_prod_id, v_qty, v_cost, v_sell,
       v_exp, v_exp, auth.uid());
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$fn$;

-- update_stock_batch: tambah parameter expired; supplier tidak boleh dipindah
-- (barang dimiliki supplier, jadi pindah supplier = hapus lalu catat ulang).
drop function if exists public.update_stock_batch(bigint, bigint, integer, integer, integer);

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
      return_due_date = case when v_exp is distinct from b.sellable_until then v_exp else return_due_date end
  where id = b.id;
end
$fn$;
