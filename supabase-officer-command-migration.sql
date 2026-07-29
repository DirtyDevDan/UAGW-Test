-- Officer command center persistence and permissions.
-- Apply after supabase-shared-migration.sql.

create table if not exists public.guild_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_attendance (
  event_id uuid not null references public.guild_events(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  status text not null check (status in ('Present','Late','Absent','Excused')),
  officer_note text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_id, character_id)
);

create table if not exists public.roster_decisions (
  event_id uuid not null references public.guild_events(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  decision text not null check (decision in ('Confirmed','Bench','Declined')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (event_id, character_id)
);

create table if not exists public.officer_audit_log (
  id bigint generated always as identity primary key,
  officer_id uuid references auth.users(id),
  action text not null,
  target text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table public.guild_settings enable row level security;
alter table public.event_attendance enable row level security;
alter table public.roster_decisions enable row level security;
alter table public.officer_audit_log enable row level security;

create policy "Public reads guild settings" on public.guild_settings for select using (true);
create policy "Officers update operational settings" on public.guild_settings for insert to authenticated
  with check ((select private.is_guild_officer()) and (key = 'raid_rules' or key = 'mythic_rules' or (select private.is_guild_leader())));
create policy "Officers edit operational settings" on public.guild_settings for update to authenticated
  using ((select private.is_guild_officer()) and (key = 'raid_rules' or key = 'mythic_rules' or (select private.is_guild_leader())))
  with check ((select private.is_guild_officer()) and (key = 'raid_rules' or key = 'mythic_rules' or (select private.is_guild_leader())));

create policy "Officers manage attendance" on public.event_attendance for all to authenticated
  using ((select private.is_guild_officer())) with check ((select private.is_guild_officer()));
create policy "Officers manage rosters" on public.roster_decisions for all to authenticated
  using ((select private.is_guild_officer())) with check ((select private.is_guild_officer()));
create policy "Leaders read audit log" on public.officer_audit_log for select to authenticated
  using ((select private.is_guild_leader()));
create policy "Officers create audit entries" on public.officer_audit_log for insert to authenticated
  with check ((select private.is_guild_officer()) and officer_id = (select auth.uid()));

create or replace function public.manage_guild_member(p_user_id uuid, p_rank text, p_status text)
returns public.guild_memberships
language plpgsql security definer set search_path = ''
as $$
declare v_result public.guild_memberships; v_actor_rank text;
begin
  if not private.is_guild_leader() then raise exception 'Guild leadership access required'; end if;
  if p_rank not in ('Guild Master','Co-Guild Master','Raid Officer','Event Officer','Veteran','Member','Recruit') then raise exception 'Invalid guild rank'; end if;
  if p_status not in ('pending','active','suspended') then raise exception 'Invalid membership status'; end if;
  select guild_rank into v_actor_rank from public.guild_memberships where user_id=auth.uid();
  if p_rank='Guild Master' and v_actor_rank<>'Guild Master' then raise exception 'Only the Guild Master can appoint another Guild Master'; end if;
  if p_user_id=auth.uid() and p_status<>'active' then raise exception 'You cannot deactivate your own account'; end if;
  update public.guild_memberships set guild_rank=p_rank,status=p_status,updated_at=now() where user_id=p_user_id returning * into v_result;
  if not found then raise exception 'Member not found'; end if;
  insert into public.officer_audit_log(officer_id,action,target,detail) values(auth.uid(),'Updated','Member access',p_rank||' / '||p_status);
  return v_result;
end;
$$;

revoke all on function public.manage_guild_member(uuid,text,text) from public;
grant execute on function public.manage_guild_member(uuid,text,text) to authenticated;
grant select,insert,update on public.guild_settings to anon, authenticated;
grant select,insert,update,delete on public.event_attendance, public.roster_decisions to authenticated;
grant select,insert on public.officer_audit_log to authenticated;

insert into public.guild_settings(key,value)
values
 ('raid_rules', '["Sign up before the deadline and choose the correct role.","Arrive 15 minutes early with repaired gear and consumables.","Keep combat communications clear and follow strategy calls.","Notify the Raid Officer as early as possible if plans change."]'::jsonb),
 ('mythic_rules', '["List the key level and dungeon when forming a group.","Be honest about experience and welcome learning runs.","Complete the agreed route unless the group decides together to change it.","Keep feedback constructive and communicate before leaving."]'::jsonb),
 ('site_content', '{"headline":"Welcome to United Azeroth.","lede":"Where experienced players unite to defeat the foes of Azeroth—and make every run, raid, and late-night laugh better together.","sidebar":"Alliance first. Community always."}'::jsonb)
on conflict (key) do nothing;
