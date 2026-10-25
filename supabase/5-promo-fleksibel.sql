-- LANGKAH 5: PROMO FLEKSIBEL
--   * diskon persen ATAU nominal (Rp per pcs)
--   * waktu: sampai tanggal expired tiap barang, atau dari jam tertentu sampai jam tertentu
--   * bisa dijadwalkan (mulai nanti), dihentikan kapan saja
-- Jalankan utuh di SQL Editor. Aman dijalankan berulang.
--
-- Tabel & fungsi lama (promo_campaigns, promo_items, promo_start, ...) TIDAK disentuh,
-- jadi riwayat promo lama tetap ada. Hentikan dulu promo lama yang masih berjalan lewat
-- halaman Promo sebelum menjalankan file ini (kalau lupa, tombol "Hentikan" promo lama
-- tetap tersedia di halaman Promo yang baru).

-- ---------------------------------------------------------------- tabel
create table if not exists public.promo_rules (
  id bigint generated always as identity primary key,
  name text not null,
  discount_type text not null check (discount_type in ('percent', 'nominal')),
  discount_value integer not null check (discount_value > 0),
  supplier_share integer not null default 0 check (supplier_share between 0 and 100),
  supplier_note text,
  start_at timestamptz not null default now(),
  end_mode text not null default 'expired' check (end_mode in ('expired', 'at')),
  end_at timestamptz,
  status text not null default 'terjadwal' check (status in ('terjadwal', 'aktif', 'selesai')),
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.promo_rule_items (
  id bigint generated always as identity primary key,
  rule_id bigint not null references public.promo_rules(id) on delete cascade,
  batch_id bigint not null references public.stock_batches(id) on delete cascade,
  original_price integer not null,
  original_cost integer not null,
  promo_price integer not null,
  promo_cost integer not null,
  qty_at_start integer,
  active boolean not null default false,
  applied_at timestamptz,
  ended_at timestamptz
);
create index if not exists promo_rule_items_rule_idx on public.promo_rule_items (rule_id);
create index if not exists promo_rule_items_batch_idx on public.promo_rule_items (batch_id);

alter table public.promo_rules enable row level security;
alter table public.promo_rule_items enable row level security;
drop policy if exists promo_rules_read on public.promo_rules;
create policy promo_rules_read on public.promo_rules for select to authenticated using (is_active_user());
drop policy if exists promo_rule_items_read on public.promo_rule_items;
create policy promo_rule_items_read on public.promo_rule_items for select to authenticated using (is_active_user());

-- ---------------------------------------------------------------- rumus harga
-- Persen: dibulatkan ke Rp100 terdekat dan selalu lebih murah dari harga normal.
-- Nominal: harga normal dikurangi potongan (minimal Rp0).
create or replace function public.promo_calc_price(p_price integer, p_type text, p_value integer)
 returns integer
 language plpgsql
 immutable
as $fn$
declare v integer;
begin
  if p_type = 'nominal' then
    return greatest(p_price - p_value, 0);
  end if;
  v := round(p_price * (100 - p_value) / 10000.0)::integer * 100;
  if v >= p_price then v := p_price - 100; end if;
  return greatest(v, 0);
end
$fn$;

-- Harga setoran ke supplier setelah promo, bila supplier ikut menanggung sebagian potongan.
create or replace function public.promo_calc_cost(p_cost integer, p_price integer, p_promo integer, p_share integer)
 returns integer
 language sql
 immutable
as $fn$
  select greatest(0, p_cost - round((p_price - p_promo) * p_share / 100.0)::integer)
$fn$;

-- ---------------------------------------------------------------- sinkronisasi jadwal
-- Menyalakan promo yang jadwalnya tiba dan mematikan yang waktunya habis (atau barangnya
-- sudah lewat tanggal expired). Aman dipanggil berulang; mengembalikan jumlah perubahan.
create or replace function public.promo_sync()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_changed integer := 0;
  r record;
  i record;
  b stock_batches%rowtype;
  v_pp integer;
  v_pc integer;
  v_qty integer;
begin
  if not exists (select 1 from promo_rules where status in ('terjadwal', 'aktif')) then
    return 0;
  end if;
  if not pg_try_advisory_xact_lock(710101) then
    return 0; -- ada yang sedang menyinkronkan
  end if;

  -- 1) mulai promo yang jadwalnya sudah tiba
  for r in select * from promo_rules where status = 'terjadwal' and start_at <= v_now loop
    if r.end_mode = 'at' and r.end_at <= v_now then
      update promo_rules set status = 'selesai', ended_at = v_now where id = r.id;
      v_changed := v_changed + 1;
      continue;
    end if;

    update promo_rules set status = 'aktif' where id = r.id;
    v_changed := v_changed + 1;

    for i in select id, batch_id from promo_rule_items where rule_id = r.id loop
      select * into b from stock_batches where id = i.batch_id for update;
      if not found or b.sellable_until < v_today then continue; end if;
      if exists (select 1 from promo_rule_items x where x.batch_id = i.batch_id and x.active and x.id <> i.id) then
        continue; -- stok ini sedang ikut promo lain
      end if;

      v_pp := promo_calc_price(b.sell_price, r.discount_type, r.discount_value);
      v_pc := promo_calc_cost(b.cost_price, b.sell_price, v_pp, r.supplier_share);
      select qty_remaining into v_qty from batch_stock where batch_id = b.id;

      update promo_rule_items
         set active = true, applied_at = v_now, qty_at_start = v_qty,
             original_price = b.sell_price, original_cost = b.cost_price,
             promo_price = v_pp, promo_cost = v_pc
       where id = i.id;
      update stock_batches set sell_price = v_pp, cost_price = v_pc where id = b.id;
    end loop;
  end loop;

  -- 2) akhiri promo: waktu habis, atau stok sudah lewat tanggal expired
  for r in select * from promo_rules where status = 'aktif' loop
    for i in select * from promo_rule_items where rule_id = r.id and active loop
      if (r.end_mode = 'at' and r.end_at <= v_now)
         or coalesce((select sellable_until from stock_batches where id = i.batch_id), date '1970-01-01') < v_today then
        -- kembalikan harga, kecuali admin sudah mengubahnya sendiri selama promo
        update stock_batches
           set sell_price = case when sell_price = i.promo_price then i.original_price else sell_price end,
               cost_price = case when cost_price = i.promo_cost then i.original_cost else cost_price end
         where id = i.batch_id;
        update promo_rule_items set active = false, ended_at = v_now where id = i.id;
        v_changed := v_changed + 1;
      end if;
    end loop;
    if not exists (select 1 from promo_rule_items where rule_id = r.id and active) then
      update promo_rules set status = 'selesai', ended_at = v_now where id = r.id;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return v_changed;
