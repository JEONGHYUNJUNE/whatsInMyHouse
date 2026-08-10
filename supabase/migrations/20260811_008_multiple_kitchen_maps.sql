-- 한 주방에서 주방, 베란다, 창고처럼 여러 장의 배치 지도를 관리합니다.
create table if not exists public.kitchen_maps (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kitchen_id, name)
);

create index if not exists kitchen_maps_kitchen_sort_idx
  on public.kitchen_maps(kitchen_id, sort_order);

alter table public.kitchen_maps enable row level security;

drop policy if exists "kitchen_maps_select_member" on public.kitchen_maps;
create policy "kitchen_maps_select_member" on public.kitchen_maps
  for select to authenticated
  using (public.is_kitchen_member(kitchen_id));

drop policy if exists "kitchen_maps_write_editor" on public.kitchen_maps;
create policy "kitchen_maps_write_editor" on public.kitchen_maps
  for all to authenticated
  using (public.can_edit_kitchen(kitchen_id))
  with check (public.can_edit_kitchen(kitchen_id));

insert into public.kitchen_maps (kitchen_id, name, sort_order)
select k.id, '주방', 1
from public.kitchens k
where not exists (
  select 1 from public.kitchen_maps km where km.kitchen_id = k.id
);

alter table public.storage_spaces
  add column if not exists map_id uuid references public.kitchen_maps(id) on delete restrict;

update public.storage_spaces s
set map_id = (
  select km.id
  from public.kitchen_maps km
  where km.kitchen_id = s.kitchen_id
  order by km.sort_order, km.created_at
  limit 1
)
where s.map_id is null;

alter table public.storage_spaces alter column map_id set not null;
create index if not exists storage_spaces_map_sort_idx
  on public.storage_spaces(map_id, sort_order);

create or replace function public.create_default_kitchen_map()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kitchen_maps (kitchen_id, name, sort_order)
  values (new.id, '주방', 1)
  on conflict (kitchen_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_kitchen_map_after_kitchen on public.kitchens;
create trigger create_default_kitchen_map_after_kitchen
after insert on public.kitchens
for each row execute function public.create_default_kitchen_map();
