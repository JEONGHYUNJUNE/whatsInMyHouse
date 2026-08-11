-- 로그인 사용자끼리 개인 레시피를 링크로 안전하게 공유합니다.
-- 원본 recipes 행을 공개하지 않고 공유 시점의 스냅샷만 토큰으로 조회합니다.

create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  source_recipe_id uuid references public.recipes(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  snapshot jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, source_recipe_id)
);

create table if not exists public.recipe_share_imports (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.recipe_shares(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (share_id, profile_id)
);

create index if not exists recipe_shares_source_idx on public.recipe_shares(source_recipe_id);
create index if not exists recipe_share_imports_profile_idx on public.recipe_share_imports(profile_id);

alter table public.recipe_shares enable row level security;
alter table public.recipe_share_imports enable row level security;

-- 개인 레시피 원본과 재료는 작성자만 직접 읽습니다. 시스템 레시피는 모두 읽습니다.
drop policy if exists "recipes_read_authenticated" on public.recipes;
create policy "recipes_read_authenticated" on public.recipes for select to authenticated
using (
  created_by is null
  or created_by in (select id from public.profiles where auth_user_id = auth.uid())
);

drop policy if exists "recipe_ingredients_read_authenticated" on public.recipe_ingredients;
create policy "recipe_ingredients_read_authenticated" on public.recipe_ingredients for select to authenticated
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and (r.created_by is null or r.created_by in (select id from public.profiles where auth_user_id = auth.uid()))
  )
);

create or replace function public.create_recipe_share(target_recipe_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  target_recipe public.recipes%rowtype;
  target_author_name text;
  share_id uuid;
  recipe_snapshot jsonb;
begin
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  if actor_profile_id is null then raise exception '로그인이 필요합니다.'; end if;

  select * into target_recipe from public.recipes where id = target_recipe_id and is_active = true;
  if target_recipe.id is null then raise exception '레시피를 찾을 수 없습니다.'; end if;
  if target_recipe.created_by is not null and target_recipe.created_by <> actor_profile_id then
    raise exception '본인이 작성한 레시피만 공유할 수 있습니다.';
  end if;

  select coalesce(nullif(trim(nickname), ''), nullif(trim(username), ''), '집에뭐있지 사용자')
    into target_author_name from public.profiles where id = actor_profile_id;

  recipe_snapshot := jsonb_build_object(
    'title', target_recipe.title,
    'summary', target_recipe.summary,
    'image_url', target_recipe.image_url,
    'youtube_url', target_recipe.youtube_url,
    'cook_minutes', target_recipe.cook_minutes,
    'difficulty', target_recipe.difficulty,
    'instructions', target_recipe.instructions,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ingredient_name', ri.ingredient_name,
        'amount', ri.amount,
        'is_optional', ri.is_optional
      ) order by ri.sort_order)
      from public.recipe_ingredients ri where ri.recipe_id = target_recipe.id
    ), '[]'::jsonb)
  );

  insert into public.recipe_shares(source_recipe_id, created_by, author_name, snapshot, is_active, updated_at)
  values (target_recipe.id, actor_profile_id, target_author_name, recipe_snapshot, true, now())
  on conflict (created_by, source_recipe_id) do update
    set author_name = excluded.author_name, snapshot = excluded.snapshot, is_active = true, updated_at = now()
  returning id into share_id;

  return share_id;
end;
$$;

create or replace function public.get_shared_recipe(target_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  result jsonb;
begin
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  if actor_profile_id is null then raise exception '로그인이 필요합니다.'; end if;

  select jsonb_build_object(
    'id', rs.id,
    'author_name', rs.author_name,
    'recipe', rs.snapshot,
    'is_own', rs.created_by = actor_profile_id,
    'saved_recipe_id', rsi.recipe_id
  ) into result
  from public.recipe_shares rs
  left join public.recipe_share_imports rsi on rsi.share_id = rs.id and rsi.profile_id = actor_profile_id
  where rs.id = target_share_id and rs.is_active = true;

  if result is null then raise exception '공유가 종료되었거나 존재하지 않는 레시피입니다.'; end if;
  return result;
end;
$$;

create or replace function public.save_shared_recipe(target_share_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  share_record public.recipe_shares%rowtype;
  existing_recipe_id uuid;
  new_recipe_id uuid;
  ingredient jsonb;
  ingredient_index integer := 0;
begin
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  if actor_profile_id is null then raise exception '로그인이 필요합니다.'; end if;

  select recipe_id into existing_recipe_id from public.recipe_share_imports
  where share_id = target_share_id and profile_id = actor_profile_id;
  if existing_recipe_id is not null then return existing_recipe_id; end if;

  select * into share_record from public.recipe_shares where id = target_share_id and is_active = true;
  if share_record.id is null then raise exception '공유가 종료되었거나 존재하지 않는 레시피입니다.'; end if;
  if share_record.created_by = actor_profile_id and share_record.source_recipe_id is not null then
    return share_record.source_recipe_id;
  end if;

  insert into public.recipes(title, summary, image_url, youtube_url, cook_minutes, difficulty, instructions, created_by, is_active)
  values (
    share_record.snapshot->>'title', nullif(share_record.snapshot->>'summary', ''),
    nullif(share_record.snapshot->>'image_url', ''), nullif(share_record.snapshot->>'youtube_url', ''),
    nullif(share_record.snapshot->>'cook_minutes', '')::integer,
    coalesce(nullif(share_record.snapshot->>'difficulty', ''), '쉬움'),
    coalesce(share_record.snapshot->'instructions', '[]'::jsonb), actor_profile_id, true
  ) returning id into new_recipe_id;

  for ingredient in select value from jsonb_array_elements(coalesce(share_record.snapshot->'ingredients', '[]'::jsonb)) loop
    insert into public.recipe_ingredients(recipe_id, ingredient_name, amount, is_optional, sort_order)
    values (new_recipe_id, ingredient->>'ingredient_name', nullif(ingredient->>'amount', ''), coalesce((ingredient->>'is_optional')::boolean, false), ingredient_index);
    ingredient_index := ingredient_index + 1;
  end loop;

  insert into public.recipe_share_imports(share_id, profile_id, recipe_id)
  values (target_share_id, actor_profile_id, new_recipe_id)
  on conflict (share_id, profile_id) do nothing;
  return new_recipe_id;
end;
$$;

revoke all on function public.create_recipe_share(uuid) from public;
revoke all on function public.get_shared_recipe(uuid) from public;
revoke all on function public.save_shared_recipe(uuid) from public;
grant execute on function public.create_recipe_share(uuid) to authenticated;
grant execute on function public.get_shared_recipe(uuid) to authenticated;
grant execute on function public.save_shared_recipe(uuid) to authenticated;

