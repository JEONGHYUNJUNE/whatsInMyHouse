-- 개인 레시피북에서 참고할 영상 링크를 저장합니다.
alter table public.recipes add column if not exists youtube_url text;
