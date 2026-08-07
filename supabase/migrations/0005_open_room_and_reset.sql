-- 0005
-- 1) 운영자가 버튼 한 번으로 전원을 경매 화면에 동시 입장시킨다.
-- 2) 경매 종료 후 방을 다시 로비로 되돌린다.

-- ---------------------------------------------------------------------------
-- 1. 경매 화면 개방
--
--    지금까지는 첫 선수의 경매가 시작돼야(status='running') 팀장 화면이 넘어갔다.
--    'ready' 상태를 "전원 경매 화면 대기"로 쓰면, 아직 아무 선수도 올리지 않은
--    상태에서 모두를 같은 화면으로 모을 수 있다.
-- ---------------------------------------------------------------------------
create or replace function public.open_auction_room(
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
  v_total int;
  v_ready int;
begin
  v_room := _require_host(p_room_code, p_host_token_hash);

  if v_room.status = 'completed' then
    return jsonb_build_object('success', false, 'code', 'ROOM_COMPLETED');
  end if;

  select count(*) filter (where claimed_at is not null),
         count(*) filter (where claimed_at is not null and is_ready)
    into v_total, v_ready
  from teams where room_id = v_room.id;

  -- 이미 진행 중이면 상태를 건드리지 않고 성공으로 응답한다 (멱등)
  if v_room.status in ('running', 'paused') then
    return jsonb_build_object(
      'success', true, 'status', v_room.status,
      'claimedTeams', v_total, 'readyTeams', v_ready
    );
  end if;

  update auction_rooms
  set status = 'ready', updated_at = now()
  where id = v_room.id;

  perform _log_event(v_room.id, 'ROOM_OPENED', 'host', null,
    jsonb_build_object('claimedTeams', v_total, 'readyTeams', v_ready));

  return jsonb_build_object(
    'success', true, 'status', 'ready',
    'claimedTeams', v_total, 'readyTeams', v_ready
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 로비로 되돌리기
--
--    경매가 끝난 뒤 다시 준비 화면으로 돌아갈 수 있게 한다.
--    진행 중인 경매가 있으면 거부한다.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_lobby(
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
    return jsonb_build_object('success', false, 'code', 'AUCTION_ALREADY_RUNNING');
  end if;

  update auction_rooms
  set status = 'lobby',
      auto_advance = false,
      completed_at = null,
      updated_at = now()
  where id = v_room.id;

  update teams set is_ready = false, updated_at = now() where room_id = v_room.id;

  perform _log_event(v_room.id, 'LOBBY_REOPENED', 'host', null, '{}'::jsonb);

  return jsonb_build_object('success', true, 'status', 'lobby');
end;
$$;
