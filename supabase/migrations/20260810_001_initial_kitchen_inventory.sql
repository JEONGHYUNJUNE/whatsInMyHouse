-- ============================================================================
-- 집에뭐있지 (whats-in-my-house) - 초기 데이터베이스 스키마
-- 작성일: 2026-08-10
--
-- 실행 방법
-- 1) Supabase Dashboard > SQL Editor > New query
-- 2) 이 파일의 전체 내용을 붙여 넣고 Run
-- 3) 실행 후 Authentication > Providers에서 Google을 별도로 활성화
--
-- 설계 원칙
-- - auth.users와 앱 프로필을 분리합니다.
-- - 한 사용자가 여러 주방에 참여할 수 있도록 kitchen_members를 둡니다.
-- - 공통 상품정보(product_catalog)와 실제 보유 재고(inventory_items)를 분리합니다.
-- - 이동/소비/폐기 이력은 inventory_movements에 보존합니다.
-- - RLS로 같은 주방 구성원만 해당 주방 데이터를 읽고 변경할 수 있습니다.
-- ============================================================================

create extension if not exists pgcrypto;

-- 모든 테이블의 updated_at을 자동 갱신하는 공통 함수입니다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. 회원 프로필
-- Supabase Auth 계정 1개당 앱 프로필 1개가 생성됩니다.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  username text unique,
  nickname text not null check (char_length(nickname) between 1 and 30),
  avatar_url text,
  friend_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. 주방과 구성원