end
$fn$;

-- ---------------------------------------------------------------- buat promo
create or replace function public.promo_rule_create(
  p_name text, p_type text, p_value integer, p_supplier_share integer, p_note text,
  p_batch_ids bigint[], p_start_at timestamptz default null,
  p_end_mode text default 'expired', p_end_at timestamptz default null)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_id bigint;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  bid bigint;
  b stock_batches%rowtype;
  v_pname text;
  v_qty integer;
  v_pp integer;
  v_pc integer;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh membuat promo'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Nama promo wajib diisi'; end if;
  if p_type not in ('percent', 'nominal') then raise exception 'Jenis diskon tidak dikenal'; end if;
  if p_type = 'percent' and (p_value is null or p_value < 1 or p_value > 90) then
    raise exception 'Diskon persen harus antara 1 sampai 90';
  end if;
  if p_type = 'nominal' and (p_value is null or p_value < 1) then
    raise exception 'Potongan nominal harus lebih dari 0';
  end if;
  if p_supplier_share is null or p_supplier_share < 0 or p_supplier_share > 100 then
    raise exception 'Bagian supplier harus 0 sampai 100';
  end if;
  if p_batch_ids is null or coalesce(array_length(p_batch_ids, 1), 0) = 0 then
    raise exception 'Pilih minimal satu barang';
  end if;
  if p_end_mode not in ('expired', 'at') then raise exception 'Jenis waktu akhir tidak dikenal'; end if;

  v_start := greatest(coalesce(p_start_at, now()), now());
  if p_end_mode = 'at' then
    if p_end_at is null then raise exception 'Waktu selesai wajib diisi'; end if;
    if p_end_at <= now() then raise exception 'Waktu selesai sudah lewat'; end if;
    if p_end_at <= v_start then raise exception 'Waktu selesai harus setelah waktu mulai'; end if;
    v_end := p_end_at;
  end if;

  insert into promo_rules (name, discount_type, discount_value, supplier_share, supplier_note, start_at, end_mode, end_at, status)
  values (btrim(p_name), p_type, p_value, p_supplier_share, nullif(btrim(coalesce(p_note, '')), ''), v_start, p_end_mode, v_end, 'terjadwal')
  returning id into v_id;

  for bid in select distinct unnest(p_batch_ids) loop
    select * into b from stock_batches where id = bid;
    if not found then raise exception 'Stok tidak ditemukan'; end if;
    select name into v_pname from products where id = b.product_id;
    select qty_remaining into v_qty from batch_stock where batch_id = bid;
    if coalesce(v_qty, 0) <= 0 then raise exception '% sudah habis', v_pname; end if;
    if b.sellable_until < v_today then raise exception '% sudah expired', v_pname; end if;
    if exists (
      select 1 from promo_rule_items x join promo_rules rr on rr.id = x.rule_id
      where x.batch_id = bid and rr.status in ('terjadwal', 'aktif') and rr.id <> v_id
    ) then
      raise exception '% sudah ikut promo lain yang belum selesai', v_pname;
    end if;

    v_pp := promo_calc_price(b.sell_price, p_type, p_value);
    v_pc := promo_calc_cost(b.cost_price, b.sell_price, v_pp, p_supplier_share);
    insert into promo_rule_items (rule_id, batch_id, original_price, original_cost, promo_price, promo_cost, qty_at_start)
    values (v_id, bid, b.sell_price, b.cost_price, v_pp, v_pc, v_qty);
  end loop;

  perform promo_sync(); -- bila mulainya "sekarang", harga langsung berubah
  return v_id;
