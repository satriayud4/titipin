-- LANGKAH 7: SHIFT KASIR YANG LUPA DITUTUP DITUTUP OTOMATIS
-- Shift yang dibuka di hari sebelumnya dan belum ditutup akan ditutup otomatis pada pukul 23:59:59 WIB hari
-- pembukaannya. Uang tunai di laci dianggap sesuai (sama dengan kas yang seharusnya ada), jadi tidak muncul
-- selisih palsu. Shift ditandai "Ditutup otomatis" di catatannya. Aman dijalankan berulang.

alter table public.shifts add column if not exists auto_closed boolean not null default false;

create or replace function public.auto_close_stale_shifts()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_end timestamptz;
  v_exp numeric;
  v_n integer := 0;
begin
  if auth.uid() is not null and not is_active_user() then return 0; end if;
  if not pg_try_advisory_xact_lock(710202) then return 0; end if; -- sudah ada yang menjalankan

  for r in
    select id, opened_at, opening_cash, notes
    from shifts
    where closed_at is null
      and (opened_at at time zone 'Asia/Jakarta')::date < v_today
    for update
  loop
    -- akhir hari pembukaan (WIB), satu detik sebelum tengah malam
    v_end := ((((r.opened_at at time zone 'Asia/Jakarta')::date + 1)::timestamp) at time zone 'Asia/Jakarta') - interval '1 second';
    select expected_cash into v_exp from shift_summary where shift_id = r.id;

    update shifts
       set closed_at = v_end,
           closing_cash = round(coalesce(v_exp, r.opening_cash))::integer,
           auto_closed = true,
           notes = case when coalesce(r.notes, '') = '' then 'Ditutup otomatis karena lupa ditutup'
                        else r.notes || ' · Ditutup otomatis karena lupa ditutup' end
     where id = r.id and closed_at is null;
    v_n := v_n + 1;
  end loop;

  return v_n;
end
$fn$;
grant execute on function public.auto_close_stale_shifts() to authenticated;

-- (opsional) jalankan sendiri tiap malam pukul 00:05 WIB (17:05 UTC), walau tidak ada yang membuka aplikasi.
-- Diabaikan otomatis bila pg_cron tidak tersedia. Tanpa ini, shift ditutup saat aplikasi berikutnya dibuka.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('auto_close_shifts', '5 17 * * *', 'select public.auto_close_stale_shifts()');
    exception when others then
      raise notice 'pg_cron tidak diaktifkan (%). Shift tetap ditutup otomatis saat aplikasi dibuka.', sqlerrm;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
