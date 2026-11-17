-- Extends the user's existing HPL schema. No original tables or records are replaced.
begin;
alter table public.site_settings add column if not exists league_name text not null default 'Helshoogte Premier League';
alter table public.site_settings add column if not exists revision integer not null default 0;
alter table public.site_settings add column if not exists manual_awards jsonb not null default '{}';
alter table public.teams add column if not exists icon text not null default '🏏';
alter table public.matches add column if not exists overs_limit integer not null default 20 check (overs_limit between 1 and 20);
alter table public.matches add column if not exists super_over jsonb;
alter table public.players add column if not exists squad_role text;

insert into public.admin_users(user_id)
select id from auth.users where id='746d1cef-caec-4e2b-9238-3f454bad0eb5'::uuid and email_confirmed_at is not null
on conflict do nothing;

create or replace function public.is_league_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function public.is_league_admin() from public,anon;
grant execute on function public.is_league_admin() to authenticated;

create or replace function public.get_league() returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object('revision',s.revision,'data',jsonb_build_object(
 'version',1,'leagueName',s.league_name,
 'season',coalesce((select name from public.seasons where is_active order by created_at desc limit 1),'Season 1'),
 'manualAwards',s.manual_awards,
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'code',t.abbr,'icon',t.icon,'logo',coalesce(t.logo_url,''),'deductions',t.deductions) order by t.created_at,t.name) from public.teams t),'[]'),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'teamId',p.team_id,'name',p.name,'jersey',coalesce(p.jersey,''),'role',p.role,'battingHand',p.batting_hand,'bowlingStyle',p.bowling_style,'photo',coalesce(p.photo_url,''),'squadRole',coalesce(p.squad_role,case p.leadership when 'captain' then 'Captain' when 'vice' then 'Vice-Captain' else 'Player' end),'baseline',p.baseline) order by p.created_at,p.name) from public.players p),'[]'),
 'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'a',m.team_a,'b',m.team_b,'date',coalesce(m.match_date::text,''),'time',coalesce(m.match_time::text,''),'location',coalesce(m.venue,''),'season',se.name,'phase',lower(m.stage),'oversLimit',m.overs_limit,'superOver',m.super_over,'status',case when m.status in('Completed','Tied') then 'done' else 'scheduled' end,
 'innings',case when m.status in('Completed','Tied') then jsonb_build_object('a',jsonb_build_object('runs',m.a_runs,'wickets',m.a_wickets,'balls',m.a_balls,'allOut',m.a_all_out),'b',jsonb_build_object('runs',m.b_runs,'wickets',m.b_wickets,'balls',m.b_balls,'allOut',m.b_all_out)) else null end,
 'performances',coalesce((select jsonb_agg(jsonb_build_object('playerId',p.player_id,'batted',p.batting_appeared,'dismissals',case when p.dismissal='not-out' then 0 else 1 end,'runs',p.batting_runs,'balls',p.batting_balls,'fours',p.fours,'sixes',p.sixes,'tens',p.tens,'ballsBowled',p.bowling_balls,'runsConceded',p.bowling_runs,'wickets',p.wickets,'maidens',p.maidens,'hatTricks',p.hat_tricks,'doubleHatTricks',p.double_hat_tricks,'catches',p.catches,'stumpings',p.stumpings,'runOuts',p.runouts)) from public.performances p where p.match_id=m.id),'[]')) order by m.match_date,m.id) from public.matches m join public.seasons se on se.id=m.season_id),'[]'),
 'news',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'image',coalesce(n.image_url,''),'date',n.published_at::date::text) order by n.published_at) from public.news n),'[]')
)) from public.site_settings s where s.id=1;
$$;
revoke all on function public.get_league() from public;
grant execute on function public.get_league() to anon,authenticated;

