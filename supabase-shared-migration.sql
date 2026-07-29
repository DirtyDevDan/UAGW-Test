-- Shared United Azeroth events, RSVPs, announcements, directory, and recruitment
-- Apply after supabase-schema.sql.

create or replace function private.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guild_memberships
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;

create or replace function private.is_guild_officer()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.guild_memberships
    where user_id = (select auth.uid()) and status = 'active'
      and guild_rank in ('Guild Master','Co-Guild Master','Raid Officer','Event Officer')
  );
$$;

revoke all on function private.is_active_member() from public;
revoke all on function private.is_guild_officer() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_active_member(), private.is_guild_officer() to authenticated;
grant execute on function private.is_guild_officer() to anon;

create table if not exists public.guild_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  category text not null check (category in ('raid','mythic','pvp','transmog','meeting','social')),
  starts_at timestamptz not null,
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 720),
  recurrence text not null default 'none' check (recurrence in ('none','weekly','monthly')),
  recurrence_until date,
  location text not null default '',
  organizer text not null default '',
  description text not null default '',
  requirements text not null default '',
  tank_capacity integer not null default 2 check (tank_capacity between 0 and 20),
  healer_capacity integer not null default 4 check (healer_capacity between 0 and 40),
  dps_capacity integer not null default 14 check (dps_capacity between 0 and 100),
  status text not null default 'published' check (status in ('draft','published','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.guild_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  role text not null check (role in ('Tank','Healer','DPS','Bench','Tentative')),
  status text not null default 'confirmed' check (status in ('confirmed','bench','tentative','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_rsvps_event_idx on public.event_rsvps(event_id);
create index if not exists guild_events_starts_idx on public.guild_events(starts_at);

create table if not exists public.guild_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  category text not null default 'Guild',
  pinned boolean not null default false,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  character_name text not null,
  discord_name text not null,
  class_name text not null,
  primary_role text not null,
  item_level integer,
  goals text not null,
  experience text not null,
  status text not null default 'New' check (status in ('New','Reviewing','Interview','Accepted','Declined')),
  account_user_id uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_email_idx on public.recruitment_applications(lower(email));

alter table public.guild_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.guild_announcements enable row level security;
alter table public.recruitment_applications enable row level security;

drop policy if exists "Public reads published events" on public.guild_events;
create policy "Public reads published events" on public.guild_events for select
  using (status = 'published' or (select private.is_guild_officer()));
drop policy if exists "Officers create events" on public.guild_events;
create policy "Officers create events" on public.guild_events for insert to authenticated
  with check ((select private.is_guild_officer()) and created_by = (select auth.uid()));
drop policy if exists "Officers update events" on public.guild_events;
create policy "Officers update events" on public.guild_events for update to authenticated
  using ((select private.is_guild_officer())) with check ((select private.is_guild_officer()));
drop policy if exists "Officers delete events" on public.guild_events;
create policy "Officers delete events" on public.guild_events for delete to authenticated
  using ((select private.is_guild_officer()));

drop policy if exists "Members read relevant RSVPs" on public.event_rsvps;
create policy "Members read relevant RSVPs" on public.event_rsvps for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_guild_officer()));
drop policy if exists "Members cancel own RSVP" on public.event_rsvps;
create policy "Members cancel own RSVP" on public.event_rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Public reads announcements" on public.guild_announcements;
create policy "Public reads announcements" on public.guild_announcements for select
  using ((published and published_at <= now() and (expires_at is null or expires_at > now())) or (select private.is_guild_officer()));
drop policy if exists "Officers create announcements" on public.guild_announcements;
create policy "Officers create announcements" on public.guild_announcements for insert to authenticated
  with check ((select private.is_guild_officer()) and created_by = (select auth.uid()));
drop policy if exists "Officers update announcements" on public.guild_announcements;
create policy "Officers update announcements" on public.guild_announcements for update to authenticated
  using ((select private.is_guild_officer())) with check ((select private.is_guild_officer()));
drop policy if exists "Officers delete announcements" on public.guild_announcements;
create policy "Officers delete announcements" on public.guild_announcements for delete to authenticated
  using ((select private.is_guild_officer()));

drop policy if exists "Anyone submits new applications" on public.recruitment_applications;
create policy "Anyone submits new applications" on public.recruitment_applications for insert to anon, authenticated
  with check (status = 'New' and reviewed_by is null and reviewed_at is null);
drop policy if exists "Officers read applications" on public.recruitment_applications;
create policy "Officers read applications" on public.recruitment_applications for select to authenticated
  using ((select private.is_guild_officer()) or account_user_id = (select auth.uid()));
drop policy if exists "Officers update applications" on public.recruitment_applications;
create policy "Officers update applications" on public.recruitment_applications for update to authenticated
  using ((select private.is_guild_officer())) with check ((select private.is_guild_officer()));

drop policy if exists "Active members read guild profiles" on public.profiles;
create policy "Active members read guild profiles" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()) or ((select private.is_active_member()) and visibility = 'guild'));
drop policy if exists "Active members read guild characters" on public.characters;
create policy "Active members read guild characters" on public.characters for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()) or (select private.is_active_member()));
drop policy if exists "Active members read memberships" on public.guild_memberships;
create policy "Active members read memberships" on public.guild_memberships for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()) or (select private.is_active_member()));

create or replace function public.rsvp_for_event(p_event_id uuid, p_character_id uuid, p_role text)
returns public.event_rsvps
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.guild_events;
  v_character public.characters;
  v_capacity integer;
  v_count integer;
  v_result public.event_rsvps;
