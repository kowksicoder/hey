alter table public.creator_launches
  add column if not exists media_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_launches_media_url_format'
  ) then
    alter table public.creator_launches
      add constraint creator_launches_media_url_format check (
        media_url is null
        or media_url ~ '^https?://'
      );
  end if;
end
$$;

drop function if exists public.create_creator_coin_launch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  bigint,
  text,
  text
);

drop function if exists public.create_creator_coin_launch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  bigint,
  text,
  text,
  text
);

create or replace function public.create_creator_coin_launch(
  input_created_by_profile_id uuid,
  input_ticker text,
  input_name text,
  input_description text default null,
  input_cover_image_url text default null,
  input_metadata_uri text default null,
  input_coin_address text default null,
  input_chain_id integer default 8453,
  input_supply bigint default 10000000,
  input_post_destination text default 'every1_feed',
  input_category text default null,
  input_media_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_ticker text := lower(nullif(trim(input_ticker), ''));
  normalized_name text := nullif(trim(input_name), '');
  normalized_description text := nullif(trim(input_description), '');
  normalized_cover_image_url text := nullif(trim(input_cover_image_url), '');
  normalized_metadata_uri text := nullif(trim(input_metadata_uri), '');
  normalized_coin_address text := lower(nullif(trim(input_coin_address), ''));
  normalized_post_destination text := nullif(trim(input_post_destination), '');
  normalized_category text := nullif(trim(input_category), '');
  normalized_media_url text := nullif(trim(input_media_url), '');
  created_launch public.creator_launches%rowtype;
begin
  if input_created_by_profile_id is null then
    raise exception 'Creator profile is required.'
      using errcode = '23502';
  end if;

  if normalized_ticker is null then
    raise exception 'Ticker is required.'
      using errcode = '23502';
  end if;

  if normalized_name is null then
    raise exception 'Coin name is required.'
      using errcode = '23502';
  end if;

  if normalized_category is null then
    raise exception 'Category is required.'
      using errcode = '23502';
  end if;

  if normalized_coin_address is not null
    and normalized_coin_address !~ '^0x[a-f0-9]{40}$' then
    raise exception 'Coin address must be a valid EVM address.'
      using errcode = '22P02';
  end if;

  if normalized_media_url is not null
    and normalized_media_url !~ '^https?://' then
    raise exception 'Media link must be a valid http or https URL.'
      using errcode = '22P02';
  end if;

  insert into public.creator_launches (
    created_by,
    ticker,
    name,
    category,
    description,
    cover_image_url,
    media_url,
    metadata_uri,
    coin_address,
    chain_id,
    supply,
    post_destination,
    status,
    launched_at
  )
  values (
    input_created_by_profile_id,
    normalized_ticker,
    normalized_name,
    normalized_category,
    normalized_description,
    normalized_cover_image_url,
    normalized_media_url,
    normalized_metadata_uri,
    normalized_coin_address,
    coalesce(input_chain_id, 8453),
    greatest(coalesce(input_supply, 10000000), 1),
    coalesce(normalized_post_destination, 'every1_feed'),
    'launched',
    timezone('utc', now())
  )
  returning * into created_launch;

  return jsonb_build_object(
    'category', created_launch.category,
    'launchId', created_launch.id,
    'coinAddress', created_launch.coin_address,
    'mediaUrl', created_launch.media_url,
    'name', created_launch.name,
    'status', created_launch.status,
    'ticker', created_launch.ticker
  );
end;
$$;

grant execute on function public.create_creator_coin_launch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  bigint,
  text,
  text,
  text
) to anon, authenticated;

comment on column public.creator_launches.media_url is
  'Optional imported media or project link used for holder-gated playback or launch context.';