-- owner/editor/viewer 역할을 분리해 가족 공동 주방으로 확장할 수 있습니다.
-- ----------------------------------------------------------------------------
create table if not exists public.kitchens (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  name text not null default '우리 집 주방',
  description text,
  map_background_path text,
  default_view text not null default 'map' check (default_view in ('map', 'list', 'expiry')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kitchen_members (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (kitchen_id, profile_id)
);

create index if not exists kitchen_members_profile_idx on public.kitchen_members(profile_id, kitchen_id);

-- 현재 로그인 사용자가 특정 주방의 구성원인지 확인합니다.
-- RLS 안에서 반복 사용하므로 SECURITY DEFINER로 정책 재귀를 피합니다.
create or replace function public.is_kitchen_member(target_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.kitchen_members km
    join public.profiles p on p.id = km.profile_id
    where km.kitchen_id = target_kitchen_id
      and p.auth_user_id = auth.uid()
  );
$$;

-- owner/editor만 주방 데이터를 변경할 수 있습니다.
create or replace function public.can_edit_kitchen(target_kitchen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.kitchen_members km
    join public.profiles p on p.id = km.profile_id
    where km.kitchen_id = target_kitchen_id
      and p.auth_user_id = auth.uid()
      and km.role in ('owner', 'editor')
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. 보관공간
-- 같은 유형을 여러 개 만들 수 있으며 지도 좌표와 크기를 함께 저장합니다.
-- map_x/map_y는 시작 위치, map_width/map_height는 격자 크기입니다.
-- ----------------------------------------------------------------------------
create table if not exists public.storage_spaces (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  name text not null,
  alias text,
  space_type text not null check (space_type in (
    'fridge', 'freezer', 'kimchi_fridge', 'cabinet', 'pantry',
    'under_sink', 'counter', 'custom'
  )),
  memo text,
  color text not null default '#9DB89A',
  icon text not null default 'box',
  map_x integer not null default 0,
  map_y integer not null default 0,
  map_width integer not null default 1 check (map_width between 1 and 6),
  map_height integer not null default 1 check (map_height between 1 and 6),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kitchen_id, name)
);

create index if not exists storage_spaces_kitchen_sort_idx on public.storage_spaces(kitchen_id, sort_order);

-- ----------------------------------------------------------------------------
-- 4. 공통 상품 사전
-- 바코드 조회 결과와 사용자가 보완한 상품정보를 누적합니다.
-- 같은 상품을 다시 등록할 때 입력을 줄이는 용도이며 소비기한은 저장하지 않습니다.
-- ----------------------------------------------------------------------------
create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  product_name text not null,
  brand text,
  category text,
  default_unit text not null default '개',
  image_url text,
  data_source text not null default 'user' check (data_source in ('user', 'open_food_facts', 'foodsafety_korea', 'admin')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_catalog_name_idx on public.product_catalog using gin (to_tsvector('simple', product_name));

-- ----------------------------------------------------------------------------
-- 5. 실제 보유 식재료/상품
-- 같은 우유라도 소비기한이 다르면 inventory_items에 각각 저장합니다.
-- recommended_use_date는 포장 소비기한이 없는 농산물의 '권장 섭취일'입니다.
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  storage_space_id uuid not null references public.storage_spaces(id) on delete restrict,
  catalog_product_id uuid references public.product_catalog(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  product_name text not null,
  alias text,
  barcode text,
  image_path text,
  category text,
  quantity numeric(10, 2) not null default 1 check (quantity >= 0),
  unit text not null default '개',
  purchased_at date,
  opened_at date,
  expiration_date date,
  use_by_date date,
  recommended_use_date date,
  freshness_checked_at timestamptz,
  memo text,
  registration_method text not null default 'manual' check (registration_method in ('manual', 'barcode', 'bulk', 'photo')),
  status text not null default 'active' check (status in ('active', 'consumed', 'discarded')),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_kitchen_status_idx on public.inventory_items(kitchen_id, status);
create index if not exists inventory_items_space_idx on public.inventory_items(storage_space_id, status);
create index if not exists inventory_items_dates_idx on public.inventory_items(kitchen_id, use_by_date, expiration_date, recommended_use_date) where status = 'active';
create index if not exists inventory_items_search_idx on public.inventory_items using gin (
  to_tsvector('simple', coalesce(product_name, '') || ' ' || coalesce(alias, '') || ' ' || coalesce(memo, '') || ' ' || coalesce(category, ''))
);

-- 위치 이동, 수량 변경, 소비, 폐기 이력을 기록합니다.
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  action_type text not null check (action_type in ('registered', 'moved', 'quantity_changed', 'opened', 'consumed', 'discarded')),
  from_storage_space_id uuid references public.storage_spaces(id) on delete set null,
  to_storage_space_id uuid references public.storage_spaces(id) on delete set null,
  quantity_before numeric(10, 2),
  quantity_after numeric(10, 2),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_idx on public.inventory_movements(inventory_item_id, created_at desc);

-- 상품 등록 시 registered 이력을 자동으로 남깁니다.
create or replace function public.log_inventory_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory_movements (
    inventory_item_id, kitchen_id, action_type, to_storage_space_id,
    quantity_after, actor_profile_id
  ) values (
    new.id, new.kitchen_id, 'registered', new.storage_space_id,
    new.quantity, new.created_by
  );
  return new;
end;
$$;

drop trigger if exists inventory_registered_trigger on public.inventory_items;
create trigger inventory_registered_trigger
after insert on public.inventory_items
for each row execute function public.log_inventory_registration();

-- 수량 변경, 개봉, 소비, 폐기 시에도 자동으로 이력을 남깁니다.
create or replace function public.log_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_action text;
begin
  if old.status = 'active' and new.status = 'consumed' then
    resolved_action := 'consumed';
  elsif old.status = 'active' and new.status = 'discarded' then
    resolved_action := 'discarded';
  elsif old.opened_at is null and new.opened_at is not null then
    resolved_action := 'opened';
  elsif old.quantity is distinct from new.quantity then
    resolved_action := 'quantity_changed';
  else
    return new;
  end if;

  insert into public.inventory_movements (
    inventory_item_id, kitchen_id, action_type,
    from_storage_space_id, to_storage_space_id,
    quantity_before, quantity_after, actor_profile_id
  ) values (
    new.id, new.kitchen_id, resolved_action,
    old.storage_space_id, new.storage_space_id,
    old.quantity, new.quantity, new.created_by
  );

  return new;
end;
$$;

drop trigger if exists inventory_updated_history_trigger on public.inventory_items;
create trigger inventory_updated_history_trigger
after update on public.inventory_items
for each row execute function public.log_inventory_update();

-- 위치 이동은 프론트가 두 테이블을 따로 수정하지 않고 이 함수 하나를 호출합니다.
create or replace function public.move_inventory_item(
  target_item_id uuid,
  next_storage_space_id uuid,
  actor_profile_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_item public.inventory_items;
  target_space public.storage_spaces;
begin
  select * into current_item
  from public.inventory_items
  where id = target_item_id and status = 'active'
  for update;

  if current_item.id is null then
    raise exception '이동할 식재료를 찾지 못했습니다.';
  end if;

  if not public.can_edit_kitchen(current_item.kitchen_id) then
    raise exception '이 주방을 수정할 권한이 없습니다.';
  end if;

  select * into target_space
  from public.storage_spaces
  where id = next_storage_space_id and kitchen_id = current_item.kitchen_id;

  if target_space.id is null then
    raise exception '같은 주방 안의 보관공간으로만 이동할 수 있습니다.';
  end if;

  update public.inventory_items
  set storage_space_id = next_storage_space_id
  where id = target_item_id;

  insert into public.inventory_movements (
    inventory_item_id, kitchen_id, action_type,
    from_storage_space_id, to_storage_space_id, actor_profile_id
  ) values (
    target_item_id, current_item.kitchen_id, 'moved',
    current_item.storage_space_id, next_storage_space_id, actor_profile_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. 포장되지 않은 식재료의 권장 보관 규칙
-- 법적 소비기한이 아니라 앱이 제안하는 권장 섭취 범위입니다.
-- 사용자가 이 표를 주기적으로 보완/업데이트할 수 있습니다.
-- ----------------------------------------------------------------------------
create table if not exists public.food_storage_rules (
  id uuid primary key default gen_random_uuid(),
  ingredient_key text not null,
  display_name text not null,
  category text not null,
  storage_type text not null,
  item_condition text not null default 'whole' check (item_condition in ('whole', 'cut', 'opened', 'cooked', 'washed')),
  recommended_min_days integer not null check (recommended_min_days >= 0),
  recommended_max_days integer not null check (recommended_max_days >= recommended_min_days),
  check_after_days integer check (check_after_days >= 0),
  storage_tip text,
  source_name text,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_key, storage_type, item_condition)
);

-- 초기 규칙은 기능 확인용 보수적 예시입니다. 운영 전에 출처를 검토해 보완하세요.
insert into public.food_storage_rules (
  ingredient_key, display_name, category, storage_type, item_condition,
  recommended_min_days, recommended_max_days, check_after_days, storage_tip
) values
  ('apple', '사과', '과일', 'fridge', 'whole', 21, 35, 14, '다른 채소와 분리하고 개별 포장하면 신선도 유지에 도움이 됩니다.'),
  ('apple', '사과', '과일', 'counter', 'whole', 5, 10, 5, '서늘하고 햇빛이 들지 않는 곳에 보관하세요.'),
  ('banana', '바나나', '과일', 'counter', 'whole', 3, 7, 3, '덜 익은 바나나는 실온에서 후숙하세요.'),
  ('strawberry', '딸기', '과일', 'fridge', 'whole', 2, 4, 2, '씻지 않은 상태로 물기를 피해 보관하세요.'),
  ('lettuce', '상추', '잎채소', 'fridge', 'whole', 3, 7, 3, '물기를 제거하고 키친타월과 함께 밀폐 보관하세요.'),
  ('onion', '양파', '뿌리채소', 'pantry', 'whole', 14, 30, 14, '통풍이 잘되고 어두운 곳에 보관하세요.'),
  ('onion', '양파', '뿌리채소', 'fridge', 'cut', 3, 5, 3, '절단면을 밀폐해 냉장 보관하세요.'),
  ('tofu', '두부', '두부/콩', 'fridge', 'opened', 2, 3, 2, '개봉 후에는 깨끗한 물에 담아 냉장하고 물을 갈아주세요.')
on conflict (ingredient_key, storage_type, item_condition) do nothing;

-- ----------------------------------------------------------------------------
-- 7. 관리형 레시피와 사용자의 저장 레시피
-- AI 없이도 ingredient_name을 현재 재고와 비교하여 조합 추천이 가능합니다.
-- ----------------------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  image_url text,
  cook_minutes integer check (cook_minutes > 0),
  difficulty text check (difficulty in ('쉬움', '보통', '어려움')),
  instructions jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recipes_system_title_unique on public.recipes(title) where created_by is null;

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_name text not null,
  amount text,
  is_optional boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id, sort_order);
create index if not exists recipe_ingredients_name_idx on public.recipe_ingredients(ingredient_name);

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, recipe_id)
);

-- 기본 레시피 두 개를 재실행해도 중복 없이 등록합니다.
do $$
declare
  tofu_recipe_id uuid;
  tomato_recipe_id uuid;
begin
  insert into public.recipes (title, summary, cook_minutes, difficulty, instructions, tags)
  values (
    '두부김치 볶음', '임박한 두부를 맛있게 비우는 15분 요리', 15, '쉬움',
    '["두부의 물기를 제거해 노릇하게 굽습니다.", "김치와 양파를 볶습니다.", "두부와 함께 담아냅니다."]'::jsonb,
    array['냉장고털기', '한식', '빠른요리']
  )
  on conflict do nothing;

  select id into tofu_recipe_id from public.recipes where title = '두부김치 볶음' and created_by is null limit 1;
  if not exists (select 1 from public.recipe_ingredients where recipe_id = tofu_recipe_id) then
    insert into public.recipe_ingredients (recipe_id, ingredient_name, amount, is_optional, sort_order) values
      (tofu_recipe_id, '두부', '1모', false, 1),
      (tofu_recipe_id, '김치', '한 줌', false, 2),
      (tofu_recipe_id, '양파', '1/2개', true, 3);
  end if;

  insert into public.recipes (title, summary, cook_minutes, difficulty, instructions, tags)
  values (
    '토마토 달걀볶음', '무르기 전 토마토로 만드는 빠른 한 끼', 12, '쉬움',
    '["달걀을 먼저 부드럽게 익힙니다.", "토마토를 센 불에 볶습니다.", "달걀을 다시 넣고 간합니다."]'::jsonb,
    array['냉장고털기', '빠른요리']
  )
  on conflict do nothing;

  select id into tomato_recipe_id from public.recipes where title = '토마토 달걀볶음' and created_by is null limit 1;
  if not exists (select 1 from public.recipe_ingredients where recipe_id = tomato_recipe_id) then
    insert into public.recipe_ingredients (recipe_id, ingredient_name, amount, is_optional, sort_order) values
      (tomato_recipe_id, '토마토', '2개', false, 1),
      (tomato_recipe_id, '달걀', '3개', false, 2),
      (tomato_recipe_id, '대파', '조금', true, 3);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 8. 앱 내부 알림과 소비기한 중복 발송 방지
-- 실제 웹 푸시는 이후 Edge Function이 notifications INSERT webhook을 받아 발송합니다.
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kitchen_id uuid references public.kitchens(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx on public.notifications(profile_id, is_read, created_at desc);

create table if not exists public.expiry_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  alert_days integer not null,
  target_date date not null,
  created_at timestamptz not null default now(),
  unique (inventory_item_id, profile_id, alert_days, target_date)
);

-- ----------------------------------------------------------------------------
-- 9. 회원가입 자동 설정
-- Google/이메일 가입 직후 프로필과 빈 개인 주방을 자동 생성합니다.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_profile_id uuid;
  new_kitchen_id uuid;
  resolved_nickname text;
begin
  resolved_nickname := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '새 사용자'
  );

  insert into public.profiles (auth_user_id, username, nickname, avatar_url)
  values (
    new.id,
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), resolved_nickname), 30),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  returning id into new_profile_id;

  insert into public.kitchens (owner_profile_id, name)
  values (new_profile_id, '우리 집 주방')
  returning id into new_kitchen_id;

  insert into public.kitchen_members (kitchen_id, profile_id, role)
  values (new_kitchen_id, new_profile_id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 이미 Auth 사용자가 있지만 profiles가 없는 경우를 위한 1회성 보정입니다.
-- 기존 사용자가 없다면 아무 일도 하지 않습니다.
do $$
declare
  user_row record;
begin
  for user_row in
    select u.* from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
    where p.id is null
  loop
    -- 트리거 함수를 직접 호출할 수 없으므로 최소 프로필만 생성합니다.
    -- 해당 사용자는 아래 앱 로그인 후 주방이 없다면 관리자 SQL로 추가할 수 있습니다.
    insert into public.profiles (auth_user_id, nickname, avatar_url)
    values (
      user_row.id,
      left(coalesce(user_row.raw_user_meta_data ->> 'full_name', split_part(user_row.email, '@', 1), '사용자'), 30),
      user_row.raw_user_meta_data ->> 'avatar_url'
    ) on conflict (auth_user_id) do nothing;
  end loop;
end $$;

-- SQL 실행 전에 이미 가입한 사용자가 있다면 빈 개인 주방을 보정합니다.
do $$
declare
  profile_row record;
  backfill_kitchen_id uuid;
begin
  for profile_row in
    select p.id
    from public.profiles p
    where not exists (
      select 1 from public.kitchen_members km where km.profile_id = p.id
    )
  loop
    insert into public.kitchens (owner_profile_id, name)
    values (profile_row.id, '우리 집 주방')
    returning id into backfill_kitchen_id;

    insert into public.kitchen_members (kitchen_id, profile_id, role)
    values (backfill_kitchen_id, profile_row.id, 'owner');

  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 10. updated_at 트리거
-- ----------------------------------------------------------------------------
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists kitchens_updated_at on public.kitchens;
create trigger kitchens_updated_at before update on public.kitchens for each row execute function public.set_updated_at();
drop trigger if exists storage_spaces_updated_at on public.storage_spaces;
create trigger storage_spaces_updated_at before update on public.storage_spaces for each row execute function public.set_updated_at();
drop trigger if exists product_catalog_updated_at on public.product_catalog;
create trigger product_catalog_updated_at before update on public.product_catalog for each row execute function public.set_updated_at();
drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
drop trigger if exists food_storage_rules_updated_at on public.food_storage_rules;
create trigger food_storage_rules_updated_at before update on public.food_storage_rules for each row execute function public.set_updated_at();
drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at before update on public.recipes for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 11. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.kitchens enable row level security;
alter table public.kitchen_members enable row level security;
alter table public.storage_spaces enable row level security;
alter table public.product_catalog enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.food_storage_rules enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.saved_recipes enable row level security;
alter table public.notifications enable row level security;
alter table public.expiry_notification_deliveries enable row level security;

-- 프로필: 본인 프로필만 조회/수정합니다.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth_user_id = auth.uid());
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- 주방과 구성원: 같은 주방 구성원만 조회, owner/editor만 수정합니다.
drop policy if exists "kitchens_select_member" on public.kitchens;
create policy "kitchens_select_member" on public.kitchens for select to authenticated using (public.is_kitchen_member(id));
drop policy if exists "kitchens_update_editor" on public.kitchens;
create policy "kitchens_update_editor" on public.kitchens for update to authenticated using (public.can_edit_kitchen(id)) with check (public.can_edit_kitchen(id));
drop policy if exists "kitchen_members_select_member" on public.kitchen_members;
create policy "kitchen_members_select_member" on public.kitchen_members for select to authenticated using (public.is_kitchen_member(kitchen_id));
drop policy if exists "kitchen_members_manage_owner" on public.kitchen_members;
create policy "kitchen_members_manage_owner" on public.kitchen_members for all to authenticated
using (exists (select 1 from public.kitchens k join public.profiles p on p.id = k.owner_profile_id where k.id = kitchen_id and p.auth_user_id = auth.uid()))
with check (exists (select 1 from public.kitchens k join public.profiles p on p.id = k.owner_profile_id where k.id = kitchen_id and p.auth_user_id = auth.uid()));