begin
  if not private.is_active_member() then raise exception 'Active guild membership required'; end if;
  if p_role not in ('Tank','Healer','DPS','Bench','Tentative') then raise exception 'Invalid role'; end if;
  select * into v_event from public.guild_events where id = p_event_id and status = 'published';
  if not found then raise exception 'Event unavailable'; end if;
  select * into v_character from public.characters where id = p_character_id and user_id = auth.uid();
  if not found then raise exception 'Character does not belong to this account'; end if;
  if p_role in ('Tank','Healer','DPS') then
    v_capacity := case p_role when 'Tank' then v_event.tank_capacity when 'Healer' then v_event.healer_capacity else v_event.dps_capacity end;
    select count(*) into v_count from public.event_rsvps where event_id=p_event_id and role=p_role and status='confirmed' and user_id <> auth.uid();
    if v_count >= v_capacity then raise exception '% capacity is full', p_role; end if;
  end if;
  insert into public.event_rsvps(event_id,user_id,character_id,role,status)
  values (p_event_id,auth.uid(),p_character_id,p_role,case when p_role='Bench' then 'bench' when p_role='Tentative' then 'tentative' else 'confirmed' end)
  on conflict(event_id,user_id) do update set character_id=excluded.character_id,role=excluded.role,status=excluded.status,updated_at=now()
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.event_rsvp_counts(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'Tank', count(*) filter (where role='Tank' and status='confirmed'),
    'Healer', count(*) filter (where role='Healer' and status='confirmed'),
    'DPS', count(*) filter (where role='DPS' and status='confirmed'),
    'Bench', count(*) filter (where role='Bench' or status='bench'),
    'Tentative', count(*) filter (where role='Tentative' or status='tentative')
  ) from public.event_rsvps where event_id=p_event_id;
$$;

create or replace function public.review_recruitment_application(p_application_id uuid, p_status text)
returns public.recruitment_applications
language plpgsql security definer set search_path = ''
as $$
declare v_app public.recruitment_applications; v_user uuid;
begin
  if not private.is_guild_officer() then raise exception 'Officer access required'; end if;
  if p_status not in ('Reviewing','Interview','Accepted','Declined') then raise exception 'Invalid status'; end if;
  select * into v_app from public.recruitment_applications where id=p_application_id;
  if not found then raise exception 'Application not found'; end if;
  select id into v_user from auth.users where lower(email)=lower(v_app.email) limit 1;
  update public.recruitment_applications set status=p_status,account_user_id=v_user,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_application_id returning * into v_app;
  if p_status='Accepted' and v_user is not null then
    update public.guild_memberships set status='active',guild_rank=case when guild_rank='Recruit' then 'Member' else guild_rank end,updated_at=now() where user_id=v_user;
  end if;
  return v_app;
end;
$$;

create or replace function public.handle_new_guild_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_accepted boolean;
begin
  select exists(select 1 from public.recruitment_applications where lower(email)=lower(new.email) and status='Accepted') into v_accepted;
  insert into public.profiles(user_id,display_name) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1)));
  insert into public.guild_memberships(user_id,guild_rank,status) values(new.id,case when v_accepted then 'Member' else 'Recruit' end,case when v_accepted then 'active' else 'pending' end);
  update public.recruitment_applications set account_user_id=new.id,updated_at=now() where lower(email)=lower(new.email) and status='Accepted';
  return new;
end;
$$;

revoke all on function public.rsvp_for_event(uuid,uuid,text), public.event_rsvp_counts(uuid), public.review_recruitment_application(uuid,text) from public;
grant execute on function public.rsvp_for_event(uuid,uuid,text) to authenticated;
grant execute on function public.event_rsvp_counts(uuid) to anon, authenticated;
grant execute on function public.review_recruitment_application(uuid,text) to authenticated;
grant select on public.guild_events, public.guild_announcements to anon, authenticated;
grant select,insert,update,delete on public.guild_events, public.guild_announcements to authenticated;
grant select,delete on public.event_rsvps to authenticated;
grant insert on public.recruitment_applications to anon, authenticated;
grant select,update on public.recruitment_applications to authenticated;

insert into public.guild_events(title,category,starts_at,duration_minutes,recurrence,location,organizer,description,requirements,tank_capacity,healer_capacity,dps_capacity,status)
select 'Mythic+ Vault Night','mythic',date_trunc('week',now()) + interval '4 days 19 hours',120,'weekly','Dornogal fountain','Thornwall','Build groups for weekly vault slots, crest farming, and steady key progression.','Any key, a positive attitude, and consumables for higher keys.',2,4,14,'published'
where not exists(select 1 from public.guild_events);

insert into public.guild_events(title,category,starts_at,duration_minutes,recurrence,location,organizer,description,requirements,tank_capacity,healer_capacity,dps_capacity,status)
select 'Progression Raid','raid',date_trunc('week',now()) + interval '6 days 18 hours 30 minutes',180,'weekly','Raid entrance','Aeloria','Focused progression with invites 15 minutes before start.','Confirmed signup, repaired gear, flasks, food, and current enchants.',2,4,14,'published'
where not exists(select 1 from public.guild_events where title='Progression Raid');

insert into public.guild_announcements(title,body,category,pinned,published)
select 'Shared guild systems are live','Events, character RSVPs, member profiles, and recruitment now sync securely across devices.','Guild',true,true
where not exists(select 1 from public.guild_announcements);
