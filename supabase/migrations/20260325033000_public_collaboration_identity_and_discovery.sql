create or replace function public.list_public_coin_collaborations(
  input_coin_addresses text[] default null
)
returns table (
  collaboration_id uuid,
  coin_address text,
  title text,
  ticker text,
  description text,
  cover_image_url text,
  launch_id uuid,
  launched_at timestamptz,
  owner_id uuid,
  owner_username text,
  owner_display_name text,
  owner_avatar_url text,
  active_member_count integer,
  members jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized_addresses as (
    select distinct lower(nullif(trim(address_value), '')) as coin_address
    from unnest(coalesce(input_coin_addresses, array[]::text[])) as address_value
    where nullif(trim(address_value), '') is not null
  ),
  launched_collaborations as (
    select
      collaboration.id as collaboration_id,
      lower(launch.coin_address) as coin_address,
      collaboration.title,
      launch.ticker,
      collaboration.description,
      launch.cover_image_url,
      launch.id as launch_id,
      launch.launched_at,
      collaboration.owner_id,
      owner.username as owner_username,
      owner.display_name as owner_display_name,
      owner.avatar_url as owner_avatar_url
    from public.creator_collaborations collaboration
    inner join public.creator_launches launch
      on launch.id = collaboration.launch_id
    inner join public.profiles owner
      on owner.id = collaboration.owner_id
    where collaboration.status = 'active'
      and launch.status = 'launched'
      and nullif(trim(coalesce(launch.coin_address, '')), '') is not null
      and (
        input_coin_addresses is null
        or cardinality(input_coin_addresses) = 0
        or exists (
          select 1
          from normalized_addresses address_filter
          where address_filter.coin_address = lower(launch.coin_address)
        )
      )
  )
  select
    collaboration.collaboration_id,
    collaboration.coin_address,
    collaboration.title,
    collaboration.ticker,
    collaboration.description,
    collaboration.cover_image_url,
    collaboration.launch_id,
    collaboration.launched_at,
    collaboration.owner_id,
    collaboration.owner_username,
    collaboration.owner_display_name,
    collaboration.owner_avatar_url,
    (
      select count(*)
      from public.creator_collaboration_members member_count
      where member_count.collaboration_id = collaboration.collaboration_id
        and member_count.status = 'active'
    )::integer as active_member_count,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'acceptedAt', member.accepted_terms_at,
            'avatarUrl', profile.avatar_url,
            'displayName', profile.display_name,
            'inviteExpiresAt', member.invite_expires_at,
            'joinedAt', member.joined_at,
            'note', member.note,
            'profileId', member.profile_id,
            'role', member.role,
            'splitPercent', member.split_percent,
            'status', member.status,
            'username', profile.username,
            'walletAddress', profile.wallet_address
          )
          order by case when member.role = 'owner' then 0 else 1 end, member.created_at
        )
        from public.creator_collaboration_members member
        inner join public.profiles profile
          on profile.id = member.profile_id
        where member.collaboration_id = collaboration.collaboration_id
          and member.status = 'active'
      ),
      '[]'::jsonb
    ) as members
  from launched_collaborations collaboration
  order by collaboration.launched_at desc nulls last, collaboration.title asc;
$$;