-- 보관공간/재고/이력: 구성원 조회, owner/editor 변경.
drop policy if exists "storage_spaces_select_member" on public.storage_spaces;
create policy "storage_spaces_select_member" on public.storage_spaces for select to authenticated using (public.is_kitchen_member(kitchen_id));
drop policy if exists "storage_spaces_write_editor" on public.storage_spaces;
create policy "storage_spaces_write_editor" on public.storage_spaces for all to authenticated using (public.can_edit_kitchen(kitchen_id)) with check (public.can_edit_kitchen(kitchen_id));
drop policy if exists "inventory_items_select_member" on public.inventory_items;
create policy "inventory_items_select_member" on public.inventory_items for select to authenticated using (public.is_kitchen_member(kitchen_id));
drop policy if exists "inventory_items_write_editor" on public.inventory_items;
create policy "inventory_items_write_editor" on public.inventory_items for all to authenticated using (public.can_edit_kitchen(kitchen_id)) with check (public.can_edit_kitchen(kitchen_id));
drop policy if exists "inventory_movements_select_member" on public.inventory_movements;
create policy "inventory_movements_select_member" on public.inventory_movements for select to authenticated using (public.is_kitchen_member(kitchen_id));
drop policy if exists "inventory_movements_insert_editor" on public.inventory_movements;
create policy "inventory_movements_insert_editor" on public.inventory_movements for insert to authenticated with check (public.can_edit_kitchen(kitchen_id));