end
$fn$;

-- ---------------------------------------------------------------- hentikan promo
create or replace function public.promo_rule_stop(p_rule_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  r promo_rules%rowtype;
  i record;
begin
  if not is_admin() then raise exception 'Hanya admin yang boleh menghentikan promo'; end if;
  perform pg_advisory_xact_lock(710101);
  select * into r from promo_rules where id = p_rule_id for update;
  if not found then raise exception 'Promo tidak ditemukan'; end if;
  if r.status = 'selesai' then raise exception 'Promo ini sudah selesai'; end if;

  for i in select * from promo_rule_items where rule_id = r.id and active loop
    update stock_batches
       set sell_price = case when sell_price = i.promo_price then i.original_price else sell_price end,
           cost_price = case when cost_price = i.promo_cost then i.original_cost else cost_price end
     where id = i.batch_id;
    update promo_rule_items set active = false, ended_at = now() where id = i.id;
  end loop;
  update promo_rules set status = 'selesai', ended_at = now() where id = r.id;
end
$fn$;

-- ---------------------------------------------------------------- harga promo yang sedang berlaku (untuk Kasir)
create or replace function public.promo_active_prices()
 returns table(batch_id bigint, original_price integer, discount_type text, discount_value integer, end_mode text, end_at timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select i.batch_id, i.original_price, r.discount_type, r.discount_value, r.end_mode, r.end_at
  from promo_rule_items i
  join promo_rules r on r.id = i.rule_id
  where i.active and r.status = 'aktif' and is_active_user();
$fn$;

-- ---------------------------------------------------------------- daftar promo + hasil penjualan
create or replace function public.promo_rule_list()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select coalesce(jsonb_agg(c.j order by c.ord, c.created_at desc), '[]'::jsonb)
  from (
    select
      case r.status when 'aktif' then 0 when 'terjadwal' then 1 else 2 end as ord,
      r.created_at,
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'discount_type', r.discount_type,
        'discount_value', r.discount_value,
        'discount_percent', case when r.discount_type = 'percent' then r.discount_value else 0 end,
        'supplier_share', r.supplier_share,
        'supplier_note', r.supplier_note,
        'status', r.status,
        'running', r.status = 'aktif',
        'start_at', r.start_at,
        'end_mode', r.end_mode,
        'end_at', r.end_at,
        'started_on', ((coalesce((select min(applied_at) from promo_rule_items where rule_id = r.id), r.start_at)) at time zone 'Asia/Jakarta')::date,
        'ended_on', (r.ended_at at time zone 'Asia/Jakarta')::date,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'batch_id', ri.batch_id,
            'product_name', p.name,
            'supplier_name', su.name,
            'original_price', ri.original_price,
            'promo_price', ri.promo_price,
            'original_cost', ri.original_cost,
            'promo_cost', ri.promo_cost,
            'qty_at_start', ri.qty_at_start,
            'qty_sold', coalesce((
              select sum(si.qty) from sale_items si join sales s on s.id = si.sale_id
              where si.batch_id = ri.batch_id and ri.applied_at is not null
                and s.created_at >= ri.applied_at and (ri.ended_at is null or s.created_at < ri.ended_at)
            ), 0),
            'qty_remaining', coalesce((select bs.qty_remaining from batch_stock bs where bs.batch_id = ri.batch_id), 0),
            'active', ri.active
          ) order by p.name)
          from promo_rule_items ri
          join stock_batches b on b.id = ri.batch_id
          join products p on p.id = b.product_id
          join suppliers su on su.id = b.supplier_id
          where ri.rule_id = r.id
        ), '[]'::jsonb)
      ) as j
    from promo_rules r
    where is_active_user()
    order by 1, r.created_at desc
    limit 100
  ) c;
$fn$;

