create table public.talk_lines (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  speaker text not null check (speaker in ('mallorca', 'player')),
  text text not null check (char_length(text) <= 400),
  created_at timestamptz not null default now()
);

create index talk_lines_user_created_idx
  on public.talk_lines (user_id, created_at desc);

create table public.memories (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fact text not null check (char_length(fact) <= 200),
  created_at timestamptz not null default now()
);

create index memories_user_created_idx
  on public.memories (user_id, created_at desc);

create table public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);

create table public.usage_total (
  day date primary key,
  calls int not null default 0
);

alter table public.talk_lines enable row level security;
alter table public.memories enable row level security;
alter table public.usage enable row level security;
alter table public.usage_total enable row level security;

revoke insert, update, delete on public.talk_lines, public.memories, public.usage, public.usage_total
  from anon, authenticated;
revoke select on public.usage, public.usage_total from anon, authenticated;

create policy talk_lines_select_own on public.talk_lines
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memories_select_own on public.memories
  for select to authenticated
  using (user_id = (select auth.uid()));

create function public.consume_call(p_user uuid, user_limit int, global_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := current_date;
  user_calls int;
  total_calls int;
begin
  insert into public.usage_total (day, calls) values (today, 0)
    on conflict (day) do nothing;
  insert into public.usage (user_id, day, calls) values (p_user, today, 0)
    on conflict (user_id, day) do nothing;

  select calls into total_calls
    from public.usage_total where day = today for update;
  select calls into user_calls
    from public.usage where user_id = p_user and day = today for update;

  if not coalesce(total_calls < global_limit and user_calls < user_limit, false) then
    return false;
  end if;

  update public.usage_total set calls = calls + 1 where day = today;
  update public.usage set calls = calls + 1
    where user_id = p_user and day = today;
  return true;
end;
$$;

revoke execute on function public.consume_call(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.consume_call(uuid, int, int) to service_role;
