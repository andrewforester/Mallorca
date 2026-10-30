begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public', 'talk_lines', 'talk_lines exists');
select has_table('public', 'memories', 'memories exists');
select has_table('public', 'usage', 'usage exists');
select has_table('public', 'usage_total', 'usage_total exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.talk_lines'::regclass),
  'talk_lines has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.memories'::regclass),
  'memories has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.usage'::regclass),
  'usage has RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.usage_total'::regclass),
  'usage_total has RLS'
);

insert into auth.users (id, instance_id, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.talk_lines (user_id, session_id, speaker, text)
values
  ('00000000-0000-0000-0000-0000000000a1', 's1', 'player', 'hello'),
  ('00000000-0000-0000-0000-0000000000a1', 's1', 'mallorca', 'hi there'),
  ('00000000-0000-0000-0000-0000000000a2', 's2', 'player', 'other');

insert into public.memories (user_id, fact)
values
  ('00000000-0000-0000-0000-0000000000a1', 'likes to bluff'),
  ('00000000-0000-0000-0000-0000000000a2', 'plays tight');

select throws_ok(
  $$insert into public.talk_lines (user_id, session_id, speaker, text)
    values ('00000000-0000-0000-0000-0000000000a1', 's1', 'bot', 'x')$$,
  '23514',
  null,
  'speaker is restricted'
);
select throws_ok(
  $$insert into public.talk_lines (user_id, session_id, speaker, text)
    values ('00000000-0000-0000-0000-0000000000a1', 's1', 'player', repeat('x', 401))$$,
  '23514',
  null,
  'line length is capped'
);
select throws_ok(
  $$insert into public.memories (user_id, fact)
    values ('00000000-0000-0000-0000-0000000000a1', repeat('x', 201))$$,
  '23514',
  null,
  'fact length is capped'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.talk_lines),
  2::bigint,
  'a user sees only own lines'
);
select is(
  (select count(*) from public.memories),
  1::bigint,
  'a user sees only own memories'
);
select throws_ok(
  $$select count(*) from public.usage$$,
  '42501',
  null,
  'a user cannot read usage'
);
select throws_ok(
  $$insert into public.talk_lines (user_id, session_id, speaker, text)
    values ('00000000-0000-0000-0000-0000000000a1', 's1', 'player', 'x')$$,
  '42501',
  null,
  'authenticated cannot insert lines'
);
select throws_ok(
  $$insert into public.memories (user_id, fact)
    values ('00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501',
  null,
  'authenticated cannot insert memories'
);
select throws_ok(
  $$select public.consume_call('00000000-0000-0000-0000-0000000000a1', 5, 5)$$,
  '42501',
  null,
  'authenticated cannot call consume_call'
);

reset role;
set local role service_role;

select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a1', 2, 10)),
  true,
  'first call is allowed'
);
select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a1', 2, 10)),
  true,
  'second call is allowed'
);
select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a1', 2, 10)),
  false,
  'third call is over the user limit'
);

select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a2', 2, 3)),
  true,
  'another user is allowed while the total has room'
);
select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a2', 2, 3)),
  false,
  'the total limit refuses'
);

select is(
  (select public.consume_call('00000000-0000-0000-0000-0000000000a2', null, 10)),
  false,
  'a null limit refuses the call'
);

reset role;

select is(
  (select calls from public.usage_total where day = current_date),
  3,
  'a refused call is not counted'
);

select * from finish();
rollback;