-- 상품 사전과 보관 규칙은 로그인 사용자 모두 읽을 수 있습니다.
drop policy if exists "catalog_read_authenticated" on public.product_catalog;
create policy "catalog_read_authenticated" on public.product_catalog for select to authenticated using (true);
drop policy if exists "catalog_insert_authenticated" on public.product_catalog;
create policy "catalog_insert_authenticated" on public.product_catalog for insert to authenticated with check (true);
drop policy if exists "storage_rules_read_authenticated" on public.food_storage_rules;
create policy "storage_rules_read_authenticated" on public.food_storage_rules for select to authenticated using (is_active = true);

-- 활성 레시피는 로그인 사용자가 읽고, 본인이 만든 레시피만 관리합니다.
drop policy if exists "recipes_read_authenticated" on public.recipes;
create policy "recipes_read_authenticated" on public.recipes for select to authenticated using (is_active = true or created_by in (select id from public.profiles where auth_user_id = auth.uid()));
drop policy if exists "recipes_manage_own" on public.recipes;
create policy "recipes_manage_own" on public.recipes for all to authenticated
using (created_by in (select id from public.profiles where auth_user_id = auth.uid()))
with check (created_by in (select id from public.profiles where auth_user_id = auth.uid()));
drop policy if exists "recipe_ingredients_read_authenticated" on public.recipe_ingredients;
create policy "recipe_ingredients_read_authenticated" on public.recipe_ingredients for select to authenticated using (true);
drop policy if exists "recipe_ingredients_manage_own" on public.recipe_ingredients;
create policy "recipe_ingredients_manage_own" on public.recipe_ingredients for all to authenticated
using (exists (select 1 from public.recipes r join public.profiles p on p.id = r.created_by where r.id = recipe_id and p.auth_user_id = auth.uid()))
with check (exists (select 1 from public.recipes r join public.profiles p on p.id = r.created_by where r.id = recipe_id and p.auth_user_id = auth.uid()));

