-- ============================================================
-- SARAGA — Kalender & Operasional
-- Jalankan sekali di Supabase → SQL Editor. Aman dijalankan ulang.
-- ============================================================

-- Pemeriksa peran (dipakai oleh kebijakan akses di bawah)
create or replace function public.kal_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and (role = 'admin' or is_superadmin)
  );
$$;

create or replace function public.kal_is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_active
  );
$$;

-- 1) Jam buka mingguan (0 = Minggu ... 6 = Sabtu)
create table if not exists public.store_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_open    boolean  not null default true,
  open_time  time     not null default '08:00',
  close_time time     not null default '21:00',
  constraint store_hours_order check (close_time > open_time)
);
insert into public.store_hours (weekday)
select generate_series(0, 6)
on conflict (weekday) do nothing;

-- 2) Pengecualian per tanggal: tutup (dengan keterangan) atau jam khusus
create table if not exists public.day_overrides (
  day        date primary key,
  is_closed  boolean not null default false,
  open_time  time,
  close_time time,
  note       text,
  constraint day_overrides_hours check (
    is_closed or (open_time is not null and close_time is not null and close_time > open_time)
  )
);

-- 3) Shift karyawan per tanggal
create table if not exists public.work_shifts (
  id         bigint generated always as identity primary key,
  day        date not null,
  staff_name text not null,
  user_id    uuid references auth.users(id) on delete set null,
  start_time time not null,
  end_time   time not null,
  note       text,
  created_at timestamptz not null default now(),
  constraint work_shifts_name_not_blank check (btrim(staff_name) <> ''),
  constraint work_shifts_order check (end_time > start_time)
);
create index if not exists work_shifts_day_idx on public.work_shifts (day);

-- 4) Pesanan yang punya tenggat (pelanggan atau supplier)
create table if not exists public.scheduled_orders (
  id         bigint generated always as identity primary key,
  kind       text not null default 'customer' check (kind in ('customer', 'supplier')),
  title      text not null,
  party      text,
  due_date   date not null,
  due_time   time,
  details    text,
  status     text not null default 'pending' check (status in ('pending', 'processing', 'done', 'cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint scheduled_orders_title_not_blank check (btrim(title) <> '')
);
create index if not exists scheduled_orders_due_idx on public.scheduled_orders (due_date);

-- ---------- Hak akses ----------
alter table public.store_hours       enable row level security;
alter table public.day_overrides     enable row level security;
alter table public.work_shifts       enable row level security;
alter table public.scheduled_orders  enable row level security;

-- Jadwal: semua staf boleh melihat, hanya admin yang boleh mengubah
do $$
declare t text;
begin
  foreach t in array array['store_hours', 'day_overrides', 'work_shifts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.kal_is_staff())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.kal_is_admin()) with check (public.kal_is_admin())', t || '_write', t);
  end loop;
end $$;

-- Pesanan: semua staf boleh melihat, menambah, dan mengubah; hanya admin yang boleh menghapus
drop policy if exists scheduled_orders_read   on public.scheduled_orders;
drop policy if exists scheduled_orders_insert on public.scheduled_orders;
drop policy if exists scheduled_orders_update on public.scheduled_orders;
drop policy if exists scheduled_orders_delete on public.scheduled_orders;
create policy scheduled_orders_read   on public.scheduled_orders for select to authenticated using (public.kal_is_staff());
create policy scheduled_orders_insert on public.scheduled_orders for insert to authenticated with check (public.kal_is_staff());
create policy scheduled_orders_update on public.scheduled_orders for update to authenticated using (public.kal_is_staff()) with check (public.kal_is_staff());
create policy scheduled_orders_delete on public.scheduled_orders for delete to authenticated using (public.kal_is_admin());
