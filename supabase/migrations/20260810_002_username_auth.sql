-- ============================================================================
-- 집에뭐있지 - 아이디/비밀번호 로그인 추가
--
-- 001 초기 SQL을 이미 실행한 경우에만 이 파일을 이어서 실행하세요.
-- 수정된 001 SQL을 처음 실행한다면 이 파일은 실행하지 않아도 됩니다.
--
-- 사용자 아이디는 Supabase Auth 내부에서
--   아이디@whats-in-my-house.app
-- 형태의 가상 이메일로 변환됩니다. 실제 이메일은 받지 않습니다.
-- ============================================================================

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique
on public.profiles(username) where username is not null;

-- 기존 가상 이메일 계정이 있다면 @ 앞부분을 아이디로 보정합니다.
update public.profiles p
set username = lower(split_part(u.email, '@', 1))
from auth.users u
where p.auth_user_id = u.id
  and p.username is null
  and u.email like '%@whats-in-my-house.app';

-- 신규 가입 시 Auth metadata에서 아이디와 별칭을 복사하고
-- 빈 개인 주방을 생성합니다. 보관공간은 온보딩에서 사용자가 직접 만듭니다.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 중요: Authentication > Providers > Email에서 Confirm email을 꺼야
-- 가상 이메일 계정이 가입 직후 바로 로그인됩니다.
