create index if not exists mission_task_progress_claimed_at_profile_idx
  on public.mission_task_progress (claimed_at desc, profile_id, mission_task_id)
  where claimed_at is not null;

create index if not exists e1xp_ledger_streak_profile_created_idx
  on public.e1xp_ledger (profile_id, created_at desc)
  where source = 'streak';

create index if not exists explore_listing_events_recent_idx
  on public.explore_listing_events ((coalesce(listed_at, created_at)) desc);

create or replace function public.get_profile_engagement_nudge_signals(
  input_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  last_nudge_at timestamptz;
  now_utc timestamptz := timezone('utc', now());
begin
  if input_profile_id is null then
    raise exception 'profile_id is required';
  end if;

  select nudge.delivered_at
  into last_nudge_at
  from public.profile_engagement_nudges nudge
  where nudge.profile_id = input_profile_id
  order by nudge.delivered_at desc
  limit 1;

  return jsonb_build_object(
    'cooldownUntil',
    case
      when last_nudge_at is null then null
      else last_nudge_at + interval '45 minutes'
    end,
    'newDropsCount',
    coalesce(
      (
        select count(*)::integer
        from public.explore_listing_events listing
        where coalesce(listing.listed_at, listing.created_at) >=
          now_utc - interval '24 hours'
      ),
      0
    ),
    'latestLeaderboardUpdate',
    coalesce(
      (
        select jsonb_build_object(
          'id', update_item.id,
          'title', update_item.title,
          'body', update_item.body,
          'targetKey',
          coalesce(update_item.metadata ->> 'coinAddress', '/leaderboard')
        )
        from public.leaderboard_updates update_item
        where update_item.created_at >= now_utc - interval '72 hours'
        order by update_item.created_at desc
        limit 1
      ),
      'null'::jsonb
    ),
    'activeMissionCount',
    coalesce(
      (
        select count(*)::integer
        from public.missions mission
        where mission.status = 'active'
          and (mission.starts_at is null or mission.starts_at <= now_utc)
          and (mission.ends_at is null or mission.ends_at >= now_utc)
      ),
      0
    ),
    'latestMission',
    coalesce(
      (
        select jsonb_build_object(
          'id', mission.id,
          'slug', mission.slug,
          'title', mission.title,
          'rewardE1xp', mission.reward_e1xp
        )
        from public.missions mission
        where mission.status = 'active'
          and coalesce(mission.starts_at, mission.created_at) >=
            now_utc - interval '7 days'
          and (mission.starts_at is null or mission.starts_at <= now_utc)
          and (mission.ends_at is null or mission.ends_at >= now_utc)
        order by coalesce(mission.starts_at, mission.created_at) desc
        limit 1
      ),
      'null'::jsonb
    ),
    'topPerkMission',
    coalesce(
      (
        select jsonb_build_object(
          'id', mission.id,
          'slug', mission.slug,
          'title', mission.title,
          'rewardE1xp', mission.reward_e1xp
        )
        from public.missions mission
        where mission.status = 'active'
          and (mission.starts_at is null or mission.starts_at <= now_utc)
          and (mission.ends_at is null or mission.ends_at >= now_utc)
        order by mission.reward_e1xp desc, coalesce(mission.starts_at, mission.created_at) desc
        limit 1
      ),
      'null'::jsonb
    ),
    'missionWinners24h',
    coalesce(
      (
        select count(*)::integer
        from (
          select progress.profile_id
          from public.mission_task_progress progress
          join public.mission_tasks task
            on task.id = progress.mission_task_id
          join public.missions mission
            on mission.id = task.mission_id
          where progress.claimed_at >= now_utc - interval '24 hours'
            and mission.status in ('active', 'completed', 'archived')
          group by progress.profile_id
        ) as winner_profiles
      ),
      0
    ),
    'activeCreatorOfWeek',
    coalesce(
      (
        select jsonb_build_object(
          'campaignId', campaign.id,
          'category', campaign.category,
          'creatorEarningsUsd', campaign.creator_earnings_usd,
          'displayName', profile.display_name,
          'featuredPriceUsd', campaign.featured_price_usd,
          'profileId', campaign.profile_id,
          'username', profile.username,
          'walletAddress', profile.wallet_address
        )
        from public.admin_creator_of_week_campaigns campaign
        join public.profiles profile
          on profile.id = campaign.profile_id
        where campaign.is_active = true
          and (campaign.starts_at is null or campaign.starts_at <= now_utc)
          and (campaign.ends_at is null or campaign.ends_at >= now_utc)
        order by coalesce(campaign.starts_at, campaign.created_at) desc
        limit 1
      ),
      'null'::jsonb
    )
  );
end;
$$;

create or replace function public.record_daily_login_streak(
  input_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_summary public.daily_streaks%rowtype;
  current_utc_date date := timezone('utc', now())::date;
  previous_activity_date date;
  next_streak integer;
  next_longest_streak integer;
  reward_e1xp integer;
  reset_occurred boolean := false;
  already_claimed boolean := false;
  milestone_reached boolean := false;
  notification_id uuid;
begin
  if input_profile_id is null then
    raise exception 'profile_id is required';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = input_profile_id
  ) then
    raise exception 'profile not found';
  end if;

  insert into public.daily_streaks (profile_id)
  values (input_profile_id)
  on conflict (profile_id) do nothing;

  select *
  into current_summary
  from public.daily_streaks streak
  where streak.profile_id = input_profile_id
  for update;

  already_claimed := exists (
    select 1
    from public.daily_streak_events event
    where event.profile_id = input_profile_id
      and event.activity_date = current_utc_date
      and event.event_type = 'check_in'
      and coalesce(event.source_key, '') = 'daily-login'
  );

  if already_claimed then
    return jsonb_build_object(
      'claimed',
      false,
      'alreadyClaimed',
      true,
      'activityDate',
      current_utc_date,
      'currentStreak',
      coalesce(current_summary.current_streak, 0),
      'longestStreak',
      coalesce(current_summary.longest_streak, 0),
      'rewardE1xp',
      0,
      'resetOccurred',
      false,
      'milestoneReached',
      false,
      'notificationId',
      null,
      'dashboard',
      public.get_daily_streak_dashboard(input_profile_id)
    );
  end if;

  previous_activity_date := current_summary.last_activity_date;

  if previous_activity_date = current_utc_date - 1 then
    next_streak := coalesce(current_summary.current_streak, 0) + 1;
  elsif previous_activity_date = current_utc_date then
    next_streak := greatest(coalesce(current_summary.current_streak, 0), 1);
  elsif previous_activity_date is null then
    next_streak := 1;
  else
    reset_occurred := coalesce(current_summary.current_streak, 0) > 0;
    next_streak := 1;
  end if;

  next_longest_streak := greatest(
    coalesce(current_summary.longest_streak, 0),
    next_streak
  );
  reward_e1xp := public.get_daily_streak_reward_e1xp(next_streak);
  milestone_reached := reward_e1xp > 25;

  update public.daily_streaks
  set
    current_streak = next_streak,
    longest_streak = next_longest_streak,
    last_activity_date = current_utc_date
  where profile_id = input_profile_id;

  insert into public.daily_streak_events (
    profile_id,
    activity_date,
    event_type,
    source_key,
    metadata
  )
  values (
    input_profile_id,
    current_utc_date,
    'check_in',
    'daily-login',
    jsonb_build_object(
      'current_streak',
      next_streak,
      'reward_e1xp',
      reward_e1xp,
      'reset_occurred',
      reset_occurred,
      'milestone_reached',
      milestone_reached
    )
  );

  insert into public.e1xp_ledger (
    profile_id,
    source,
    source_key,
    amount,
    description,
    metadata
  )
  values (
    input_profile_id,
    'streak',
    format('daily-login:%s', current_utc_date),
    reward_e1xp,
    case
      when milestone_reached then format(
        'Daily streak milestone reward for day %s',
        next_streak
      )
      else format(
        'Daily login streak reward for day %s',
        next_streak
      )
    end,
    jsonb_build_object(
      'activity_date',
      current_utc_date,
      'current_streak',
      next_streak,
      'reset_occurred',
      reset_occurred,
      'milestone_reached',
      milestone_reached
    )
  );

  perform public.sync_streak_mission_progress(
    input_profile_id,
    next_streak,
    current_utc_date
  );

  notification_id := public.create_notification(
    input_profile_id,
    null,
    'streak',
    case
      when milestone_reached then format(
        'Day %s streak milestone unlocked',
        next_streak
      )
      else format(
        'Daily streak claimed for day %s',
        next_streak
      )
    end,
    case
      when milestone_reached then format(
        'You earned %s E1XP for keeping your Every1 streak alive.',
        reward_e1xp
      )
      else format(
        'You earned %s E1XP for logging in today.',
        reward_e1xp
      )
    end,
    null,
    format('daily-login:%s', current_utc_date),
    jsonb_build_object(
      'reward_e1xp',
      reward_e1xp,
      'current_streak',
      next_streak,
      'milestone_reached',
      milestone_reached,
      'activity_date',
      current_utc_date
    )
  );

  return jsonb_build_object(
    'claimed',
    true,
    'alreadyClaimed',
    false,
    'activityDate',
    current_utc_date,
    'currentStreak',
    next_streak,
    'longestStreak',
    next_longest_streak,
    'rewardE1xp',
    reward_e1xp,
    'resetOccurred',
    reset_occurred,
    'milestoneReached',
    milestone_reached,
    'notificationId',
    notification_id,
    'dashboard',
    public.get_daily_streak_dashboard(input_profile_id)
  );
end;
$$;
