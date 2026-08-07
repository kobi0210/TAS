-- 0003
-- 1) 운영자 조작 반영 지연/실패 해소 (삭제 이벤트 브로드캐스트, 상태 스냅샷 RPC, 결과 즉시 반환)
-- 2) 탭별 세션 식별 (토큰 → 역할/팀 해석)
-- 3) 무작위 순번 자동 경매
-- 4) CSV 일괄 등록 (한 트랜잭션)

-- ---------------------------------------------------------------------------
-- 1. Realtime: DELETE 이벤트에도 이전 행 전체가 실리도록 replica identity 변경.
--    경매 취소는 auctions 행을 삭제하므로, 이게 없으면 다른 참가자 화면이
--    취소된 경매를 계속 붙잡고 있게 된다.
-- ---------------------------------------------------------------------------
alter table public.auctions replica identity full;
alter table public.players replica identity full;
alter table public.teams replica identity full;

-- ---------------------------------------------------------------------------
-- 2. 자동 경매 설정 컬럼
-- ---------------------------------------------------------------------------
alter table public.auction_rooms
  add column if not exists auto_advance boolean not null default false;
alter table public.auction_rooms
  add column if not exists auto_delay_seconds int not null default 5;

-- ---------------------------------------------------------------------------
-- 3. 토큰 해시 → 세션 해석
--    쿠키는 브라우저 프로필 단위(시크릿 탭끼리도 공유)라 팀장 4명이 같은 브라우저로
--    접속하면 마지막 팀으로 덮어써진다. 탭마다 보관한 토큰을 헤더로 받아
--    이 함수로 역할/팀을 확정한다.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_room_token(
  p_room_code text,
  p_token_hash text
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
  select r.* into v_room from auction_rooms r where r.room_code = p_room_code;
  if not found then
    return null;
  end if;

  if exists (
    select 1 from room_credentials c
    where c.room_id = v_room.id and c.host_token_hash = p_token_hash
  ) then
    return jsonb_build_object('role', 'host', 'roomId', v_room.id);
  end if;

  select t.* into v_team
  from teams t
  join team_credentials c on c.team_id = t.id
  where t.room_id = v_room.id and c.join_token_hash = p_token_hash;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'role', 'team',
    'roomId', v_room.id,
    'teamId', v_team.id,
    'slotNumber', v_team.slot_number,
    'teamName', v_team.team_name,
    'captainName', v_team.captain_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. 방 전체 상태 스냅샷 — 재연결/폴링 보정용 (왕복 1회)
-- ---------------------------------------------------------------------------
create or replace function public.get_room_state(p_room_code text)
returns jsonb
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

  return jsonb_build_object(
    'serverTime', now(),
    'room', to_jsonb(v_room),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.slot_number)
      from teams t where t.room_id = v_room.id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.auction_order)
      from players p where p.room_id = v_room.id
    ), '[]'::jsonb),
    'activeAuction', (
      select to_jsonb(a) from auctions a
      where a.room_id = v_room.id and a.status in ('active', 'paused')
      order by a.started_at desc limit 1
    ),
    'recentBids', coalesce((
      select jsonb_agg(x order by (x->>'created_at') desc) from (
        select to_jsonb(b) as x from bids b
        where b.room_id = v_room.id
        order by b.created_at desc limit 20
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 경매 시작 — 시작된 경매 행 전체를 돌려줘서 클라이언트가 브로드캐스트를
--    기다리지 않고 즉시 화면을 갱신할 수 있게 한다.
-- ---------------------------------------------------------------------------
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
  v_auction auctions;
  v_ends_at timestamptz;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  -- 방 행 잠금으로 동시 시작 방지
  perform 1 from auction_rooms where id = v_room.id for update;

  if exists (
    select 1 from auctions
    where room_id = v_room.id and status in ('active', 'paused')
  ) then
    return jsonb_build_object('success', false, 'code', 'AUCTION_ALREADY_RUNNING');
  end if;

  select * into v_player from players where id = p_player_id and room_id = v_room.id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'PLAYER_NOT_FOUND');
  end if;
  if v_player.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'PLAYER_NOT_PENDING');
  end if;

  v_ends_at := now() + make_interval(secs => v_room.auction_duration_seconds);

  insert into auctions (room_id, player_id, status, started_at, ends_at)
  values (v_room.id, p_player_id, 'active', now(), v_ends_at)
  returning * into v_auction;

  update players set status = 'active', updated_at = now() where id = p_player_id;
  update auction_rooms set status = 'running', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_STARTED', 'host', null,
    jsonb_build_object('playerId', p_player_id, 'auctionId', v_auction.id, 'endsAt', v_ends_at));

  return jsonb_build_object(
    'success', true,
    'auctionId', v_auction.id,
    'endsAt', v_ends_at,
    'serverTime', now(),
    'auction', to_jsonb(v_auction)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. 무작위 순번 셔플 — 아직 경매하지 않은 선수만 섞는다.
--    이미 끝난 선수는 기존 순서를 유지한 채 앞으로 당겨진다.
-- ---------------------------------------------------------------------------
create or replace function public.shuffle_pending_players(
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
  v_ids uuid[] := '{}';
  v_pending uuid[] := '{}';
  i int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from (
    select id from players
    where room_id = v_room.id and status <> 'pending'
    order by auction_order
  ) done;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_pending from (
    select id from players
    where room_id = v_room.id and status = 'pending'
    order by random()
  ) todo;

  v_ids := v_ids || v_pending;

  -- unique(room_id, auction_order) 충돌 회피: 전체를 사용하지 않는 구간으로 밀어둔 뒤 재배치
  update players set auction_order = auction_order + 1000000 where room_id = v_room.id;

  for i in 1..coalesce(array_length(v_ids, 1), 0) loop
    update players set auction_order = i, updated_at = now() where id = v_ids[i];
  end loop;

  perform _log_event(v_room.id, 'PLAYERS_SHUFFLED', 'host', null,
    jsonb_build_object('count', coalesce(array_length(v_pending, 1), 0)));

  return jsonb_build_object('success', true, 'shuffled', coalesce(array_length(v_pending, 1), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. 다음 선수 자동 시작 — 순번상 가장 앞선 대기 선수를 시작한다.
--    자동 진행 루프가 여러 번 호출해도 안전하도록 예외 대신 코드로 응답한다.
-- ---------------------------------------------------------------------------
create or replace function public.start_next_auction(
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
  v_player_id uuid;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  perform 1 from auction_rooms where id = v_room.id for update;

  if exists (
    select 1 from auctions
    where room_id = v_room.id and status in ('active', 'paused')
  ) then
    return jsonb_build_object('success', false, 'code', 'AUCTION_ALREADY_RUNNING');
  end if;

  select id into v_player_id from players
  where room_id = v_room.id and status = 'pending'
  order by auction_order
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('success', false, 'code', 'NO_PENDING_PLAYERS');
  end if;

  return start_player_auction(p_room_code, p_host_token_hash, v_player_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 자동 진행 on/off
-- ---------------------------------------------------------------------------
create or replace function public.set_auto_advance(
  p_room_code text,
  p_host_token_hash text,
  p_enabled boolean,
  p_delay_seconds int default null
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

  update auction_rooms
  set auto_advance = p_enabled,
      auto_delay_seconds = coalesce(p_delay_seconds, auto_delay_seconds),
      updated_at = now()
  where id = v_room.id;

  perform _log_event(v_room.id, case when p_enabled then 'AUTO_ON' else 'AUTO_OFF' end, 'host', null, '{}'::jsonb);

  return jsonb_build_object('success', true, 'autoAdvance', p_enabled);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. CSV 일괄 등록 — 행마다 API를 왕복하지 않고 한 트랜잭션으로 처리
-- ---------------------------------------------------------------------------
create or replace function public.import_players(
  p_room_code text,
  p_host_token_hash text,
  p_players jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_next_order int;
  v_row jsonb;
  v_name text;
  v_inserted int := 0;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  if jsonb_typeof(p_players) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(max(auction_order), 0) into v_next_order
  from players where room_id = v_room.id;

  for v_row in select * from jsonb_array_elements(p_players) loop
    v_name := trim(coalesce(v_row->>'name', ''));
    continue when v_name = '';

    v_next_order := v_next_order + 1;
    insert into players (
      room_id, name, nickname, position, tier, description, image_url,
      starting_bid, auction_order
    ) values (
      v_room.id,
      left(v_name, 30),
      nullif(trim(coalesce(v_row->>'nickname', '')), ''),
      nullif(trim(coalesce(v_row->>'position', '')), ''),
      nullif(trim(coalesce(v_row->>'tier', '')), ''),
      nullif(trim(coalesce(v_row->>'description', '')), ''),
      nullif(trim(coalesce(v_row->>'imageUrl', '')), ''),
      greatest(coalesce((v_row->>'startingBid')::int, v_room.default_starting_bid), 1),
      v_next_order
    );
    v_inserted := v_inserted + 1;
  end loop;

  perform _log_event(v_room.id, 'PLAYERS_IMPORTED', 'host', null,
    jsonb_build_object('count', v_inserted));

  return jsonb_build_object('success', true, 'inserted', v_inserted);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. 취소/일시정지/재개/강제낙찰도 예외 대신 코드로 응답 (운영자 버튼이
--     "눌러도 아무 반응 없음"으로 보이지 않도록 클라이언트가 사유를 표시)
-- ---------------------------------------------------------------------------
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
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_FOUND');
  end if;
  if v_auction.status <> 'active' then
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_ACTIVE');
  end if;

  v_remaining := greatest(0, ceil(extract(epoch from (v_auction.ends_at - now())))::int);

  update auctions
  set status = 'paused', paused_at = now(),
      remaining_seconds_when_paused = v_remaining, updated_at = now()
  where id = p_auction_id
  returning * into v_auction;
  update auction_rooms set status = 'paused', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_PAUSED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'remainingSeconds', v_remaining));

  return jsonb_build_object(
    'success', true,
    'remainingSeconds', v_remaining,
    'auction', to_jsonb(v_auction)
  );
end;
$$;

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
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_FOUND');
  end if;
  if v_auction.status <> 'paused' then
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_PAUSED');
  end if;

  v_ends_at := now() + make_interval(secs => coalesce(v_auction.remaining_seconds_when_paused, 0));

  update auctions
  set status = 'active', paused_at = null,
      remaining_seconds_when_paused = null, ends_at = v_ends_at, updated_at = now()
  where id = p_auction_id
  returning * into v_auction;
  update auction_rooms set status = 'running', updated_at = now() where id = v_room.id;

  perform _log_event(v_room.id, 'AUCTION_RESUMED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'endsAt', v_ends_at));

  return jsonb_build_object(
    'success', true,
    'endsAt', v_ends_at,
    'serverTime', now(),
    'auction', to_jsonb(v_auction)
  );
end;
$$;

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
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_FOUND');
  end if;
  if v_auction.status not in ('active', 'paused') then
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_ACTIVE');
  end if;

  update players set status = 'pending', updated_at = now() where id = v_auction.player_id;
  -- unique(player_id) 제약 때문에 재경매를 위해 경매 행을 삭제한다 (bids는 cascade)
  delete from auctions where id = p_auction_id;
  update auction_rooms set status = 'running', updated_at = now()
  where id = v_room.id and status = 'paused';

  perform _log_event(v_room.id, 'AUCTION_CANCELLED', 'host', null,
    jsonb_build_object('auctionId', p_auction_id, 'playerId', v_auction.player_id));

  return jsonb_build_object('success', true, 'playerId', v_auction.player_id);
end;
$$;

-- 낙찰/유찰 확정도 결과 경매 행을 함께 돌려준다.
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
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_FOUND');
  end if;

  -- 이미 종료된 경매면 기존 결과 반환 (멱등)
  if v_auction.status in ('sold', 'unsold') then
    return jsonb_build_object(
      'success', true,
      'alreadyFinalized', true,
      'status', v_auction.status,
      'soldTeamId', v_auction.highest_team_id,
      'soldPrice', v_auction.current_bid,
      'auction', to_jsonb(v_auction)
    );
  end if;

  if v_auction.status <> 'active' then
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_ACTIVE');
  end if;

  if not p_force and now() < v_auction.ends_at then
    return jsonb_build_object('success', false, 'code', 'AUCTION_NOT_ENDED');
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
    where id = p_auction_id
    returning * into v_auction;

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
      'soldPrice', v_auction.current_bid,
      'auction', to_jsonb(v_auction)
    );
  else
    -- 유찰
    update players set status = 'unsold', updated_at = now() where id = v_auction.player_id;
    update auctions set status = 'unsold', sold_at = now(), updated_at = now()
    where id = p_auction_id
    returning * into v_auction;

    perform _log_event(v_room.id, 'PLAYER_UNSOLD', case when p_force then 'host' else 'system' end, null,
      jsonb_build_object('playerId', v_auction.player_id));

    return jsonb_build_object(
      'success', true,
      'status', 'unsold',
      'auction', to_jsonb(v_auction)
    );
  end if;
end;
$$;

-- 유찰 선수 재경매 대기열 복귀 (운영자 전용)
create or replace function public.requeue_unsold_players(
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
  v_count int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  delete from auctions a
  using players p
  where a.player_id = p.id and p.room_id = v_room.id and p.status = 'unsold';

  update players set status = 'pending', updated_at = now()
  where room_id = v_room.id and status = 'unsold';
  get diagnostics v_count = row_count;

  perform _log_event(v_room.id, 'UNSOLD_REQUEUED', 'host', null,
    jsonb_build_object('count', v_count));

  return jsonb_build_object('success', true, 'requeued', v_count);
end;
$$;
