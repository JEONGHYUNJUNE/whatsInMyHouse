-- 일반 사용자가 앱을 열 때 기한 임박/경과 알림을 최신 상태로 맞춥니다.
-- 별도 배치 서버가 없어도 동작하며, expiry_notification_deliveries의 UNIQUE 제약으로
-- 같은 상품·같은 관리 날짜에 대한 알림이 반복 생성되지 않습니다.
create or replace function public.sync_my_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid;
  item record;
  inserted_count integer := 0;
  notification_title text;
  notification_message text;
  notification_type text;
  delivery_key integer;
begin
  select id into current_profile_id
  from public.profiles
  where auth_user_id = auth.uid();

  if current_profile_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 소진·삭제되었거나 날짜가 바뀌어 더 이상 해당하지 않는 읽지 않은 알림을 정리합니다.
  delete from public.notifications notification
  where notification.profile_id = current_profile_id
    and notification.notification_type in ('expiry_upcoming', 'expiry_overdue')
    and notification.is_read = false
    and not exists (
      select 1
      from public.inventory_items inventory
      join public.kitchen_members member on member.kitchen_id = inventory.kitchen_id
      where inventory.id = notification.inventory_item_id
        and member.profile_id = current_profile_id
        and inventory.status = 'active'
        and coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date) is not null
        and exists (
          select 1
          from public.expiry_notification_deliveries delivery
          where delivery.inventory_item_id = inventory.id
            and delivery.profile_id = current_profile_id
            and delivery.target_date = coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date)
            and delivery.alert_days = case when notification.notification_type = 'expiry_overdue' then -1 else 7 end
        )
        and (
          (notification.notification_type = 'expiry_upcoming'
            and coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date) between current_date and current_date + 7)
          or
          (notification.notification_type = 'expiry_overdue'
            and coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date) < current_date)
        )
    );

  for item in
    select inventory.id,
           inventory.kitchen_id,
           inventory.product_name,
           coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date) as target_date,
           case
             when inventory.use_by_date is not null then '소비기한'
             when inventory.expiration_date is not null then '유통기한'
             else '권장 섭취일'
           end as deadline_label
    from public.inventory_items inventory
    join public.kitchen_members member on member.kitchen_id = inventory.kitchen_id
    where member.profile_id = current_profile_id
      and inventory.status = 'active'
      and coalesce(inventory.use_by_date, inventory.expiration_date, inventory.recommended_use_date) <= current_date + 7
  loop
    if item.target_date < current_date then
      notification_type := 'expiry_overdue';
      delivery_key := -1;
      notification_title := '기한이 지난 상품이 있어요';
      notification_message := item.product_name || '의 ' || item.deadline_label || '이 지났어요. 상태를 확인해 주세요.';
    else
      notification_type := 'expiry_upcoming';
      delivery_key := 7;
      notification_title := '일주일 안에 확인해 주세요';
      notification_message := case
        when item.target_date = current_date then item.product_name || '의 ' || item.deadline_label || '이 오늘까지예요.'
        else item.product_name || '의 ' || item.deadline_label || '이 ' || (item.target_date - current_date) || '일 남았어요.'
      end;
    end if;

    if not exists (
      select 1 from public.expiry_notification_deliveries delivery
      where delivery.inventory_item_id = item.id
        and delivery.profile_id = current_profile_id
        and delivery.alert_days = delivery_key
        and delivery.target_date = item.target_date
    ) then
      insert into public.notifications (
        profile_id, kitchen_id, inventory_item_id, notification_type, title, message
      ) values (
        current_profile_id, item.kitchen_id, item.id, notification_type, notification_title, notification_message
      );

      insert into public.expiry_notification_deliveries (
        inventory_item_id, profile_id, alert_days, target_date
      ) values (
        item.id, current_profile_id, delivery_key, item.target_date
      ) on conflict do nothing;

      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.sync_my_expiry_notifications() from public;
grant execute on function public.sync_my_expiry_notifications() to authenticated;
