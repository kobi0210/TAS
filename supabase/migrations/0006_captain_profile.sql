-- ---------------------------------------------------------------------------
-- 0006. 팀장 프로필 — 사진과 이름
--
-- 팀장이 경매에 들어가기 전(로비)에서 자기 사진과 이름을 정해 두면, 경매판
-- 팀 보드에 그 사진이 걸린다. 사진을 안 정하면 화면에서 기본 표식을 쓴다.
--
-- 사진은 브라우저에서 128x128 로 줄여 data URI 로 만든 뒤 이 컬럼에 넣는다.
-- 파일 저장소를 따로 두지 않아 방을 지우면 사진도 같이 사라지고, 방 상태를
-- 내려줄 때 함께 실려 나가므로 별도 요청이 필요 없다. 대신 무한정 커지지
-- 않도록 길이를 60,000자로 제한한다 (128px 사진은 보통 5,000자 안팎).
-- ---------------------------------------------------------------------------

alter table public.teams
  add column if not exists captain_avatar_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_captain_avatar_url_len'
  ) then
    alter table public.teams
      add constraint teams_captain_avatar_url_len
      check (captain_avatar_url is null or length(captain_avatar_url) <= 60000);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 프로필 저장
--
-- update_team_info 에 인자를 더하면 같은 이름의 함수가 둘이 되어 호출이
-- 모호해지므로 별도 함수로 둔다.
--
-- p_avatar_url 이 null 이면 사진은 건드리지 않는다. 사진을 지우려면
-- p_clear_avatar 를 true 로 준다.
-- ---------------------------------------------------------------------------
create or replace function public.update_captain_profile(
  p_room_code text,
  p_token_hash text,
  p_is_host boolean,
  p_team_id uuid,
  p_captain_name text,
  p_team_name text default null,
  p_avatar_url text default null,
  p_clear_avatar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room auction_rooms;
  v_team teams;
  v_team_id uuid;
begin
  select r.* into v_room from auction_rooms r where r.room_code = p_room_code;
  if not found then
    return jsonb_build_object('success', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  if p_is_host then
    if not exists (
      select 1 from room_credentials c
      where c.room_id = v_room.id and c.host_token_hash = p_token_hash
    ) then
      return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    end if;
    select t.id into v_team_id from teams t where t.id = p_team_id and t.room_id = v_room.id;
  else
    select t.id into v_team_id
    from teams t
    join team_credentials c on c.team_id = t.id
    where t.room_id = v_room.id and c.join_token_hash = p_token_hash;

    -- 팀장은 자기 팀만 고칠 수 있다
    if v_team_id is not null and p_team_id is not null and v_team_id is distinct from p_team_id then
      return jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    end if;
  end if;

  if v_team_id is null then
    return jsonb_build_object('success', false, 'code', 'TEAM_NOT_FOUND');
  end if;

  if p_avatar_url is not null and length(p_avatar_url) > 60000 then
    return jsonb_build_object('success', false, 'code', 'AVATAR_TOO_LARGE');
  end if;

  update teams t
  set captain_name = coalesce(nullif(trim(p_captain_name), ''), t.captain_name),
      team_name    = coalesce(nullif(trim(p_team_name), ''), t.team_name),
      captain_avatar_url = case
        when p_clear_avatar then null
        when p_avatar_url is not null then p_avatar_url
        else t.captain_avatar_url
      end,
      updated_at = now()
  where t.id = v_team_id
  returning t.* into v_team;

  return jsonb_build_object('success', true, 'team', to_jsonb(v_team));
end;
$$;

grant execute on function public.update_captain_profile(
  text, text, boolean, uuid, text, text, text, boolean
) to anon, authenticated, service_role;