create or replace function public.save_league(league jsonb,expected_revision integer) returns integer
language plpgsql security definer set search_path='' as $$
declare rev integer; item jsonb; perf jsonb; collection text; season_key uuid; player_team uuid;
begin
 if not public.is_league_admin() then raise exception 'Admin access required' using errcode='42501';end if;
 select revision into rev from public.site_settings where id=1 for update;
 if expected_revision is distinct from rev then raise exception 'Records changed in another session. Refresh before saving.';end if;
 if jsonb_typeof(league) is distinct from 'object' or length(coalesce(league->>'leagueName',''))=0 or length(coalesce(league->>'season',''))=0 or octet_length(league::text)>4000000 then raise exception 'Invalid league backup';end if;
 foreach collection in array array['teams','players','fixtures','news'] loop
  if jsonb_typeof(league->collection) is distinct from 'array' then raise exception 'Invalid collection: %',collection;end if;
  if exists(select 1 from jsonb_array_elements(league->collection) x where coalesce(x->>'id','') !~ '^[0-9a-fA-F-]{36}$') then raise exception 'Invalid identifier';end if;
 end loop;
 for item in select value from jsonb_array_elements(league->'teams') loop
  insert into public.teams(id,name,abbr,logo_url,icon,deductions) values((item->>'id')::uuid,item->>'name',item->>'code',item->>'logo',coalesce(item->>'icon','🏏'),coalesce((item->>'deductions')::integer,0))
  on conflict(id) do update set name=excluded.name,abbr=excluded.abbr,logo_url=excluded.logo_url,icon=excluded.icon,deductions=excluded.deductions;
 end loop;
 for item in select value from jsonb_array_elements(league->'players') loop
  insert into public.players(id,team_id,name,jersey,role,batting_hand,bowling_style,photo_url,leadership,squad_role,baseline)
  values((item->>'id')::uuid,(item->>'teamId')::uuid,item->>'name',item->>'jersey',item->>'role',item->>'battingHand',item->>'bowlingStyle',item->>'photo',case item->>'squadRole' when 'Captain' then 'captain' when 'Vice-Captain' then 'vice' else 'player' end,item->>'squadRole',coalesce(item->'baseline','{}'))
  on conflict(id) do update set team_id=excluded.team_id,name=excluded.name,jersey=excluded.jersey,role=excluded.role,batting_hand=excluded.batting_hand,bowling_style=excluded.bowling_style,photo_url=excluded.photo_url,leadership=excluded.leadership,squad_role=excluded.squad_role,baseline=excluded.baseline;
 end loop;
 insert into public.seasons(name,is_active) values(league->>'season',true) on conflict(name) do update set is_active=true returning id into season_key;
 update public.seasons set is_active=false where id<>season_key;
 for item in select value from jsonb_array_elements(league->'fixtures') loop
  insert into public.seasons(name) values(coalesce(nullif(item->>'season',''),league->>'season')) on conflict(name) do nothing;
  select id into season_key from public.seasons where name=coalesce(nullif(item->>'season',''),league->>'season');
  insert into public.matches(id,season_id,stage,team_a,team_b,match_date,match_time,venue,status,published,a_runs,a_wickets,a_balls,a_all_out,b_runs,b_wickets,b_balls,b_all_out,overs_limit,super_over,super_over_winner)
  values((item->>'id')::uuid,season_key,case item->>'phase' when 'semifinal' then 'Semifinal' when 'final' then 'Final' else 'League' end,(item->>'a')::uuid,(item->>'b')::uuid,nullif(item->>'date','')::date,nullif(item->>'time','')::time,item->>'location',case when item->>'status'='done' then case when item#>>'{innings,a,runs}'=item#>>'{innings,b,runs}' then 'Tied' else 'Completed' end else 'Scheduled' end,true,
  coalesce((item#>>'{innings,a,runs}')::integer,0),coalesce((item#>>'{innings,a,wickets}')::integer,0),coalesce((item#>>'{innings,a,balls}')::integer,0),coalesce((item#>>'{innings,a,allOut}')::boolean,false),
  coalesce((item#>>'{innings,b,runs}')::integer,0),coalesce((item#>>'{innings,b,wickets}')::integer,0),coalesce((item#>>'{innings,b,balls}')::integer,0),coalesce((item#>>'{innings,b,allOut}')::boolean,false),coalesce((item->>'oversLimit')::integer,20),item->'superOver',
  case when (item#>>'{superOver,a}')::integer>(item#>>'{superOver,b}')::integer then (item->>'a')::uuid when (item#>>'{superOver,b}')::integer>(item#>>'{superOver,a}')::integer then (item->>'b')::uuid else null end)
  on conflict(id) do update set season_id=excluded.season_id,stage=excluded.stage,team_a=excluded.team_a,team_b=excluded.team_b,match_date=excluded.match_date,match_time=excluded.match_time,venue=excluded.venue,status=excluded.status,published=excluded.published,a_runs=excluded.a_runs,a_wickets=excluded.a_wickets,a_balls=excluded.a_balls,a_all_out=excluded.a_all_out,b_runs=excluded.b_runs,b_wickets=excluded.b_wickets,b_balls=excluded.b_balls,b_all_out=excluded.b_all_out,overs_limit=excluded.overs_limit,super_over=excluded.super_over,super_over_winner=excluded.super_over_winner,updated_at=now();
  delete from public.performances where match_id=(item->>'id')::uuid;
  for perf in select value from jsonb_array_elements(coalesce(item->'performances','[]')) loop
   select team_id into player_team from public.players where id=(perf->>'playerId')::uuid;
   if player_team is null or player_team not in((item->>'a')::uuid,(item->>'b')::uuid) then raise exception 'Scorecard player must belong to a fixture team';end if;
   insert into public.performances(match_id,player_id,team_id,batting_runs,batting_balls,fours,sixes,tens,dismissal,bowling_balls,bowling_runs,wickets,maidens,hat_tricks,double_hat_tricks,catches,stumpings,runouts,batting_appeared,bowling_appeared)
   values((item->>'id')::uuid,(perf->>'playerId')::uuid,player_team,(perf->>'runs')::integer,(perf->>'balls')::integer,(perf->>'fours')::integer,(perf->>'sixes')::integer,(perf->>'tens')::integer,case when (perf->>'dismissals')::integer>0 then 'out' else 'not-out' end,(perf->>'ballsBowled')::integer,(perf->>'runsConceded')::integer,(perf->>'wickets')::integer,(perf->>'maidens')::integer,(perf->>'hatTricks')::integer,(perf->>'doubleHatTricks')::integer,(perf->>'catches')::integer,(perf->>'stumpings')::integer,(perf->>'runOuts')::integer,(perf->>'batted')::boolean,(perf->>'ballsBowled')::integer>0);
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(league->'news') loop
  insert into public.news(id,title,body,image_url,published,published_at) values((item->>'id')::uuid,item->>'title',item->>'body',item->>'image',true,coalesce(nullif(item->>'date','')::timestamptz,now()))
  on conflict(id) do update set title=excluded.title,body=excluded.body,image_url=excluded.image_url,published=true,published_at=excluded.published_at;
 end loop;
 delete from public.matches where id not in(select (x->>'id')::uuid from jsonb_array_elements(league->'fixtures') x);
 delete from public.players where id not in(select (x->>'id')::uuid from jsonb_array_elements(league->'players') x);
 delete from public.teams where id not in(select (x->>'id')::uuid from jsonb_array_elements(league->'teams') x);
 delete from public.news where id not in(select (x->>'id')::uuid from jsonb_array_elements(league->'news') x);
 update public.site_settings set league_name=league->>'leagueName',manual_awards=coalesce(league->'manualAwards','{}'),revision=rev+1 where id=1;
 return rev+1;
end;
$$;
revoke all on function public.save_league(jsonb,integer) from public,anon;
grant execute on function public.save_league(jsonb,integer) to authenticated;
-- Keep the existing RLS policies; only the atomic save function changes app records.
revoke all on public.teams,public.players,public.matches,public.performances,public.news,public.seasons,public.site_settings,public.awards,public.admin_users from anon,authenticated;
grant select on public.teams,public.players,public.matches,public.performances,public.news,public.seasons,public.site_settings,public.awards to anon,authenticated;
grant select on public.admin_users to authenticated;
commit;
