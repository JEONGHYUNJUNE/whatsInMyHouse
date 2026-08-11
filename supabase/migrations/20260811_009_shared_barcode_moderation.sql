-- 사용자가 등록한 바코드 상품은 개인 기록으로 먼저 사용하고,
-- 관리자가 검토한 정보만 공용 상품 카탈로그로 승격합니다.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 프로젝트 소유자 계정을 최초 관리자로 지정합니다.
update public.profiles
set is_admin = true
where lower(username) = 'hjune24';

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and is_admin = true
  );
$$;

create table if not exists public.barcode_product_submissions (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique check (barcode ~ '^[0-9]{8,14}$'),
  product_name text not null check (char_length(trim(product_name)) between 1 and 200),
  brand text,
  category text,
  default_unit text not null default '개',
  image_url text,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists barcode_product_submissions_created_idx
  on public.barcode_product_submissions(created_at desc);

drop trigger if exists barcode_product_submissions_updated_at on public.barcode_product_submissions;
create trigger barcode_product_submissions_updated_at
before update on public.barcode_product_submissions
for each row execute function public.set_updated_at();

alter table public.barcode_product_submissions enable row level security;

drop policy if exists "barcode_submissions_admin_read" on public.barcode_product_submissions;
create policy "barcode_submissions_admin_read" on public.barcode_product_submissions
  for select to authenticated using (public.is_app_admin());

-- 프로필 자체 수정으로 관리자 권한을 획득할 수 없게 수정 가능한 열을 제한합니다.
revoke update on public.profiles from authenticated;
grant update (nickname, avatar_url) on public.profiles to authenticated;

-- 공용 상품 카탈로그는 관리자 승인 함수만 변경할 수 있습니다.
drop policy if exists "catalog_insert_authenticated" on public.product_catalog;
drop policy if exists "catalog_admin_write" on public.product_catalog;
create policy "catalog_admin_write" on public.product_catalog
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- 승인된 상품 이미지는 외부 URL 대신 바코드별 한 파일로 공용 보관합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barcode-images', 'barcode-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "barcode_images_public_read" on storage.objects;
create policy "barcode_images_public_read" on storage.objects
  for select using (bucket_id = 'barcode-images');
drop policy if exists "barcode_images_admin_insert" on storage.objects;
create policy "barcode_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'barcode-images' and public.is_app_admin());
drop policy if exists "barcode_images_admin_update" on storage.objects;
create policy "barcode_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'barcode-images' and public.is_app_admin())
  with check (bucket_id = 'barcode-images' and public.is_app_admin());
drop policy if exists "barcode_images_admin_delete" on storage.objects;
create policy "barcode_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'barcode-images' and public.is_app_admin());

create or replace function public.submit_barcode_product(
  target_barcode text,
  target_product_name text,
  target_brand text default null,
  target_category text default null,
  target_default_unit text default '개',
  target_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  submission_id uuid;
begin
  select id into actor_profile_id
  from public.profiles
  where auth_user_id = auth.uid();

  if actor_profile_id is null then
    raise exception '로그인 프로필을 찾을 수 없습니다.';
  end if;
  if target_barcode !~ '^[0-9]{8,14}$' or nullif(trim(target_product_name), '') is null then
    raise exception '바코드와 상품명이 필요합니다.';
  end if;

  if exists (
    select 1 from public.product_catalog
    where barcode = target_barcode and data_source = 'admin'
  ) then
    return null;
  end if;

  insert into public.barcode_product_submissions (
    barcode, product_name, brand, category, default_unit, image_url, submitted_by
  ) values (
    target_barcode,
    trim(target_product_name),
    nullif(trim(target_brand), ''),
    nullif(trim(target_category), ''),
    coalesce(nullif(trim(target_default_unit), ''), '개'),
    nullif(trim(target_image_url), ''),
    actor_profile_id
  )
  on conflict (barcode) do nothing
  returning id into submission_id;

  if submission_id is null then
    select id into submission_id
    from public.barcode_product_submissions
    where barcode = target_barcode;
  end if;

  return submission_id;
end;
$$;

create or replace function public.approve_barcode_product(
  target_submission_id uuid,
  approved_product_name text,
  approved_brand text default null,
  approved_category text default null,
  approved_default_unit text default '개',
  approved_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.barcode_product_submissions%rowtype;
  catalog_id uuid;
  admin_profile_id uuid;
begin
  if not public.is_app_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if nullif(trim(approved_product_name), '') is null then raise exception '상품명이 필요합니다.'; end if;

  select * into candidate from public.barcode_product_submissions where id = target_submission_id;
  if not found then raise exception '검토할 상품을 찾을 수 없습니다.'; end if;
  select id into admin_profile_id from public.profiles where auth_user_id = auth.uid();

  insert into public.product_catalog (
    barcode, product_name, brand, category, default_unit, image_url, data_source, created_by
  ) values (
    candidate.barcode,
    trim(approved_product_name),
    nullif(trim(approved_brand), ''),
    nullif(trim(approved_category), ''),
    coalesce(nullif(trim(approved_default_unit), ''), '개'),
    nullif(trim(approved_image_url), ''),
    'admin',
    admin_profile_id
  )
  on conflict (barcode) do update set
    product_name = excluded.product_name,
    brand = excluded.brand,
    category = excluded.category,
    default_unit = excluded.default_unit,
    image_url = excluded.image_url,
    data_source = 'admin',
    created_by = excluded.created_by
  returning id into catalog_id;

  delete from public.barcode_product_submissions where id = target_submission_id;
  return catalog_id;
end;
$$;

create or replace function public.reject_barcode_product(target_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  delete from public.barcode_product_submissions where id = target_submission_id;
end;
$$;

revoke all on function public.submit_barcode_product(text, text, text, text, text, text) from public;
grant execute on function public.submit_barcode_product(text, text, text, text, text, text) to authenticated;
revoke all on function public.approve_barcode_product(uuid, text, text, text, text, text) from public;
grant execute on function public.approve_barcode_product(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.reject_barcode_product(uuid) from public;
grant execute on function public.reject_barcode_product(uuid) to authenticated;
