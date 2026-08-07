-- 0004
-- 초대 링크 없이 방 코드만으로 입장 — 들어온 순서대로 빈 팀 슬롯의 팀장이 된다.

-- ---------------------------------------------------------------------------
-- 1. 슬롯 선점 표시
--    초대 링크로 들어왔든 방 코드로 들어왔든, 주인이 정해진 슬롯은 다시 배정되지 않는다.
-- ---------------------------------------------------------------------------
alter table public.teams
  add column if not exists claimed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. 팀 하나가 여러 개의 접속 토큰을 가질 수 있게 한다.
--    (운영자가 미리 나눠준 초대 링크를 살려둔 채, 코드로 들어온 사람에게
--     새 토큰을 하나 더 발급하기 위함)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'team_credentials_pkey' and conrelid = 'public.team_credentials'::regclass
  ) then
    alter table public.team_credentials drop constraint team_credentials_pkey;
  end if;
end $$;

alter table public.team_credentials
  add column if not exists id uuid not null default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_credentials_pkey' and conrelid = 'public.team_credentials'::regclass
  ) then
    alter table public.team_credentials add constraint team_credentials_pkey primary key (id);
  end if;
end $$;

create index if not exists idx_team_credentials_team on public.team_credentials(team_id);
create unique index if not exists idx_team_credentials_hash_uniq
  on public.team_credentials(join_token_hash);

-- ---------------------------------------------------------------------------
-- 3. 초대 링크 입장도 슬롯을 선점 처리한다.
-- ---------------------------------------------------------------------------
create or replace function public.join_team(p_room_code text, p_join_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  v_team := _require_team(p_room_code, p_join_token_hash);

  update teams
  set is_connected = true,
      last_seen_at = now(),
      claimed_at = coalesce(claimed_at, now()),
      updated_at = now()
  where id = v_team.id;

  perform _log_event(v_team.room_id, 'TEAM_JOINED', 'team', v_team.id, '{}'::jsonb);

  return jsonb_build_object(
    'teamId', v_team.id,
    'roomId', v_team.room_id,
    'slotNumber', v_team.slot_number,
    'teamName', v_team.team_name,
    'captainName', v_team.captain_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 방 코드로 입장 — 빈 슬롯 중 가장 앞 번호를 선점한다.
--
--    여러 명이 동시에 눌러도 서로 다른 슬롯을 받도록 `for update skip locked`로
--    행을 잠근다. 잠긴 행은 건너뛰므로 같은 슬롯이 두 명에게 나가지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.claim_team_slot(
  p_room_code text,
  p_join_token_hash text,
  p_captain_name text default null,
  p_team_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_team teams;
begin
  select r.* into v_room from auction_rooms r where r.room_code = upper(trim(p_room_code));
  if not found then
    return jsonb_build_object('success', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if v_room.status not in ('lobby', 'ready') then
    return jsonb_build_object('success', false, 'code', 'ROOM_ALREADY_STARTED');
  end if;

  select t.* into v_team
  from teams t
  where t.room_id = v_room.id and t.claimed_at is null
  order by t.slot_number
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object('success', false, 'code', 'NO_TEAM_SLOT');
  end if;

  update teams
  set claimed_at = now(),
      is_connected = true,
      last_seen_at = now(),
      captain_name = coalesce(nullif(trim(p_captain_name), ''), captain_name),
      team_name = coalesce(nullif(trim(p_team_name), ''), team_name),
      updated_at = now()
  where id = v_team.id
  returning * into v_team;

  insert into team_credentials (team_id, join_token_hash)
  values (v_team.id, p_join_token_hash);

  perform _log_event(v_room.id, 'TEAM_JOINED_BY_CODE', 'team', v_team.id,
    jsonb_build_object('slotNumber', v_team.slot_number));

  return jsonb_build_object(
    'success', true,
    'teamId', v_team.id,
    'roomId', v_room.id,
    'roomCode', v_room.room_code,
    'slotNumber', v_team.slot_number,
    'teamName', v_team.team_name,
    'captainName', v_team.captain_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 방 코드 입장 가능 여부 — 홈 화면에서 코드 확인용 (토큰 없이 조회 가능)
-- ---------------------------------------------------------------------------
create or replace function public.get_room_join_info(p_room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_open int;
begin
  select r.* into v_room from auction_rooms r where r.room_code = upper(trim(p_room_code));
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select count(*) into v_open from teams
  where room_id = v_room.id and claimed_at is null;

  return jsonb_build_object(
    'found', true,
    'roomCode', v_room.room_code,
    'name', v_room.name,
    'hostName', v_room.host_name,
    'status', v_room.status,
    'openSlots', v_open,
    'teamCount', v_room.team_count
  );
end;
$$;