create or replace function public.list_public_collaboration_coins(
  input_limit integer default 24,
  input_offset integer default 0
)
returns table (
  collaboration_id uuid,
  coin_address text,
  title text,
  ticker text,
  description text,
  cover_image_url text,
  launch_id uuid,
  launched_at timestamptz,
  owner_id uuid,
  owner_username text,
  owner_display_name text,
  owner_avatar_url text,
  active_member_count integer,
  members jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    collaboration.collaboration_id,
    collaboration.coin_address,
    collaboration.title,
    collaboration.ticker,
    collaboration.description,
    collaboration.cover_image_url,
    collaboration.launch_id,
    collaboration.launched_at,
    collaboration.owner_id,
    collaboration.owner_username,
    collaboration.owner_display_name,
    collaboration.owner_avatar_url,
    collaboration.active_member_count,
    collaboration.members
  from public.list_public_coin_collaborations(null::text[]) collaboration
  order by collaboration.launched_at desc nulls last, collaboration.title asc
  limit greatest(coalesce(input_limit, 24), 1)
  offset greatest(coalesce(input_offset, 0), 0);
$$;

create or replace function public.complete_collaboration_coin_launch(
  input_profile_id uuid,
  input_collaboration_id uuid,
  input_coin_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_coin_address text := lower(nullif(trim(input_coin_address), ''));
  collaboration_record public.creator_collaborations%rowtype;
  launch_record public.creator_launches%rowtype;
  collaborator_member public.creator_collaboration_members%rowtype;
  owner_profile public.profiles%rowtype;
  follower_recipient record;
  created_notification_id uuid;
begin
  if input_profile_id is null then
    raise exception 'Profile is required.'
      using errcode = '23502';
  end if;

  if input_collaboration_id is null then
    raise exception 'Collaboration is required.'
      using errcode = '23502';
  end if;

  if normalized_coin_address is null then
    raise exception 'Coin address is required.'
      using errcode = '23502';
  end if;

  if normalized_coin_address !~ '^0x[a-f0-9]{40}$' then
    raise exception 'Coin address must be a valid Base address.'
      using errcode = '22P02';
  end if;

  select *
  into collaboration_record
  from public.creator_collaborations
  where id = input_collaboration_id;

  if not found then
    raise exception 'Collaboration was not found.'
      using errcode = 'P0002';
  end if;

  if collaboration_record.owner_id <> input_profile_id then
    raise exception 'Only the collaboration creator can launch this coin.'
      using errcode = '22023';
  end if;

  if collaboration_record.status not in ('open', 'active') then
    raise exception 'This collaboration is not ready to launch.'
      using errcode = '22023';
  end if;

  select *
  into launch_record
  from public.creator_launches
  where id = collaboration_record.launch_id;

  if not found then
    raise exception 'Launch draft was not found for this collaboration.'
      using errcode = 'P0002';
  end if;

  if nullif(trim(coalesce(launch_record.coin_address, '')), '') is not null then
    raise exception 'This collaboration coin has already been launched.'
      using errcode = '22023';
  end if;

  if launch_record.status not in ('ready', 'launching', 'draft') then
    raise exception 'This launch is not in a launchable state.'
      using errcode = '22023';
  end if;

  update public.creator_launches
  set coin_address = normalized_coin_address,
      status = 'launched',
      launch_error = null,
      launched_at = timezone('utc', now())
  where id = launch_record.id;

  update public.creator_collaborations
  set status = 'active'
  where id = collaboration_record.id;

  select *
  into owner_profile
  from public.profiles
  where id = collaboration_record.owner_id;

  for collaborator_member in
    select *
    from public.creator_collaboration_members member
    where member.collaboration_id = collaboration_record.id
      and member.role <> 'owner'
      and member.status = 'active'
  loop
    created_notification_id := public.create_notification(
      collaborator_member.profile_id,
      collaboration_record.owner_id,
      'system',
      'Collaboration coin launched',
      format(
        '%s launched "%s" and the shared coin is now live.',
        coalesce(
          nullif(trim(owner_profile.display_name), ''),
          nullif(trim(owner_profile.username), ''),
          'The creator'
        ),
        collaboration_record.title
      ),
      null,
      collaboration_record.id::text,
      jsonb_build_object(
        'coinAddress', normalized_coin_address,
        'collaborationId', collaboration_record.id,
        'launchId', launch_record.id
      )
    );
  end loop;

  for follower_recipient in
    with active_members as (
      select
        member.profile_id,
        profile.display_name,
        profile.username
      from public.creator_collaboration_members member
      inner join public.profiles profile
        on profile.id = member.profile_id
      where member.collaboration_id = collaboration_record.id
        and member.status = 'active'
    ),
    follower_candidates as (
      select distinct on (profile_follow.follower_id)
        profile_follow.follower_id as recipient_id,
        active_member.profile_id as actor_profile_id,
        coalesce(
          nullif(trim(active_member.display_name), ''),
          nullif(trim(active_member.username), ''),
          'A creator you follow'
        ) as actor_label
      from public.profile_follows profile_follow
      inner join active_members active_member
        on active_member.profile_id = profile_follow.followed_id
      where not exists (
        select 1
        from active_members active_member_lookup
        where active_member_lookup.profile_id = profile_follow.follower_id
      )
      order by
        profile_follow.follower_id,
        case when active_member.profile_id = collaboration_record.owner_id then 0 else 1 end,
        active_member.profile_id
    )
    select
      candidate.recipient_id,
      candidate.actor_profile_id,
      candidate.actor_label
    from follower_candidates candidate
  loop
    perform public.create_notification(
      follower_recipient.recipient_id,
      follower_recipient.actor_profile_id,
      'system',
      'Followed creator launched a collab',
      format(
        '%s launched the collaboration coin "%s".',
        follower_recipient.actor_label,
        collaboration_record.title
      ),
      null,
      normalized_coin_address,
      jsonb_build_object(
        'coinAddress', normalized_coin_address,
        'collaborationId', collaboration_record.id,
        'launchId', launch_record.id
      )
    );
  end loop;

  return jsonb_build_object(
    'coinAddress', normalized_coin_address,
    'collaborationId', collaboration_record.id,
    'launchId', launch_record.id,
    'notificationId', created_notification_id,
    'status', 'active'
  );
end;
$$;

grant execute on function public.list_public_coin_collaborations(text[]) to anon, authenticated;
grant execute on function public.list_public_collaboration_coins(integer, integer) to anon, authenticated;
grant execute on function public.complete_collaboration_coin_launch(uuid, uuid, text) to anon, authenticated;

comment on function public.list_public_coin_collaborations(text[]) is
  'Returns public collaboration metadata for launched collaboration coins keyed by coin address.';

comment on function public.list_public_collaboration_coins(integer, integer) is
  'Returns launched collaboration coins for the public Explore collaboration feed.';
