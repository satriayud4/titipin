-- LANGKAH 3: tagihan supplier terkumpul lintas hari (setoran tidak harus tiap hari).
-- Jalankan utuh di SQL Editor.

create or replace function public.supplier_outstanding_days()
 returns table(supplier_id bigint, supplier_name text, tgl date, payable bigint, paid bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  with sold as (
    select b.supplier_id, s.sale_date as tgl, sum(si.qty * si.unit_cost) as amt
    from sale_items si
    join sales s on s.id = si.sale_id
    join stock_batches b on b.id = si.batch_id
    group by b.supplier_id, s.sale_date
  ), rusak as (
    select b.supplier_id, a.adjusted_date as tgl, sum(a.qty * b.cost_price) as amt
    from stock_adjustments a
    join stock_batches b on b.id = a.batch_id
    where a.type = 'rusak' and a.borne_by = 'toko'
    group by b.supplier_id, a.adjusted_date
  ), pay as (
    select st.supplier_id, st.settlement_date as tgl, sum(st.amount_paid) as amt
    from supplier_settlements st
    group by st.supplier_id, st.settlement_date
  ), keys as (
    select supplier_id, tgl from sold
    union select supplier_id, tgl from rusak
    union select supplier_id, tgl from pay
  )
  select k.supplier_id, su.name, k.tgl,
         (coalesce(s.amt, 0) + coalesce(r.amt, 0))::bigint,
         coalesce(p.amt, 0)::bigint
  from keys k
  join suppliers su on su.id = k.supplier_id
  left join sold  s on s.supplier_id = k.supplier_id and s.tgl = k.tgl
  left join rusak r on r.supplier_id = k.supplier_id and r.tgl = k.tgl
  left join pay   p on p.supplier_id = k.supplier_id and p.tgl = k.tgl
  where is_active_user()
    and (coalesce(s.amt, 0) + coalesce(r.amt, 0)) <> coalesce(p.amt, 0)
  order by su.name, k.tgl;
$fn$;

-- Bayar sekaligus: dilunasi dari hari yang paling lama dulu.
create or replace function public.settle_supplier_outstanding(
  p_supplier_id bigint, p_amount integer, p_notes text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  r record;
  v_left integer := p_amount;
  v_pay integer;
  v_days integer := 0;
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Jumlah pembayaran wajib diisi dan harus lebih dari 0';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Supplier tidak ditemukan';
  end if;

  for r in
    select o.tgl, (o.payable - o.paid) as sisa
    from supplier_outstanding_days() o
    where o.supplier_id = p_supplier_id and o.payable - o.paid > 0
    order by o.tgl
  loop
    exit when v_left <= 0;
    v_pay := least(v_left::bigint, r.sisa)::integer;
    insert into supplier_settlements (settlement_date, supplier_id, amount_paid, paid_by, notes)
    values (r.tgl, p_supplier_id, v_pay, auth.uid(), nullif(btrim(coalesce(p_notes, '')), ''));
    v_left := v_left - v_pay;
    v_days := v_days + 1;
  end loop;

  if v_left > 0 then
    raise exception 'Jumlah melebihi tagihan yang belum dibayar (kelebihan %)', v_left;
  end if;
  return v_days;
end
$fn$;