-- ---------------------------------------------------------------- laporan promo per periode
create or replace function public.promo_rule_report(p_from date, p_to date)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  with x as (
    select r.id, r.name, r.discount_type, r.discount_value, r.supplier_share,
           ((coalesce(min(ri.applied_at), r.start_at)) at time zone 'Asia/Jakarta')::date as started_on,
           sum(si.qty)::bigint as qty,
           sum(si.qty * si.unit_price)::bigint as revenue,
           sum(si.qty * (ri.original_price - si.unit_price))::bigint as discount,
           sum(si.qty * (ri.original_cost - si.unit_cost))::bigint as supplier_absorb
    from promo_rules r
    join promo_rule_items ri on ri.rule_id = r.id and ri.applied_at is not null
    join sale_items si on si.batch_id = ri.batch_id
    join sales s on s.id = si.sale_id
      and s.created_at >= ri.applied_at and (ri.ended_at is null or s.created_at < ri.ended_at)
    where s.sale_date between p_from and p_to and is_active_user()
    group by r.id
  ), rr as (
    select id, name, discount_type, discount_value,
           case when discount_type = 'percent' then discount_value else 0 end as discount_percent,
           supplier_share, started_on, qty, revenue, discount, supplier_absorb,
           (discount - supplier_absorb) as store_absorb
    from x
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'campaigns', (select count(*) from rr),
      'qty', coalesce((select sum(qty) from rr), 0),
      'revenue', coalesce((select sum(revenue) from rr), 0),
      'discount', coalesce((select sum(discount) from rr), 0),
      'supplier_absorb', coalesce((select sum(supplier_absorb) from rr), 0),
      'store_absorb', coalesce((select sum(store_absorb) from rr), 0)
    ),
    'rows', coalesce((select jsonb_agg(to_jsonb(rr) order by started_on desc, id desc) from rr), '[]'::jsonb)
  );
$fn$;

-- ---------------------------------------------------------------- catatan promo di rincian setoran supplier
create or replace function public.promo_rule_notes(p_date date, p_supplier_id bigint)
 returns table(
   campaign_id bigint, campaign_name text, supplier_note text,
   discount_type text, discount_value integer, discount_percent integer, supplier_share integer,
   start_at timestamptz, end_mode text, end_at timestamptz,
   product_name text, qty bigint,
   original_price integer, promo_price integer, original_cost integer, promo_cost integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select r.id, r.name, r.supplier_note,
         r.discount_type, r.discount_value,
         case when r.discount_type = 'percent' then r.discount_value else 0 end,
         r.supplier_share, r.start_at, r.end_mode, r.end_at,
         p.name, sum(si.qty)::bigint,
         ri.original_price, ri.promo_price, ri.original_cost, ri.promo_cost
  from promo_rules r
  join promo_rule_items ri on ri.rule_id = r.id and ri.applied_at is not null
  join stock_batches b on b.id = ri.batch_id and b.supplier_id = p_supplier_id
  join products p on p.id = b.product_id
  join sale_items si on si.batch_id = ri.batch_id
  join sales s on s.id = si.sale_id
    and s.created_at >= ri.applied_at and (ri.ended_at is null or s.created_at < ri.ended_at)
  where s.sale_date = p_date and is_active_user()
  group by r.id, p.name, ri.id
  order by r.id, p.name;
$fn$;

-- ---------------------------------------------------------------- izin
grant execute on function public.promo_calc_price(integer, text, integer) to authenticated;
grant execute on function public.promo_calc_cost(integer, integer, integer, integer) to authenticated;
grant execute on function public.promo_sync() to authenticated;
grant execute on function public.promo_rule_create(text, text, integer, integer, text, bigint[], timestamptz, text, timestamptz) to authenticated;
grant execute on function public.promo_rule_stop(bigint) to authenticated;
grant execute on function public.promo_active_prices() to authenticated;
grant execute on function public.promo_rule_list() to authenticated;
grant execute on function public.promo_rule_report(date, date) to authenticated;
grant execute on function public.promo_rule_notes(date, bigint) to authenticated;

-- ---------------------------------------------------------------- (opsional) jalankan sinkronisasi tiap menit
-- Tanpa ini, jadwal tetap berjalan: aplikasi (Kasir dan halaman Promo) menyinkronkan sendiri
-- tiap 30 detik saat dibuka. Dengan pg_cron, promo mulai/berhenti tepat waktu walau tidak ada
-- yang membuka aplikasi. Bagian ini diabaikan otomatis bila pg_cron tidak tersedia.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('promo_sync', '* * * * *', 'select public.promo_sync()');
    exception when others then
      raise notice 'pg_cron tidak diaktifkan (%). Jadwal promo tetap berjalan lewat aplikasi.', sqlerrm;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
