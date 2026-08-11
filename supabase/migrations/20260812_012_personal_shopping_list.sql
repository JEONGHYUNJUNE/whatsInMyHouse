-- 사용자별 장보기 체크리스트
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  product_name text not null check (char_length(trim(product_name)) between 1 and 100),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit text not null default '개',
  memo text,
  is_checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_list_items_profile_idx
  on public.shopping_list_items(profile_id, is_checked, created_at desc);

drop trigger if exists shopping_list_items_updated_at on public.shopping_list_items;
create trigger shopping_list_items_updated_at
before update on public.shopping_list_items
for each row execute function public.set_updated_at();

alter table public.shopping_list_items enable row level security;

drop policy if exists "shopping_list_items_manage_own" on public.shopping_list_items;
create policy "shopping_list_items_manage_own" on public.shopping_list_items
  for all to authenticated
  using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()))
  with check (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
    and public.is_kitchen_member(kitchen_id)
  );

