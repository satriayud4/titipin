-- LANGKAH 8: DATA TERSTRUKTUR UNTUK ASISTEN AI
-- Jalankan utuh di SQL Editor. Aman dijalankan berulang.
--
-- Semua angka yang dibaca AI dihitung di sini (database), bukan oleh AI, supaya valid.
-- AI hanya menjelaskan hasilnya. Fungsi hanya membaca (stable), tidak mengubah data apa pun,
-- dan hanya bisa dipakai pengguna aktif (is_active_user), sama seperti laporan lain.
--
-- Asumsi nama kolom (diambil dari fungsi SQL 1-7 yang sudah ada):
--   sales(id, sale_date, created_at, payment_method)
--   sale_items(sale_id, batch_id, qty, unit_price, unit_cost)
--   stock_batches(id, received_date, supplier_id, product_id, qty_in, cost_price, sell_price, sellable_until)
--   stock_adjustments(batch_id, qty, type, borne_by, adjusted_date)
--   batch_stock(batch_id, supplier_id, product_id, qty_remaining, received_date, sellable_until, return_due_date)
-- Cara memeriksanya ada di bagian paling bawah file ini.

-- Transaksi yang sah (tidak dibatalkan). Memakai to_jsonb agar tidak error
-- bila nama kolom pembatalan di tabel sales berbeda dari dugaan.
create or replace function public.ai_valid_sales(p_from date, p_to date)
 returns table(id bigint, sale_date date, created_at timestamptz, payment_method text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $fn$
  select s.id, s.sale_date, s.created_at, (to_jsonb(s) ->> 'payment_method')
  from sales s
  where s.sale_date between p_from and p_to
    and coalesce(to_jsonb(s) ->> 'void_at', '') = ''
    and coalesce(to_jsonb(s) ->> 'voided', 'false') <> 'true'
    and coalesce(to_jsonb(s) ->> 'status', 'selesai') <> 'dibatalkan'
$fn$;

create or replace function public.ai_data(p_topic text, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $fn$
declare
  v_days integer;
  v_pf   date;  -- awal periode pembanding (selama sama panjang, tepat sebelum periode ini)
  v_pt   date;  -- akhir periode pembanding
  v_hari text[] := array['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
begin
  if not is_active_user() then raise exception 'Akun tidak aktif'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periode tidak valid'; end if;
  if p_to - p_from > 92 then raise exception 'Periode maksimal 93 hari'; end if;

  v_days := (p_to - p_from) + 1;
  v_pt := p_from - 1;
  v_pf := p_from - v_days;

  -- ------------------------------------------------------------ ringkasan harian
  if p_topic = 'ringkasan' then
    return (
      with days as (
        select d::date as d from generate_series(p_from, p_to, interval '1 day') d
      ), sold as (
        select s.sale_date as d, count(distinct s.id) as trx, coalesce(sum(si.qty), 0) as items,
               coalesce(sum(si.qty * si.unit_price), 0) as omzet,
               coalesce(sum(si.qty * si.unit_cost), 0) as cogs
        from ai_valid_sales(p_from, p_to) s
        join sale_items si on si.sale_id = s.id
        group by s.sale_date
      ), rusak as (
        select a.adjusted_date as d, sum(a.qty * b.cost_price) as cost
        from stock_adjustments a
        join stock_batches b on b.id = a.batch_id
        where a.type = 'rusak' and a.borne_by = 'toko' and a.adjusted_date between p_from and p_to
        group by a.adjusted_date
      ), harian as (
        select days.d,
               v_hari[extract(isodow from days.d)::int] as hari,
               coalesce(sold.trx, 0) as trx, coalesce(sold.items, 0) as items,
               coalesce(sold.omzet, 0) as omzet, coalesce(sold.cogs, 0) as cogs,
               coalesce(rusak.cost, 0) as rusak,
               coalesce(
                 (select o.is_closed from day_overrides o where o.day = days.d),
                 (select not h.is_open from store_hours h where h.weekday = extract(dow from days.d)::int),
                 false
               ) as tutup
        from days
        left join sold  on sold.d = days.d
        left join rusak on rusak.d = days.d
      )
      select jsonb_build_object(
        'periode', jsonb_build_object('dari', p_from, 'sampai', p_to, 'jumlah_hari', v_days),
        'total', jsonb_build_object(
          'omzet', coalesce(sum(omzet), 0),
          'transaksi', coalesce(sum(trx), 0),
          'barang_terjual', coalesce(sum(items), 0),
          'modal_barang_terjual', coalesce(sum(cogs), 0),
          'rugi_barang_rusak', coalesce(sum(rusak), 0),
          'laba_estimasi', coalesce(sum(omzet - cogs - rusak), 0),
          'hari_buka', count(*) filter (where not tutup),
          'hari_tutup', count(*) filter (where tutup)
        ),
        'pembayaran', (
          select coalesce(jsonb_object_agg(m, jsonb_build_object('transaksi', n, 'omzet', o)), '{}'::jsonb)
          from (
            select coalesce(s.payment_method, '-') as m, count(distinct s.id) as n,
                   sum(si.qty * si.unit_price) as o
            from ai_valid_sales(p_from, p_to) s
            join sale_items si on si.sale_id = s.id
            group by 1
          ) p
        ),
        'harian', coalesce(jsonb_agg(jsonb_build_object(
          'tanggal', d, 'hari', hari, 'tutup', tutup, 'transaksi', trx, 'barang', items,
          'omzet', omzet, 'modal', cogs, 'rugi_rusak', rusak, 'laba', omzet - cogs - rusak
        ) order by d), '[]'::jsonb)
      )
      from harian
    );
  end if;

  -- ------------------------------------------------------------ produk: terlaris, terlambat, menurun
  if p_topic = 'produk' then
    return (
      with cur as (
        select b.product_id, sum(si.qty) as qty, sum(si.qty * si.unit_price) as omzet,
               sum(si.qty * (si.unit_price - si.unit_cost)) as laba
        from ai_valid_sales(p_from, p_to) s
        join sale_items si on si.sale_id = s.id
        join stock_batches b on b.id = si.batch_id
        group by b.product_id
      ), prev as (
        select b.product_id, sum(si.qty) as qty, sum(si.qty * si.unit_price) as omzet
        from ai_valid_sales(v_pf, v_pt) s
        join sale_items si on si.sale_id = s.id
        join stock_batches b on b.id = si.batch_id
        group by b.product_id
      ), stok as (
        select product_id, sum(qty_remaining) as sisa
        from batch_stock where qty_remaining > 0 group by product_id
      ), allp as (
        select p.id, p.name, su.name as supplier,
               coalesce(cur.qty, 0) as qty, coalesce(cur.omzet, 0) as omzet, coalesce(cur.laba, 0) as laba,
               coalesce(prev.qty, 0) as qty_sebelumnya, coalesce(prev.omzet, 0) as omzet_sebelumnya,
               coalesce(stok.sisa, 0) as stok_sisa
        from products p
        left join suppliers su on su.id = p.supplier_id
        left join cur  on cur.product_id = p.id
        left join prev on prev.product_id = p.id
        left join stok on stok.product_id = p.id
        where cur.product_id is not null or prev.product_id is not null or stok.product_id is not null
      )
      select jsonb_build_object(
        'periode', jsonb_build_object('dari', p_from, 'sampai', p_to),
        'periode_pembanding', jsonb_build_object('dari', v_pf, 'sampai', v_pt),
        'terlaris', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select name as produk, supplier, qty, omzet, laba, qty_sebelumnya, stok_sisa
          from allp where qty > 0 order by qty desc, omzet desc limit 10) t), '[]'::jsonb),
        'paling_lambat', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select name as produk, supplier, qty, omzet, laba, qty_sebelumnya, stok_sisa
          from allp where qty > 0 order by qty asc, omzet asc limit 10) t), '[]'::jsonb),
        'ada_stok_tapi_tidak_terjual', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select name as produk, supplier, stok_sisa, qty_sebelumnya
          from allp where qty = 0 and stok_sisa > 0 order by stok_sisa desc limit 15) t), '[]'::jsonb),
        'menurun', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select name as produk, supplier, qty, qty_sebelumnya,
                 (qty - qty_sebelumnya) as selisih_qty,
                 round(((qty - qty_sebelumnya)::numeric / qty_sebelumnya) * 100) as persen,
                 omzet, omzet_sebelumnya
          from allp where qty_sebelumnya > 0 and qty < qty_sebelumnya
          order by (qty - qty_sebelumnya) asc limit 10) t), '[]'::jsonb),
        'naik', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select name as produk, supplier, qty, qty_sebelumnya, (qty - qty_sebelumnya) as selisih_qty
          from allp where qty > qty_sebelumnya
          order by (qty - qty_sebelumnya) desc limit 5) t), '[]'::jsonb)
      )
    );
  end if;

  -- ------------------------------------------------------------ hari dan jam tersibuk (WIB)
  if p_topic = 'waktu' then
    return (
      with tx as (
        select s.id, s.sale_date,
               extract(isodow from s.sale_date)::int as dow,
               extract(hour from s.created_at at time zone 'Asia/Jakarta')::int as jam,
               sum(si.qty * si.unit_price) as omzet
        from ai_valid_sales(p_from, p_to) s
        join sale_items si on si.sale_id = s.id
        group by s.id, s.sale_date, s.created_at
      )
      select jsonb_build_object(
        'periode', jsonb_build_object('dari', p_from, 'sampai', p_to),
        'per_hari', coalesce((select jsonb_agg(jsonb_build_object(
            'hari', v_hari[dow], 'transaksi', n, 'omzet', o, 'jumlah_tanggal', tgl,
            'rata_omzet_per_tanggal', round(o::numeric / greatest(tgl, 1))) order by dow)
          from (select dow, count(*) n, sum(omzet) o, count(distinct sale_date) tgl from tx group by dow) a), '[]'::jsonb),
        'per_jam', coalesce((select jsonb_agg(jsonb_build_object(
            'jam', lpad(jam::text, 2, '0') || ':00', 'transaksi', n, 'omzet', o) order by jam)
          from (select jam, count(*) n, sum(omzet) o from tx group by jam) a), '[]'::jsonb),
        'kombinasi_tertinggi', coalesce((select jsonb_agg(jsonb_build_object(
            'hari', v_hari[dow], 'jam', lpad(jam::text, 2, '0') || ':00', 'transaksi', n, 'omzet', o))
          from (select dow, jam, count(*) n, sum(omzet) o from tx group by dow, jam order by o desc limit 5) a), '[]'::jsonb)
      )
    );
  end if;

  -- ------------------------------------------------------------ banding periode ini vs periode sebelumnya (faktor laba)
  if p_topic = 'banding' then
    return (
      with agg as (
        select 'ini'::text as p, count(distinct s.id) as trx, coalesce(sum(si.qty), 0) as items,
               coalesce(sum(si.qty * si.unit_price), 0) as omzet,
               coalesce(sum(si.qty * si.unit_cost), 0) as cogs,
               coalesce(sum(si.qty * greatest(b.sell_price - si.unit_price, 0)), 0) as diskon
        from ai_valid_sales(p_from, p_to) s
        join sale_items si on si.sale_id = s.id
        join stock_batches b on b.id = si.batch_id
        union all
        select 'lalu', count(distinct s.id), coalesce(sum(si.qty), 0),
               coalesce(sum(si.qty * si.unit_price), 0), coalesce(sum(si.qty * si.unit_cost), 0),
               coalesce(sum(si.qty * greatest(b.sell_price - si.unit_price, 0)), 0)
        from ai_valid_sales(v_pf, v_pt) s
        join sale_items si on si.sale_id = s.id
        join stock_batches b on b.id = si.batch_id
      ), rusak as (
        select 'ini'::text as p, coalesce(sum(a.qty * b.cost_price), 0) as cost, coalesce(sum(a.qty), 0) as qty
        from stock_adjustments a join stock_batches b on b.id = a.batch_id
        where a.type = 'rusak' and a.borne_by = 'toko' and a.adjusted_date between p_from and p_to
        union all
        select 'lalu', coalesce(sum(a.qty * b.cost_price), 0), coalesce(sum(a.qty), 0)
        from stock_adjustments a join stock_batches b on b.id = a.batch_id
        where a.type = 'rusak' and a.borne_by = 'toko' and a.adjusted_date between v_pf and v_pt
      ), ringkas as (
        select a.p, a.trx, a.items, a.omzet, a.cogs, a.diskon, r.cost as rugi_rusak, r.qty as rusak_qty,
               a.omzet - a.cogs - r.cost as laba,
               case when a.trx > 0 then round(a.omzet::numeric / a.trx) else 0 end as rata_belanja,
               case when a.omzet > 0 then round(((a.omzet - a.cogs - r.cost)::numeric / a.omzet) * 100, 1) else 0 end as margin_persen
        from agg a join rusak r on r.p = a.p
      ), perproduk as (
        select p.name as produk,
               sum(si.qty * (si.unit_price - si.unit_cost)) filter (where s.sale_date between p_from and p_to) as laba_ini,
               sum(si.qty * (si.unit_price - si.unit_cost)) filter (where s.sale_date between v_pf and v_pt) as laba_lalu,
               sum(si.qty) filter (where s.sale_date between p_from and p_to) as qty_ini,
               sum(si.qty) filter (where s.sale_date between v_pf and v_pt) as qty_lalu
        from ai_valid_sales(v_pf, p_to) s
        join sale_items si on si.sale_id = s.id
        join stock_batches b on b.id = si.batch_id
        join products p on p.id = b.product_id
        group by p.name
      )
      select jsonb_build_object(
        'periode_ini', jsonb_build_object('dari', p_from, 'sampai', p_to),
        'periode_sebelumnya', jsonb_build_object('dari', v_pf, 'sampai', v_pt),
        'ini', (select to_jsonb(r) - 'p' from ringkas r where p = 'ini'),
        'sebelumnya', (select to_jsonb(r) - 'p' from ringkas r where p = 'lalu'),
        'produk_penekan_laba', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, coalesce(laba_ini, 0) as laba_ini, coalesce(laba_lalu, 0) as laba_lalu,
                 coalesce(qty_ini, 0) as qty_ini, coalesce(qty_lalu, 0) as qty_lalu,
                 coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) as selisih_laba
          from perproduk where coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) < 0
          order by coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) asc limit 5) t), '[]'::jsonb),
        'produk_pendorong_laba', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, coalesce(laba_ini, 0) as laba_ini, coalesce(laba_lalu, 0) as laba_lalu,
                 coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) as selisih_laba
          from perproduk where coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) > 0
          order by coalesce(laba_ini, 0) - coalesce(laba_lalu, 0) desc limit 5) t), '[]'::jsonb)
      )
    );
  end if;

  -- ------------------------------------------------------------ konsinyasi: terjual, retur, sisa per supplier dan produk
  -- Dihitung dari batch yang MASUK pada periode ini.
  if p_topic = 'konsinyasi' then
    return (
      with bt as (
        select b.id, b.supplier_id, b.product_id, b.qty_in, b.cost_price, b.sellable_until, b.received_date,
               (b.sellable_until < (now() at time zone 'Asia/Jakarta')::date) as selesai,
               coalesce((select sum(si.qty) from sale_items si
                           join ai_valid_sales(b.received_date, current_date + 1) s on s.id = si.sale_id
                         where si.batch_id = b.id), 0) as terjual,
               coalesce((select sum(a.qty) from stock_adjustments a where a.batch_id = b.id and a.type = 'retur'), 0) as retur,
               coalesce((select sum(a.qty) from stock_adjustments a where a.batch_id = b.id and a.type = 'rusak'), 0) as rusak,
               coalesce((select sum(a.qty) from stock_adjustments a where a.batch_id = b.id and a.type not in ('retur', 'rusak')), 0) as lainnya,
               coalesce((select bs.qty_remaining from batch_stock bs where bs.batch_id = b.id), 0) as sisa
        from stock_batches b
        where b.received_date between p_from and p_to
      ), perprod as (
        select p.name as produk, su.name as supplier, count(*) as jumlah_batch,
               sum(bt.qty_in) as dititip, sum(bt.terjual) as terjual, sum(bt.retur) as retur,
               sum(bt.rusak) as rusak, sum(bt.sisa) as sisa_sekarang,
               round(sum(bt.terjual)::numeric * 100 / nullif(sum(bt.qty_in), 0), 1) as persen_terjual,
               round(avg(bt.qty_in), 1) as rata_titip_per_batch,
               round(avg(bt.terjual), 1) as rata_terjual_per_batch,
               round(avg(bt.qty_in - bt.terjual), 1) as rata_sisa_per_batch,
               count(*) filter (where bt.selesai) as batch_selesai,
               round(sum(bt.terjual) filter (where bt.selesai)::numeric * 100 / nullif(sum(bt.qty_in) filter (where bt.selesai), 0), 1) as persen_terjual_batch_selesai,
               round(avg(bt.qty_in) filter (where bt.selesai), 1) as rata_titip_batch_selesai,
               round(avg(bt.terjual) filter (where bt.selesai), 1) as rata_terjual_batch_selesai,
               round(avg(bt.qty_in - bt.terjual) filter (where bt.selesai), 1) as rata_sisa_batch_selesai,
               count(*) filter (where bt.selesai and bt.terjual >= bt.qty_in - bt.rusak - bt.retur) as batch_habis_terjual,
               count(*) filter (where bt.selesai and bt.terjual < bt.qty_in) as batch_menyisakan_stok
        from bt
        join products p on p.id = bt.product_id
        join suppliers su on su.id = bt.supplier_id
        group by p.name, su.name
      ), persup as (
        select su.name as supplier, count(distinct bt.product_id) as jumlah_produk, count(*) as jumlah_batch,
               sum(bt.qty_in) as dititip, sum(bt.terjual) as terjual, sum(bt.retur) as retur,
               sum(bt.rusak) as rusak, sum(bt.sisa) as sisa_sekarang,
               round(sum(bt.terjual)::numeric * 100 / nullif(sum(bt.qty_in), 0), 1) as persen_terjual,
               round(sum(bt.retur)::numeric * 100 / nullif(sum(bt.qty_in), 0), 1) as persen_retur,
               count(*) filter (where bt.selesai) as batch_selesai,
               round(sum(bt.terjual) filter (where bt.selesai)::numeric * 100 / nullif(sum(bt.qty_in) filter (where bt.selesai), 0), 1) as persen_terjual_batch_selesai,
               sum(bt.terjual * bt.cost_price) as nilai_terjual_modal,
               sum(bt.sisa * bt.cost_price) as nilai_sisa_modal
        from bt join suppliers su on su.id = bt.supplier_id
        group by su.name
      )
      select jsonb_build_object(
        'periode_barang_masuk', jsonb_build_object('dari', p_from, 'sampai', p_to),
        'catatan', 'Dihitung dari batch yang masuk pada periode ini. Sisa_sekarang = stok yang belum terjual dan belum diretur. Batch yang masih dalam masa jual (belum lewat expired) BELUM final, jadi persen_terjual-nya masih bisa naik; nilai final ada di kolom *_batch_selesai.',
        'total', (select jsonb_build_object('dititip', coalesce(sum(qty_in), 0), 'terjual', coalesce(sum(terjual), 0),
                    'retur', coalesce(sum(retur), 0), 'rusak', coalesce(sum(rusak), 0), 'sisa_sekarang', coalesce(sum(sisa), 0),
                    'persen_terjual', round(coalesce(sum(terjual), 0)::numeric * 100 / nullif(sum(qty_in), 0), 1)) from bt),
        'supplier', coalesce((select jsonb_agg(to_jsonb(x) order by x.persen_terjual desc nulls last) from persup x), '[]'::jsonb),
        'retur_tertinggi', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, dititip, terjual, retur, rusak, persen_terjual
          from perprod where retur > 0 order by retur desc limit 10) t), '[]'::jsonb),
        'sering_menyisakan_stok', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, batch_selesai, batch_menyisakan_stok, rata_titip_batch_selesai,
                 rata_terjual_batch_selesai, rata_sisa_batch_selesai, persen_terjual_batch_selesai, sisa_sekarang
          from perprod where batch_menyisakan_stok > 0
          order by batch_menyisakan_stok desc, persen_terjual_batch_selesai asc nulls first limit 10) t), '[]'::jsonb),
        'untuk_saran_jumlah_titipan', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, jumlah_batch, batch_selesai, rata_titip_batch_selesai, rata_terjual_batch_selesai,
                 rata_sisa_batch_selesai, persen_terjual_batch_selesai, batch_habis_terjual
          from perprod where batch_selesai >= 1 order by persen_terjual_batch_selesai asc nulls first limit 20) t), '[]'::jsonb)
      )
    );
  end if;

  -- ------------------------------------------------------------ kondisi stok saat ini (tidak memakai periode)
  if p_topic = 'stok' then
    return (
      with st as (
        select bs.batch_id, p.name as produk, su.name as supplier, bs.qty_remaining as sisa,
               bs.sellable_until, bs.return_due_date, b.cost_price,
               (bs.sellable_until - (now() at time zone 'Asia/Jakarta')::date) as sisa_hari
        from batch_stock bs
        join stock_batches b on b.id = bs.batch_id
        join products p on p.id = bs.product_id
        join suppliers su on su.id = bs.supplier_id
        where bs.qty_remaining > 0
      ), per_prod as (
        select produk, supplier, sum(sisa) as sisa from st where sisa_hari >= 0 group by produk, supplier
      )
      select jsonb_build_object(
        'tanggal', (now() at time zone 'Asia/Jakarta')::date,
        'jenis_produk_siap_dijual', (select count(*) from per_prod),
        'menipis_3_atau_kurang', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, sisa from per_prod where sisa <= 3 order by sisa, produk limit 20) t), '[]'::jsonb),
        'segera_expired_0_sampai_2_hari', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, sisa, sellable_until as expired, sisa_hari
          from st where sisa_hari between 0 and 2 order by sellable_until, produk limit 20) t), '[]'::jsonb),
        'sudah_lewat_expired_belum_diretur', coalesce((select jsonb_agg(to_jsonb(t)) from (
          select produk, supplier, sisa, sellable_until as expired, (-sisa_hari) as lewat_hari
          from st where sisa_hari < 0 order by sellable_until limit 20) t), '[]'::jsonb),
        'nilai_stok_siap_dijual_modal', coalesce((select sum(sisa * cost_price) from st where sisa_hari >= 0), 0)
      )
    );
  end if;

  -- ------------------------------------------------------------ setoran supplier yang tertunda (tidak memakai periode)
  if p_topic = 'setoran' then
    return (
      with o as (
        select supplier_id, supplier_name, tgl, payable, paid from supplier_outstanding_days() where payable > paid
      )
      select jsonb_build_object(
        'tanggal', (now() at time zone 'Asia/Jakarta')::date,
        'total_belum_dibayar', coalesce((select sum(payable - paid) from o), 0),
        'supplier', coalesce((select jsonb_agg(to_jsonb(t) order by t.belum_dibayar desc) from (
          select supplier_name as supplier, sum(payable - paid) as belum_dibayar, count(*) as jumlah_hari,
                 min(tgl) as tertua, ((now() at time zone 'Asia/Jakarta')::date - min(tgl)) as umur_hari_tertua
          from o group by supplier_name) t), '[]'::jsonb)
      )
    );
  end if;

  raise exception 'Topik data tidak dikenal: %', p_topic;
end
$fn$;

grant execute on function public.ai_data(text, date, date) to authenticated;
revoke execute on function public.ai_valid_sales(date, date) from public, anon, authenticated;

-- ============================================================== PEMERIKSAAN (jalankan terpisah setelah di atas)
-- 1) Pastikan nama kolom sesuai. Hasil query ini harus memuat semua kolom di bagian "Asumsi" atas:
--    select table_name, string_agg(column_name, ', ' order by ordinal_position)
--    from information_schema.columns
--    where table_schema = 'public' and table_name in ('sales','sale_items','stock_batches','stock_adjustments','batch_stock')
--    group by table_name;
-- 2) Pastikan retur tersimpan sebagai type 'retur' di stock_adjustments:
--    select type, borne_by, count(*), sum(qty) from stock_adjustments group by 1, 2;
-- 3) Coba satu topik (harus mengembalikan JSON, bukan error):
--    select ai_data('ringkasan', current_date - 6, current_date);
