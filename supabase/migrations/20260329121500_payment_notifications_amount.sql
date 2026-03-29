create or replace function public.notify_payment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_title text;
  notification_body text;
  amount_label text;
begin
  if new.status = old.status then
    return new;
  end if;

  amount_label := case
    when new.currency is null or trim(new.currency) = '' then
      to_char(coalesce(new.amount, 0), 'FM999G999G999G990D00')
    else
      format(
        '%s %s',
        upper(new.currency),
        to_char(coalesce(new.amount, 0), 'FM999G999G999G990D00')
      )
  end;

  if new.status = 'succeeded' then
    notification_title := 'Deposit completed';
    notification_body := format(
      'You have successfully deposited %s to your wallet.',
      amount_label
    );
  elsif new.status in ('failed', 'cancelled', 'refunded') then
    notification_title := 'Deposit updated';
    notification_body := format(
      'Your deposit of %s is %s.',
      amount_label,
      new.status
    );
  else
    return new;
  end if;

  perform public.create_notification(
    new.profile_id,
    null,
    'payment',
    notification_title,
    notification_body,
    null,
    new.checkout_reference,
    jsonb_build_object(
      'status',
      new.status,
      'provider',
      new.provider,
      'amount',
      new.amount,
      'currency',
      new.currency
    )
  );

  return new;
end;
$$;
