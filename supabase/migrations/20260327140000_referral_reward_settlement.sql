alter table public.referral_trade_rewards
  add column if not exists reward_token_decimals integer not null default 18,
  add column if not exists reward_amount_raw numeric(78, 0),
  add column if not exists recipient_wallet_address text,
  add column if not exists payout_tx_hash text,
  add column if not exists notification_id uuid references public.notifications (id) on delete set null,
  add column if not exists sent_at timestamptz,
  add column if not exists payout_attempted_at timestamptz,
  add column if not exists error_message text,
  add column if not exists status text not null default 'recorded';

update public.referral_trade_rewards reward
set
  recipient_wallet_address = lower(nullif(trim(coalesce(profile.wallet_address, '')), '')),
  reward_amount_raw = coalesce(
    reward.reward_amount_raw,
    trunc(
      reward.reward_amount * power(10::numeric, coalesce(reward.reward_token_decimals, 18))
    )
  ),
  status = coalesce(nullif(trim(reward.status), ''), 'recorded')
from public.profiles profile
where profile.id = reward.referrer_id
  and (
    reward.recipient_wallet_address is null
    or reward.reward_amount_raw is null
    or reward.status is null
    or trim(reward.status) = ''
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'referral_trade_rewards_status_check'
  ) then
    alter table public.referral_trade_rewards
      add constraint referral_trade_rewards_status_check check (
        status in ('recorded', 'paid', 'failed')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'referral_trade_rewards_wallet_format'
  ) then
    alter table public.referral_trade_rewards
      add constraint referral_trade_rewards_wallet_format check (
        recipient_wallet_address is null
        or recipient_wallet_address ~* '^0x[a-f0-9]{40}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'referral_trade_rewards_decimals_valid'
  ) then
    alter table public.referral_trade_rewards
      add constraint referral_trade_rewards_decimals_valid check (
        reward_token_decimals between 0 and 36
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'referral_trade_rewards_amount_raw_non_negative'
  ) then
    alter table public.referral_trade_rewards
      add constraint referral_trade_rewards_amount_raw_non_negative check (
        reward_amount_raw is null or reward_amount_raw >= 0
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'referral_trade_rewards_payout_tx_hash_format'
  ) then
    alter table public.referral_trade_rewards
      add constraint referral_trade_rewards_payout_tx_hash_format check (
        payout_tx_hash is null or payout_tx_hash ~ '^0x[a-fA-F0-9]{64}$'
      );
  end if;
end
$$;

create index if not exists referral_trade_rewards_payout_idx
  on public.referral_trade_rewards (status, payout_attempted_at asc, created_at asc);

create index if not exists referral_trade_rewards_wallet_idx
  on public.referral_trade_rewards (recipient_wallet_address, sent_at desc)
  where recipient_wallet_address is not null;

