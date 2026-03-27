alter table public.profiles
  add column if not exists execution_wallet_address text;

update public.profiles
set execution_wallet_address = lower(nullif(trim(execution_wallet_address), ''))
where execution_wallet_address is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_execution_wallet_address_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_execution_wallet_address_format_check
      check (
        execution_wallet_address is null
        or execution_wallet_address ~* '^0x[a-f0-9]{40}$'
      );
  end if;
end;
$$;

create unique index if not exists profiles_execution_wallet_address_unique_idx
  on public.profiles (lower(execution_wallet_address))
  where execution_wallet_address is not null;

create or replace function public.upsert_external_profile(
  input_wallet_address text default null,
  input_lens_account_address text default null,
  input_username text default null,
  input_display_name text default null,
  input_bio text default null,
  input_avatar_url text default null,
  input_banner_url text default null,
  input_zora_handle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_wallet text := lower(nullif(trim(input_wallet_address), ''));
  normalized_lens text := lower(nullif(trim(input_lens_account_address), ''));
  normalized_username text := lower(
    regexp_replace(coalesce(input_username, ''), '[^a-zA-Z0-9_]', '', 'g')
  );
  normalized_display_name text := nullif(trim(input_display_name), '');
  normalized_bio text := nullif(trim(input_bio), '');
  normalized_avatar text := nullif(trim(input_avatar_url), '');
  normalized_banner text := nullif(trim(input_banner_url), '');
  normalized_zora_handle text := lower(nullif(trim(input_zora_handle), ''));
  lens_profile public.profiles%rowtype;
  wallet_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  created_profile boolean := false;
  ensured_code text;
  total_e1xp bigint;
begin
  if normalized_wallet is null and normalized_lens is null then
    raise exception 'A wallet or lens account address is required.';
  end if;

  if normalized_username = '' or char_length(normalized_username) < 3 then
    normalized_username := null;
  end if;

  if normalized_lens is not null then
    select *
    into lens_profile
    from public.profiles
    where lower(lens_account_address) = normalized_lens
    limit 1;
  end if;

  if normalized_wallet is not null then
    select *
    into wallet_profile
    from public.profiles
    where lower(wallet_address) = normalized_wallet
    limit 1;
  end if;

  if lens_profile.id is not null
    and wallet_profile.id is not null
    and lens_profile.id <> wallet_profile.id then
    raise exception 'Conflicting profile records found for the supplied identity.';
  end if;

  target_profile := coalesce(lens_profile, wallet_profile);

  if target_profile.id is null then
    insert into public.profiles (
      username,
      display_name,
      bio,
      avatar_url,
      banner_url,
      wallet_address,
      lens_account_address,
      zora_handle
    )
    values (
      normalized_username,
      normalized_display_name,
      normalized_bio,
      normalized_avatar,
      normalized_banner,
      normalized_wallet,
      normalized_lens,
      normalized_zora_handle
    )
    returning *
    into target_profile;

    created_profile := true;
  else
    update public.profiles
    set
      username = coalesce(normalized_username, username),
      display_name = coalesce(normalized_display_name, display_name),
      bio = coalesce(normalized_bio, bio),
      avatar_url = coalesce(normalized_avatar, avatar_url),
      banner_url = coalesce(normalized_banner, banner_url),
      wallet_address = coalesce(normalized_wallet, wallet_address),
      lens_account_address = coalesce(normalized_lens, lens_account_address),
      zora_handle = coalesce(normalized_zora_handle, zora_handle)
    where id = target_profile.id
    returning *
    into target_profile;
  end if;

  ensured_code := public.ensure_referral_code_for_profile(target_profile.id);

  if created_profile then
    perform public.create_notification(
      target_profile.id,
      null,
      'welcome',
      'Welcome to Every1',
      'Your profile is live. Start discovering creators, coins, rewards, and communities.',
      null,
      null,
      jsonb_build_object(
        'eventType', 'welcome',
        'profileId', target_profile.id,
        'username', target_profile.username
      )
    );
  end if;

  select coalesce(sum(ledger.amount), 0)::bigint
  into total_e1xp
  from public.e1xp_ledger ledger
  where ledger.profile_id = target_profile.id;

  return jsonb_build_object(
    'id', target_profile.id,
    'username', target_profile.username,
    'displayName', target_profile.display_name,
    'bio', target_profile.bio,
    'avatarUrl', target_profile.avatar_url,
    'bannerUrl', target_profile.banner_url,
    'walletAddress', target_profile.wallet_address,
    'executionWalletAddress', target_profile.execution_wallet_address,
    'lensAccountAddress', target_profile.lens_account_address,
    'zoraHandle', target_profile.zora_handle,
    'referralCode', ensured_code,
    'e1xpTotal', coalesce(total_e1xp, 0),
    'verificationStatus', target_profile.verification_status,
    'verificationCategory', target_profile.verification_category,
    'verifiedAt', target_profile.verified_at
  );
end;
$$;
