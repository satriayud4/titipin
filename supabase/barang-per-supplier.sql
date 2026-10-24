-- Barang dimiliki supplier (sudah dijalankan di database).
-- Disimpan di sini sebagai catatan.
begin;
drop index if exists public.products_name_lower;
alter table public.products add column if not exists supplier_id bigint references public.suppliers(id);
-- (pengisian supplier_id dan pemecahan produk lama sudah dijalankan terpisah)
create unique index if not exists products_supplier_name_lower
  on public.products (supplier_id, lower(name));
commit;

alter table public.stock_batches add column if not exists expired_date date;
-- Fungsi add_stock_batches versi baru: cari barang per supplier + nama.
