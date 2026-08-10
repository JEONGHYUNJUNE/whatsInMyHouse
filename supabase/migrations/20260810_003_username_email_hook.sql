-- ============================================================================
-- 집에뭐있지 - 아이디 로그인용 이메일 무발송 Hook
--
-- Supabase Auth는 아이디/비밀번호 인증을 직접 지원하지 않으므로 내부적으로
--   아이디@whats-in-my-house.app
-- 형식의 이메일 자격 증명을 사용합니다. 이 주소로 실제 인증 메일을 보내지
-- 않도록 Send Email Auth Hook에서 이 함수를 선택하세요.
--
-- SQL 실행 후 Dashboard에서 반드시 아래 설정을 완료해야 합니다.
--   Authentication > Hooks > Send Email > Add hook
--   Hook type: Postgres Function
--   Schema: public
--   Function: ignore_username_auth_email
-- ============================================================================

create or replace function public.ignore_username_auth_email(event jsonb)
returns jsonb
language sql
immutable
as $$
  select '{}'::jsonb;
$$;

-- Auth 서버만 실행할 수 있게 제한합니다.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.ignore_username_auth_email(jsonb) to supabase_auth_admin;
revoke execute on function public.ignore_username_auth_email(jsonb) from public, anon, authenticated;

comment on function public.ignore_username_auth_email(jsonb) is
  '아이디 기반 Auth 계정의 가상 이메일 발송을 생략하는 Supabase Send Email Hook';
