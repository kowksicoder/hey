create or replace function public.notify_support_transaction_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_value numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('completed', 'failed') then
    return new;
  end if;

  amount_value := round(coalesce(new.total_kobo, 0) / 100.0, 2);

  perform public.create_notification(
    new.profile_id,
    null,
    'payment',
    case
      when new.status = 'completed' then 'Buy completed'
      else 'Buy failed'
    end,
    case
      when new.status = 'completed' then 'Your coin purchase is complete.'
      else 'Your coin purchase failed.'
    end,
    null,
    new.id::text,
    jsonb_build_object(
      'status', new.status,
      'amount', amount_value,
      'currency', 'NGN',
      'transactionType', 'support',
      'coinSymbol', new.coin_symbol,
      'coinAddress', new.coin_address
    )
  );

  return new;
end;
$$;

create or replace function public.notify_sell_transaction_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_value numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('completed', 'failed') then
    return new;
  end if;

  amount_value := round(coalesce(new.net_naira_return_kobo, 0) / 100.0, 2);

  perform public.create_notification(
    new.profile_id,
    null,
    'payment',
    case
      when new.status = 'completed' then 'Sell completed'
      else 'Sell failed'
    end,
    case
      when new.status = 'completed' then 'Your coin sale is complete.'
      else 'Your coin sale failed.'
    end,
    null,
    new.id::text,
    jsonb_build_object(
      'status', new.status,
      'amount', amount_value,
      'currency', 'NGN',
      'transactionType', 'sell',
      'coinSymbol', new.coin_symbol,
      'coinAddress', new.coin_address
    )
  );

  return new;
end;
$$;

create or replace function public.notify_withdrawal_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_value numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('completed', 'failed') then
    return new;
  end if;

  amount_value := round(coalesce(new.net_amount_kobo, 0) / 100.0, 2);

  perform public.create_notification(
    new.profile_id,
    null,
    'payment',
    case
      when new.status = 'completed' then 'Withdrawal completed'
      else 'Withdrawal failed'
    end,
    case
      when new.status = 'completed' then 'Your withdrawal is complete.'
      else 'Your withdrawal failed.'
    end,
    null,
    new.id::text,
    jsonb_build_object(
      'status', new.status,
      'amount', amount_value,
      'currency', 'NGN',
      'transactionType', 'withdrawal'
    )
  );

  return new;
end;
$$;

drop trigger if exists support_transactions_notify_trade on public.support_transactions;
create trigger support_transactions_notify_trade
  after update on public.support_transactions
  for each row execute function public.notify_support_transaction_update();

drop trigger if exists sell_transactions_notify_trade on public.sell_transactions;
create trigger sell_transactions_notify_trade
  after update on public.sell_transactions
  for each row execute function public.notify_sell_transaction_update();

drop trigger if exists fiat_withdrawals_notify_trade on public.fiat_withdrawals;
create trigger fiat_withdrawals_notify_trade
  after update on public.fiat_withdrawals
  for each row execute function public.notify_withdrawal_update();
