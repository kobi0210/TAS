-- 경매 핵심 로직 RPC 함수
-- 모든 함수는 security definer로 실행되며, Next.js 서버가 TOKEN_HASH_SECRET으로
-- HMAC-SHA256 해시한 토큰 해시를 전달받아 credentials 테이블과 대조한다.

-- 서버 시간 조회 (클라이언트 시계 오프셋 보정용)
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

-- 내부 헬퍼: 이벤트 기록
create or replace function public._log_event(
  p_room_id uuid,
  p_event_type text,
  p_actor_type text,
  p_actor_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into auction_events (room_id, event_type, actor_type, actor_id, payload)
  values (p_room_id, p_event_type, p_actor_type, p_actor_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- 내부 헬퍼: 운영자 검증
create or replace function public._require_host(p_room_code text, p_host_token_hash text)
returns public.auction_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
begin
  select r.* into v_room from auction_rooms r where r.room_code = p_room_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if not exists (
    select 1 from room_credentials c
    where c.room_id = v_room.id and c.host_token_hash = p_host_token_hash
  ) then
    raise exception 'INVALID_TOKEN';
  end if;
  return v_room;
end;
$$;

-- 내부 헬퍼: 팀장 검증
create or replace function public._require_team(p_room_code text, p_join_token_hash text)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  select t.* into v_team
  from teams t
  join auction_rooms r on r.id = t.room_id
  join team_credentials c on c.team_id = t.id
  where r.room_code = p_room_code and c.join_token_hash = p_join_token_hash;
  if not found then
    raise exception 'INVALID_TOKEN';
  end if;
  return v_team;
end;
$$;

-- 경매방 생성: 방 + 팀 슬롯 + 토큰 해시를 한 트랜잭션으로 생성
create or replace function public.create_room(
  p_name text,
  p_host_name text,
  p_team_count int,
  p_starting_points int,
  p_max_players_per_team int,
  p_default_starting_bid int,
  p_bid_increment int,
  p_auction_duration_seconds int,
  p_extension_threshold_seconds int,
  p_extension_seconds int,
  p_allow_self_raise boolean,
  p_room_code text,
  p_host_token_hash text,
  p_team_token_hashes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_team_id uuid;
  v_team_ids uuid[] := '{}';
  i int;
begin
  if array_length(p_team_token_hashes, 1) is distinct from p_team_count then
    raise exception 'INTERNAL_ERROR';
  end if;

  insert into auction_rooms (
    room_code, name, host_name, team_count, starting_points, max_players_per_team,
    default_starting_bid, bid_increment, auction_duration_seconds,
    extension_threshold_seconds, extension_seconds, allow_self_raise
  ) values (
    p_room_code, p_name, p_host_name, p_team_count, p_starting_points, p_max_players_per_team,
    p_default_starting_bid, p_bid_increment, p_auction_duration_seconds,
    p_extension_threshold_seconds, p_extension_seconds, p_allow_self_raise
  ) returning id into v_room_id;

  insert into room_credentials (room_id, host_token_hash)
  values (v_room_id, p_host_token_hash);

  for i in 1..p_team_count loop
    insert into teams (
      room_id, slot_number, team_name, captain_name,
      starting_points, remaining_points, max_players
    ) values (
      v_room_id, i, format('%s팀', i), '미정',
      p_starting_points, p_starting_points, p_max_players_per_team
    ) returning id into v_team_id;

    insert into team_credentials (team_id, join_token_hash)
    values (v_team_id, p_team_token_hashes[i]);

    v_team_ids := v_team_ids || v_team_id;
  end loop;

  perform _log_event(v_room_id, 'ROOM_CREATED', 'host', null, jsonb_build_object('name', p_name));

  return jsonb_build_object(
    'roomId', v_room_id,
    'roomCode', p_room_code,
    'teamIds', to_jsonb(v_team_ids)
  );
end;
$$;

-- 팀장 입장 (토큰 검증 + 접속 표시)
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
  set is_connected = true, last_seen_at = now(), updated_at = now()
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

-- 팀 정보 수정 (운영자는 모든 팀, 팀장은 자기 팀만)
create or replace function public.update_team_info(
  p_room_code text,
  p_token_hash text,
  p_is_host boolean,
  p_team_id uuid,
  p_team_name text,
  p_captain_name text
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
  if p_is_host then
    v_room := _require_host(p_room_code, p_token_hash);
    select * into v_team from teams where id = p_team_id and room_id = v_room.id;
    if not found then
      raise exception 'TEAM_NOT_FOUND';
    end if;
  else
    v_team := _require_team(p_room_code, p_token_hash);
    if v_team.id is distinct from p_team_id then
      raise exception 'INVALID_TOKEN';
    end if;
  end if;

  update teams
  set team_name = coalesce(nullif(trim(p_team_name), ''), team_name),
      captain_name = coalesce(nullif(trim(p_captain_name), ''), captain_name),
      updated_at = now()
  where id = v_team.id;

  return jsonb_build_object('success', true);
end;
$$;

-- 준비 완료 토글
create or replace function public.set_team_ready(
  p_room_code text,
  p_join_token_hash text,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
begin
  v_team := _require_team(p_room_code, p_join_token_hash);

  update teams set is_ready = p_ready, updated_at = now() where id = v_team.id;

  if p_ready then
    perform _log_event(v_team.room_id, 'TEAM_READY', 'team', v_team.id, '{}'::jsonb);
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- 접속 하트비트
create or replace function public.team_heartbeat(p_room_code text, p_join_token_hash text)
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
  set is_connected = true, last_seen_at = now(), updated_at = now()
  where id = v_team.id;
  return jsonb_build_object('success', true);
end;
$$;

-- 선수 등록/수정 (운영자 전용)
create or replace function public.upsert_player(
  p_room_code text,
  p_host_token_hash text,
  p_player_id uuid,          -- null이면 신규 등록
  p_name text,
  p_nickname text,
  p_position text,
  p_tier text,
  p_description text,
  p_image_url text,
  p_starting_bid int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_id uuid;
  v_next_order int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  if p_player_id is null then
    select coalesce(max(auction_order), 0) + 1 into v_next_order
    from players where room_id = v_room.id;

    insert into players (room_id, name, nickname, position, tier, description, image_url, starting_bid, auction_order)
    values (
      v_room.id, p_name, p_nickname, p_position, p_tier, p_description, p_image_url,
      coalesce(p_starting_bid, v_room.default_starting_bid), v_next_order
    ) returning id into v_id;
  else
    update players
    set name = p_name,
        nickname = p_nickname,
        position = p_position,
        tier = p_tier,
        description = p_description,
        image_url = p_image_url,
        starting_bid = coalesce(p_starting_bid, starting_bid),
        updated_at = now()
    where id = p_player_id and room_id = v_room.id and status in ('pending', 'unsold', 'cancelled')
    returning id into v_id;
    if v_id is null then
      raise exception 'PLAYER_NOT_EDITABLE';
    end if;
  end if;

  return jsonb_build_object('success', true, 'playerId', v_id);
end;
$$;

-- 선수 삭제 (운영자 전용, 경매 전 상태만)
create or replace function public.delete_player(
  p_room_code text,
  p_host_token_hash text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_deleted uuid;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  delete from players
  where id = p_player_id and room_id = v_room.id and status in ('pending', 'unsold', 'cancelled')
  returning id into v_deleted;
  if v_deleted is null then
    raise exception 'PLAYER_NOT_EDITABLE';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- 선수 순서 일괄 변경 (운영자 전용)
create or replace function public.reorder_players(
  p_room_code text,
  p_host_token_hash text,
  p_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  i int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  -- unique(room_id, auction_order) 충돌을 피하기 위해 임시 음수 순서로 옮긴 뒤 재배치
  update players set auction_order = -auction_order
  where room_id = v_room.id and id = any(p_player_ids);

  for i in 1..array_length(p_player_ids, 1) loop
    update players set auction_order = i, updated_at = now()
    where id = p_player_ids[i] and room_id = v_room.id;
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

-- 선수 경매 시작 (운영자 전용)
create or replace function public.start_player_auction(
  p_room_code text,
  p_host_token_hash text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_player players;
  v_auction_id uuid;
  v_ends_at timestamptz;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  -- 방 행 잠금으로 동시 시작 방지
  perform 1 from auction_rooms where id = v_room.id for update;

  if exists (
    select 1 from auctions
    where room_id = v_room.id and status in ('active', 'paused')
  ) then
    raise exception 'AUCTION_ALREADY_RUNNING';
  end if;

  select * into v_player from players where id = p_player_id and room_id = v_room.id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_player.status <> 'pending' then
    raise exception 'PLAYER_NOT_PENDING';
  end if;

  v_ends_at := now() + make_interval(secs => v_room.auction_duration_seconds);

  insert into auctions (room_id, player_id, status, started_at, ends_at)
  values (v_room.id, p_player_id, 'active', now(), v_ends_at)
  returning id into v_auction_id;

  update players set status = 'active', updated_at = now() where id = p_player_id;
  update auction_rooms set status = 'running', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_STARTED', 'host', null,
    jsonb_build_object('playerId', p_player_id, 'auctionId', v_auction_id, 'endsAt', v_ends_at));

  return jsonb_build_object(
    'success', true,
    'auctionId', v_auction_id,
    'endsAt', v_ends_at
  );
end;
$$;

-- 입찰 (팀장 전용) — 원자적 판정의 핵심 함수
create or replace function public.place_bid(
  p_room_code text,
  p_join_token_hash text,
  p_auction_id uuid,
  p_amount int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team teams;
  v_room auction_rooms;
  v_auction auctions;
  v_player players;
  v_min_bid int;
  v_roster_count int;
  v_remaining_slots int;
  v_max_affordable int;
  v_extended boolean := false;
  v_new_ends_at timestamptz;
  v_reject_code text;
begin
  v_team := _require_team(p_room_code, p_join_token_hash);
  select * into v_room from auction_rooms where id = v_team.room_id;

  -- 경매 행 잠금: 동시 입찰 직렬화
  select * into v_auction from auctions
  where id = p_auction_id and room_id = v_room.id
  for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  select * into v_player from players where id = v_auction.player_id;

  -- 검증 (실패 시에도 입찰 기록은 남긴다)
  if v_auction.status <> 'active' then
    v_reject_code := 'AUCTION_NOT_ACTIVE';
  elsif now() >= v_auction.ends_at then
    v_reject_code := 'AUCTION_ALREADY_ENDED';
  else
    v_min_bid := coalesce(v_auction.current_bid + v_room.bid_increment, v_player.starting_bid);

    select count(*) into v_roster_count
    from players where sold_team_id = v_team.id and status = 'sold';
    v_remaining_slots := v_team.max_players - v_roster_count;
    v_max_affordable := v_team.remaining_points
      - (greatest(v_remaining_slots, 1) - 1) * v_room.default_starting_bid;

    if v_remaining_slots <= 0 then
      v_reject_code := 'TEAM_ROSTER_FULL';
    elsif v_auction.highest_team_id = v_team.id and not v_room.allow_self_raise then
      v_reject_code := 'ALREADY_HIGHEST_BIDDER';
    elsif p_amount < v_min_bid then
      v_reject_code := 'BID_TOO_LOW';
    elsif v_auction.current_bid is not null
      and (p_amount - v_auction.current_bid) % v_room.bid_increment <> 0 then
      v_reject_code := 'INVALID_INCREMENT';
    elsif p_amount > v_team.remaining_points then
      v_reject_code := 'INSUFFICIENT_POINTS';
    elsif p_amount > v_max_affordable then
      v_reject_code := 'ROSTER_RESERVE_REQUIRED';
    end if;
  end if;

  if v_reject_code is not null then
    insert into bids (room_id, auction_id, player_id, team_id, amount, accepted, rejection_reason)
    values (v_room.id, p_auction_id, v_auction.player_id, v_team.id, p_amount, false, v_reject_code);

    perform _log_event(v_room.id, 'BID_REJECTED', 'team', v_team.id,
      jsonb_build_object('auctionId', p_auction_id, 'amount', p_amount, 'code', v_reject_code));

    return jsonb_build_object('success', false, 'code', v_reject_code);
  end if;

  -- 종료 임박 입찰이면 시간 연장
  v_new_ends_at := v_auction.ends_at;
  if v_auction.ends_at - now() <= make_interval(secs => v_room.extension_threshold_seconds) then
    v_new_ends_at := now() + make_interval(secs => v_room.extension_seconds);
    v_extended := true;
  end if;

  update auctions
  set current_bid = p_amount,
      highest_team_id = v_team.id,
      ends_at = v_new_ends_at,
      updated_at = now()
  where id = p_auction_id;

  insert into bids (room_id, auction_id, player_id, team_id, amount, accepted)
  values (v_room.id, p_auction_id, v_auction.player_id, v_team.id, p_amount, true);

  perform _log_event(v_room.id, 'BID_ACCEPTED', 'team', v_team.id,
    jsonb_build_object('auctionId', p_auction_id, 'amount', p_amount));
  if v_extended then
    perform _log_event(v_room.id, 'AUCTION_EXTENDED', 'system', null,
      jsonb_build_object('auctionId', p_auction_id, 'endsAt', v_new_ends_at));
  end if;

  return jsonb_build_object(
    'success', true,
    'currentBid', p_amount,
    'highestTeamId', v_team.id,
    'endsAt', v_new_ends_at,
    'extended', v_extended
  );
end;
$$;

-- 낙찰/유찰 확정 — 멱등 처리, 서버 시간 기준 판정
create or replace function public.finalize_auction(
  p_room_code text,
  p_auction_id uuid,
  p_host_token_hash text default null,  -- 운영자 강제 종료 시에만 사용
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_auction auctions;
begin
  select r.* into v_room from auction_rooms r where r.room_code = p_room_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if p_force then
    -- 강제 종료는 운영자만 가능
    perform _require_host(p_room_code, p_host_token_hash);
  end if;

  select * into v_auction from auctions
  where id = p_auction_id and room_id = v_room.id
  for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  -- 이미 종료된 경매면 기존 결과 반환 (멱등)
  if v_auction.status in ('sold', 'unsold') then
    return jsonb_build_object(
      'success', true,
      'alreadyFinalized', true,
      'status', v_auction.status,
      'soldTeamId', v_auction.highest_team_id,
      'soldPrice', v_auction.current_bid
    );
  end if;

  if v_auction.status <> 'active' then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  if not p_force and now() < v_auction.ends_at then
    raise exception 'AUCTION_NOT_ENDED';
  end if;

  if v_auction.highest_team_id is not null then
    -- 낙찰: 포인트 차감 + 선수 배정
    update teams
    set remaining_points = remaining_points - v_auction.current_bid,
        updated_at = now()
    where id = v_auction.highest_team_id;

    update players
    set status = 'sold',
        sold_team_id = v_auction.highest_team_id,
        sold_price = v_auction.current_bid,
        updated_at = now()
    where id = v_auction.player_id;

    update auctions
    set status = 'sold', sold_at = now(), updated_at = now()
    where id = p_auction_id;

    perform _log_event(v_room.id, 'PLAYER_SOLD', case when p_force then 'host' else 'system' end, null,
      jsonb_build_object(
        'playerId', v_auction.player_id,
        'teamId', v_auction.highest_team_id,
        'price', v_auction.current_bid
      ));

    return jsonb_build_object(
      'success', true,
      'status', 'sold',
      'soldTeamId', v_auction.highest_team_id,
      'soldPrice', v_auction.current_bid
    );
  else
    -- 유찰
    update players set status = 'unsold', updated_at = now() where id = v_auction.player_id;
    update auctions set status = 'unsold', sold_at = now(), updated_at = now() where id = p_auction_id;

    perform _log_event(v_room.id, 'PLAYER_UNSOLD', case when p_force then 'host' else 'system' end, null,
      jsonb_build_object('playerId', v_auction.player_id));

    return jsonb_build_object('success', true, 'status', 'unsold');
  end if;
end;
$$;

-- 일시정지 (운영자 전용)
create or replace function public.pause_auction(
  p_room_code text,
  p_host_token_hash text,
  p_auction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_auction auctions;
  v_remaining int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  select * into v_auction from auctions
  where id = p_auction_id and room_id = v_room.id for update;
  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_auction.status <> 'active' then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  v_remaining := greatest(0, ceil(extract(epoch from (v_auction.ends_at - now())))::int);

  update auctions
  set status = 'paused', paused_at = now(),
      remaining_seconds_when_paused = v_remaining, updated_at = now()
  where id = p_auction_id;
  update auction_rooms set status = 'paused', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_PAUSED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'remainingSeconds', v_remaining));

  return jsonb_build_object('success', true, 'remainingSeconds', v_remaining);
end;
$$;

-- 재개 (운영자 전용)
create or replace function public.resume_auction(
  p_room_code text,
  p_host_token_hash text,
  p_auction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_auction auctions;
  v_ends_at timestamptz;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  select * into v_auction from auctions
  where id = p_auction_id and room_id = v_room.id for update;
  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_auction.status <> 'paused' then
    raise exception 'AUCTION_NOT_PAUSED';
  end if;

  v_ends_at := now() + make_interval(secs => coalesce(v_auction.remaining_seconds_when_paused, 0));

  update auctions
  set status = 'active', paused_at = null,
      remaining_seconds_when_paused = null, ends_at = v_ends_at, updated_at = now()
  where id = p_auction_id;
  update auction_rooms set status = 'running', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_RESUMED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'endsAt', v_ends_at));

  return jsonb_build_object('success', true, 'endsAt', v_ends_at);
end;
$$;

-- 현재 경매 취소: 선수를 pending으로 되돌리고 경매/입찰 기록 제거 (운영자 전용)
create or replace function public.cancel_auction(
  p_room_code text,
  p_host_token_hash text,
  p_auction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_auction auctions;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  select * into v_auction from auctions
  where id = p_auction_id and room_id = v_room.id for update;
  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_auction.status not in ('active', 'paused') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  update players set status = 'pending', updated_at = now() where id = v_auction.player_id;
  -- unique(player_id) 제약 때문에 재경매를 위해 경매 행을 삭제한다 (bids는 cascade)
  delete from auctions where id = p_auction_id;

  perform _log_event(v_room.id, 'AUCTION_CANCELLED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'playerId', v_auction.player_id));

  return jsonb_build_object('success', true);
end;
$$;

-- 선수 결과 초기화: 낙찰/유찰된 선수를 다시 pending으로 (운영자 전용)
create or replace function public.reset_player(
  p_room_code text,
  p_host_token_hash text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_player players;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  select * into v_player from players
  where id = p_player_id and room_id = v_room.id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_player.status not in ('sold', 'unsold', 'cancelled') then
    raise exception 'PLAYER_NOT_RESETTABLE';
  end if;

  -- 낙찰이었다면 포인트 환불
  if v_player.status = 'sold' and v_player.sold_team_id is not null then
    update teams
    set remaining_points = remaining_points + v_player.sold_price, updated_at = now()
    where id = v_player.sold_team_id;
  end if;

  update players
  set status = 'pending', sold_team_id = null, sold_price = null, updated_at = now()
  where id = p_player_id;

  delete from auctions where player_id = p_player_id;

  perform _log_event(v_room.id, 'PLAYER_RESET', 'host', null,
    jsonb_build_object('playerId', p_player_id));

  return jsonb_build_object('success', true);
end;
$$;

-- 전체 경매 종료 (운영자 전용)
create or replace function public.complete_room(
  p_room_code text,
  p_host_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  if exists (
    select 1 from auctions where room_id = v_room.id and status in ('active', 'paused')
  ) then
    raise exception 'AUCTION_ALREADY_RUNNING';
  end if;

  update auction_rooms
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_COMPLETED', 'host', null, '{}'::jsonb);

  return jsonb_build_object('success', true);
end;
$$;
