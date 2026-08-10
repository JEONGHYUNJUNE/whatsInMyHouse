-- ============================================================================
-- 집에뭐있지 - 빈 주방 온보딩
-- 신규 가입 시 주방만 만들고 보관공간은 사용자가 직접 등록합니다.
-- ============================================================================

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
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '새 사용자'
  );

  insert into public.profiles (auth_user_id, username, nickname, avatar_url)
  values (
    new.id,
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    left(resolved_nickname, 30),
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

-- 이전 트리거가 만든 기본 5개 공간만 있고 식재료가 전혀 없는 주방만
-- 빈 상태로 되돌립니다. 이름뿐 아니라 유형과 배치까지 모두 확인합니다.
delete from public.storage_spaces s
where not exists (
  select 1 from public.inventory_items i where i.kitchen_id = s.kitchen_id
)
and s.kitchen_id in (
  select kitchen_id
  from public.storage_spaces
  group by kitchen_id
  having count(*) = 5
    and count(*) filter (where name = '냉장실' and space_type = 'fridge' and map_x = 0 and map_y = 0 and map_width = 1 and map_height = 2) = 1
    and count(*) filter (where name = '냉동실' and space_type = 'freezer' and map_x = 0 and map_y = 2 and map_width = 1 and map_height = 1) = 1
    and count(*) filter (where name = '수납장' and space_type = 'cabinet' and map_x = 1 and map_y = 0 and map_width = 2 and map_height = 1) = 1
    and count(*) filter (where name = '싱크대 하부장' and space_type = 'under_sink' and map_x = 1 and map_y = 1 and map_width = 2 and map_height = 1) = 1
    and count(*) filter (where name = '팬트리' and space_type = 'pantry' and map_x = 3 and map_y = 0 and map_width = 1 and map_height = 3) = 1
);
