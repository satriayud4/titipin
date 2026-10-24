-- LANGKAH 1: expired jadi dasar masa jual dan batas retur.
-- Jalankan utuh di SQL Editor.
begin;

-- return_due_date tadinya otomatis (sellable_until + 1); sekarang kolom biasa.
-- Nilai lama tetap dipertahankan.
alter table public.stock_batches alter column return_due_date drop expression if exists;

-- stok yang sudah ada: expired = batas jual lama (perilaku lama tidak berubah)
update public.stock_batches set expired_date = sellable_until where expired_date is null;

create or replace function public.set_sellable_until()
 returns trigger
 language plpgsql
as $fn$
begin
  new.sellable_until := coalesce(new.expired_date, new.sellable_until, new.received_date);
  new.expired_date   := coalesce(new.expired_date, new.sellable_until);
  -- retur boleh kapan saja asal belum lewat tanggal expired
  new.return_due_date := new.sellable_until;
  return new;
end
$fn$;

commit;
