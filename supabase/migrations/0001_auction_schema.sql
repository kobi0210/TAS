-- 팀원 경매 시스템 스키마
-- 토큰 해시는 클라이언트가 읽을 수 없도록 별도 credentials 테이블에 보관한다.

create table public.auction_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code varchar(8) unique not null,
  name text not null,
  host_name text not null,
  status text not null default 'lobby'
    check (status in ('lobby', 'ready', 'running', 'paused', 'completed', 'cancelled')),
  team_count int not null check (team_count between 4 and 6),
  starting_points int not null check (starting_points > 0),
  max_players_per_team int not null check (max_players_per_team > 0),
  default_starting_bid int not null default 10 check (default_starting_bid > 0),
  bid_increment int not null default 10 check (bid_increment > 0),
  auction_duration_seconds int not null default 30 check (auction_duration_seconds > 0),
  extension_threshold_seconds int not null default 5 check (extension_threshold_seconds >= 0),
  extension_seconds int not null default 5 check (extension_seconds >= 0),
  allow_self_raise boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.room_credentials (
  room_id uuid primary key references public.auction_rooms(id) on delete cascade,
  host_token_hash text not null
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.auction_rooms(id) on delete cascade,
  slot_number int not null,
  team_name text not null,
  captain_name text not null,
  starting_points int not null,
  remaining_points int not null check (remaining_points >= 0),
  max_players int not null,
  is_ready boolean not null default false,
  is_connected boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, slot_number)
);

create table public.team_credentials (
  team_id uuid primary key references public.teams(id) on delete cascade,
  join_token_hash text not null
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.auction_rooms(id) on delete cascade,
  name text not null,
  nickname text,
  position text,
  tier text,
  description text,
  image_url text,
  starting_bid int not null check (starting_bid > 0),
  auction_order int not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'sold', 'unsold', 'cancelled')),
  sold_team_id uuid references public.teams(id),
  sold_price int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, auction_order)
);

create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.auction_rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'sold', 'unsold', 'cancelled')),
  current_bid int,
  highest_team_id uuid references public.teams(id),
  started_at timestamptz,
  ends_at timestamptz,
  paused_at timestamptz,
  remaining_seconds_when_paused int,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id)
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.auction_rooms(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  amount int not null,
  accepted boolean not null,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table public.auction_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.auction_rooms(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 인덱스
create index idx_teams_room on public.teams(room_id);
create index idx_team_credentials_hash on public.team_credentials(join_token_hash);
create index idx_room_credentials_hash on public.room_credentials(host_token_hash);
create index idx_players_room_order on public.players(room_id, auction_order);
create index idx_auctions_room on public.auctions(room_id);
create index idx_bids_auction_created on public.bids(auction_id, created_at desc);
create index idx_bids_room on public.bids(room_id);
create index idx_auction_events_room on public.auction_events(room_id, created_at desc);

-- RLS: 일반 테이블은 읽기 공개(방 데이터는 코드를 아는 사람만 조회한다는 전제의 MVP),
-- 쓰기는 전부 security definer RPC를 통해서만 수행한다.
-- credentials 테이블은 정책이 없어 anon이 절대 읽을 수 없다.
alter table public.auction_rooms enable row level security;
alter table public.room_credentials enable row level security;
alter table public.teams enable row level security;
alter table public.team_credentials enable row level security;
alter table public.players enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.auction_events enable row level security;

create policy "auction_rooms_read" on public.auction_rooms for select using (true);
create policy "teams_read" on public.teams for select using (true);
create policy "players_read" on public.players for select using (true);
create policy "auctions_read" on public.auctions for select using (true);
create policy "bids_read" on public.bids for select using (true);
create policy "auction_events_read" on public.auction_events for select using (true);

-- Realtime 구독 대상 등록
alter publication supabase_realtime add table public.auction_rooms;
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.auctions;
alter publication supabase_realtime add table public.bids;