create or replace function public.record_referral_trade_reward(
  input_profile_id uuid,
  input_coin_address text,
  input_coin_symbol text,
  input_trade_side text,
  input_trade_amount_in numeric,
  input_trade_amount_out numeric,
  input_tx_hash text,
  input_chain_id integer default 8453
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_side text := lower(nullif(trim(input_trade_side), ''));
  normalized_symbol text := upper(coalesce(nullif(trim(input_coin_symbol), ''), 'COIN'));
  normalized_tx_hash text := lower(nullif(trim(input_tx_hash), ''));
  target_event public.referral_events%rowtype;
  referred_profile public.profiles%rowtype;
  referrer_profile public.profiles%rowtype;
  existing_reward public.referral_trade_rewards%rowtype;
  reward_basis numeric(36, 18);
  reward_amount numeric(36, 18);
  reward_amount_raw numeric(78, 0);
  reward_percent numeric(7, 4);
  actor_label text;
begin
  if input_profile_id is null then
    raise exception 'Profile id is required.';
  end if;

  if normalized_side not in ('buy', 'sell') then
    raise exception 'Trade side must be buy or sell.';
  end if;

  if normalized_tx_hash is null then
    raise exception 'A transaction hash is required.';
  end if;

  select *
  into existing_reward
  from public.referral_trade_rewards
  where tx_hash = normalized_tx_hash
  limit 1;

  if existing_reward.id is not null then
    return jsonb_build_object(
      'rewardGranted', false,
      'reason', 'duplicate_transaction',
      'tradeRewardId', existing_reward.id
    );
  end if;

  select *
  into target_event
  from public.referral_events
  where referred_profile_id = input_profile_id
  order by created_at asc
  limit 1;

  if target_event.id is null then
    return jsonb_build_object(
      'rewardGranted', false,
      'reason', 'no_referral'
    );
  end if;

  if target_event.status = 'rewarded'
    or exists (
      select 1
      from public.referral_trade_rewards trade_reward
      where trade_reward.referral_event_id = target_event.id
    ) then
    return jsonb_build_object(
      'rewardGranted', false,
      'reason', 'already_rewarded',
      'eventId', target_event.id
    );
  end if;

  select *
  into referred_profile
  from public.profiles
  where id = input_profile_id;

  select *
  into referrer_profile
  from public.profiles
  where id = target_event.referrer_id;

  reward_basis := case
    when normalized_side = 'buy' then greatest(coalesce(input_trade_amount_out, 0), 0)
    else greatest(coalesce(input_trade_amount_in, 0), 0)
  end;
  reward_amount := round((reward_basis * target_event.bonus_bps::numeric / 10000), 18);
  reward_amount_raw := trunc(reward_amount * power(10::numeric, 18));
  reward_percent := round((target_event.bonus_bps::numeric / 100), 4);

  insert into public.referral_trade_rewards (
    referral_event_id,
    referrer_id,
    referred_profile_id,
    coin_address,
    coin_symbol,
    trade_side,
    trade_amount_in,
    trade_amount_out,
    reward_amount,
    reward_amount_raw,
    reward_percent,
    reward_token_decimals,
    recipient_wallet_address,
    status,
    tx_hash,
    chain_id,
    metadata
  )
  values (
    target_event.id,
    target_event.referrer_id,
    input_profile_id,
    input_coin_address,
    normalized_symbol,
    normalized_side,
    greatest(coalesce(input_trade_amount_in, 0), 0),
    greatest(coalesce(input_trade_amount_out, 0), 0),
    reward_amount,
    reward_amount_raw,
    reward_percent,
    18,
    lower(nullif(trim(coalesce(referrer_profile.wallet_address, '')), '')),
    'recorded',
    normalized_tx_hash,
    coalesce(input_chain_id, 8453),
    jsonb_build_object(
      'bonusBps',
      target_event.bonus_bps
    )
  )
  returning *
  into existing_reward;

  update public.referral_events
  set
    status = 'rewarded',
    reward_e1xp = greatest(coalesce(reward_e1xp, 0), 100),
    rewarded_at = timezone('utc', now()),
    first_trade_tx_hash = normalized_tx_hash,
    referred_trade_count = coalesce(referred_trade_count, 0) + 1
  where id = target_event.id
  returning *
  into target_event;

  insert into public.e1xp_ledger (
    profile_id,
    source,
    source_key,
    amount,
    description,
    metadata
  )
  values (
    target_event.referrer_id,
    'referral',
    format('trade:%s', target_event.id),
    50,
    'Referral trade reward',
    jsonb_build_object(
      'referralEventId',
      target_event.id,
      'referredProfileId',
      input_profile_id,
      'tradeRewardId',
      existing_reward.id,
      'coinSymbol',
      normalized_symbol,
      'rewardAmount',
      reward_amount
    )
  );

  actor_label := coalesce(
    nullif(referred_profile.display_name, ''),
    nullif(referred_profile.username, ''),
    'Your referral'
  );

  perform public.create_notification(
    target_event.referrer_id,
    input_profile_id,
    'referral',
    'Referral reward unlocked',
    format(
      '%s completed a trade. You unlocked %s %s and 50 E1XP.',
      actor_label,
      trim(trailing '.' from trim(trailing '0' from reward_amount::text)),
      normalized_symbol
    ),
    null,
    existing_reward.id::text,
    jsonb_build_object(
      'tradeRewardId',
      existing_reward.id,
      'rewardAmount',
      reward_amount,
      'rewardPercent',
      reward_percent,
      'coinSymbol',
      normalized_symbol,
      'deliveryStatus',
      existing_reward.status,
      'txHash',
      normalized_tx_hash,
      'e1xpAwarded',
      50
    )
  );

  return jsonb_build_object(
    'rewardGranted', true,
    'eventId', target_event.id,
    'tradeRewardId', existing_reward.id,
    'rewardAmount', reward_amount,
    'rewardPercent', reward_percent,
    'rewardSymbol', normalized_symbol,
    'rewardStatus', existing_reward.status,
    'e1xpAwarded', 50
  );
end;
$$;

create or replace function public.list_profile_reward_tokens(
  input_profile_id uuid
)
returns table (
  last_received_at timestamptz,
  reward_count integer,
  token_address text,
  token_decimals integer,
  token_symbol text
)
language sql
stable
security definer
set search_path = public
as $$
  with reward_tokens as (
    select
      lower(allocation.coin_address) as token_address,
      allocation.coin_symbol as token_symbol,
      allocation.reward_token_decimals as token_decimals,
      coalesce(allocation.sent_at, allocation.created_at) as created_at
    from public.collaboration_earning_allocations allocation
    where allocation.profile_id = input_profile_id
      and allocation.status = 'paid'

    union all

    select
      lower(distribution.reward_token_address) as token_address,
      distribution.reward_token_symbol as token_symbol,
      distribution.reward_token_decimals as token_decimals,
      coalesce(distribution.sent_at, distribution.created_at) as created_at
    from public.fandrop_reward_distributions distribution
    where distribution.recipient_profile_id = input_profile_id
      and distribution.status = 'sent'

    union all

    select
      lower(reward.coin_address) as token_address,
      reward.coin_symbol as token_symbol,
      reward.reward_token_decimals as token_decimals,
      coalesce(reward.sent_at, reward.created_at) as created_at
    from public.referral_trade_rewards reward
    where reward.referrer_id = input_profile_id
      and reward.status = 'paid'
  )
  select
    max(reward_tokens.created_at) as last_received_at,
    count(*)::integer as reward_count,
    reward_tokens.token_address,
    min(reward_tokens.token_decimals)::integer as token_decimals,
    min(reward_tokens.token_symbol) as token_symbol
  from reward_tokens
  group by reward_tokens.token_address
  order by max(reward_tokens.created_at) desc, min(reward_tokens.token_symbol);
$$;

create or replace function public.list_profile_wallet_activity(
  input_profile_id uuid
)
returns table (
  activity_id text,
  activity_kind text,
  amount numeric,
  created_at timestamptz,
  source_name text,
  status text,
  target_key text,
  token_address text,
  token_symbol text,
  tx_hash text
)
language sql
stable
security definer
set search_path = public
as $$
  with wallet_activity as (
    select
      allocation.id::text as activity_id,
      'collaboration_payout'::text as activity_kind,
      allocation.amount,
      coalesce(allocation.sent_at, allocation.created_at) as created_at,
      collaboration.title as source_name,
      allocation.status,
      ('/coins/' || lower(allocation.coin_address))::text as target_key,
      lower(allocation.coin_address) as token_address,
      allocation.coin_symbol as token_symbol,
      allocation.tx_hash
    from public.collaboration_earning_allocations allocation
    inner join public.creator_collaborations collaboration
      on collaboration.id = allocation.collaboration_id
    where allocation.profile_id = input_profile_id
      and allocation.status = 'paid'

    union all

    select
      distribution.id::text as activity_id,
      'fandrop_reward'::text as activity_kind,
      distribution.reward_amount as amount,
      coalesce(distribution.sent_at, distribution.created_at) as created_at,
      mission.title as source_name,
      distribution.status::text as status,
      ('/fandrop/' || mission.slug)::text as target_key,
      lower(distribution.reward_token_address) as token_address,
      distribution.reward_token_symbol as token_symbol,
      distribution.tx_hash
    from public.fandrop_reward_distributions distribution
    inner join public.missions mission
      on mission.id = distribution.mission_id
    where distribution.recipient_profile_id = input_profile_id
      and distribution.status = 'sent'

    union all

    select
      reward.id::text as activity_id,
      'referral_reward'::text as activity_kind,
      reward.reward_amount as amount,
      coalesce(reward.sent_at, reward.created_at) as created_at,
      coalesce(referred.display_name, referred.username, 'Referral bonus') as source_name,
      reward.status,
      ('/coins/' || lower(reward.coin_address))::text as target_key,
      lower(reward.coin_address) as token_address,
      reward.coin_symbol as token_symbol,
      reward.payout_tx_hash as tx_hash
    from public.referral_trade_rewards reward
    left join public.profiles referred
      on referred.id = reward.referred_profile_id
    where reward.referrer_id = input_profile_id
      and reward.status = 'paid'
  )
  select
    wallet_activity.activity_id,
    wallet_activity.activity_kind,
    wallet_activity.amount,
    wallet_activity.created_at,
    wallet_activity.source_name,
    wallet_activity.status,
    wallet_activity.target_key,
    wallet_activity.token_address,
    wallet_activity.token_symbol,
    wallet_activity.tx_hash
  from wallet_activity
  order by wallet_activity.created_at desc, wallet_activity.activity_id desc;
$$;

grant execute on function public.list_profile_reward_tokens(uuid) to anon, authenticated;
grant execute on function public.list_profile_wallet_activity(uuid) to anon, authenticated;

comment on function public.list_profile_reward_tokens(uuid) is
  'Returns distinct reward token contracts received by a profile so the wallet can include them in holdings queries, including referral rewards.';

comment on function public.list_profile_wallet_activity(uuid) is
  'Returns sent reward activity from referral, FanDrop, and collaboration payouts for wallet history views.';