drop policy if exists "saved_recipes_manage_own" on public.saved_recipes;
create policy "saved_recipes_manage_own" on public.saved_recipes for all to authenticated
using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()))
with check (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

drop policy if exists "notifications_manage_own" on public.notifications;
create policy "notifications_manage_own" on public.notifications for all to authenticated
using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()))
with check (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));
drop policy if exists "expiry_deliveries_read_own" on public.expiry_notification_deliveries;
create policy "expiry_deliveries_read_own" on public.expiry_notification_deliveries for select to authenticated
using (profile_id in (select id from public.profiles where auth_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 12. 식재료 이미지 Storage 버킷
-- 파일 경로 규칙: kitchen_id/profile_id/파일명
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-images', 'inventory-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inventory_images_public_read" on storage.objects;
create policy "inventory_images_public_read" on storage.objects for select using (bucket_id = 'inventory-images');
drop policy if exists "inventory_images_member_insert" on storage.objects;
create policy "inventory_images_member_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'inventory-images'
  and public.is_kitchen_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "inventory_images_member_update" on storage.objects;
create policy "inventory_images_member_update" on storage.objects for update to authenticated
using (
  bucket_id = 'inventory-images'
  and public.can_edit_kitchen(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "inventory_images_member_delete" on storage.objects;
create policy "inventory_images_member_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'inventory-images'
  and public.can_edit_kitchen(((storage.foldername(name))[1])::uuid)
);

-- ----------------------------------------------------------------------------
-- 실행 확인용 쿼리 (필요할 때 주석을 풀어 실행하세요)
-- ----------------------------------------------------------------------------
-- select * from public.food_storage_rules order by category, display_name;
-- select r.title, ri.ingredient_name, ri.amount
-- from public.recipes r
-- join public.recipe_ingredients ri on ri.recipe_id = r.id
-- order by r.title, ri.sort_order;

-- 완료: 이제 신규 사용자는 빈 개인 주방에서 첫 보관공간을 직접 생성합니다.
