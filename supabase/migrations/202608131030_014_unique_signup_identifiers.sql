-- 가입 전에 아이디/닉네임 사용 가능 여부를 확인하고 동시 가입도 DB에서 차단합니다.

create unique index if not exists profiles_nickname_normalized_unique
  on public.profiles (lower(trim(nickname)));

create or replace function public.check_signup_identifiers(target_username text, target_nickname text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'usernameAvailable', not exists (
      select 1 from public.profiles where lower(username) = lower(trim(target_username))
    ),
    'nicknameAvailable', not exists (
      select 1 from public.profiles where lower(trim(nickname)) = lower(trim(target_nickname))
    )
  );
$$;

revoke all on function public.check_signup_identifiers(text, text) from public;
grant execute on function public.check_signup_identifiers(text, text) to anon, authenticated;
