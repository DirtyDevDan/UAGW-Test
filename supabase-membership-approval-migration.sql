-- Require a guild application during signup and keep member access locked until leadership accepts it.
-- Apply after supabase-shared-migration.sql and supabase-officer-command-migration.sql.

create unique index if not exists recruitment_account_user_unique
  on public.recruitment_applications(account_user_id)
  where account_user_id is not null;

drop policy if exists "Anyone submits new applications" on public.recruitment_applications;
drop policy if exists "Officers read applications" on public.recruitment_applications;
drop policy if exists "Officers update applications" on public.recruitment_applications;
drop policy if exists "Applicants and leaders read applications" on public.recruitment_applications;
drop policy if exists "Leaders update applications" on public.recruitment_applications;

create policy "Applicants and leaders read applications"
on public.recruitment_applications for select to authenticated
using (account_user_id = (select auth.uid()) or (select private.is_guild_leader()));

create policy "Leaders update applications"
on public.recruitment_applications for update to authenticated
using ((select private.is_guild_leader()))
with check ((select private.is_guild_leader()));

revoke all on public.recruitment_applications from anon, authenticated;
grant select, update on public.recruitment_applications to authenticated;

create or replace function public.handle_new_guild_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_character_name text := trim(v_meta ->> 'character_name');
  v_discord_name text := trim(v_meta ->> 'discord_name');
  v_class_name text := trim(v_meta ->> 'class_name');
  v_primary_role text := trim(v_meta ->> 'primary_role');
  v_goals text := trim(v_meta ->> 'goals');
  v_experience text := trim(v_meta ->> 'experience');
  v_item_level integer;
begin
  if lower(coalesce(v_meta ->> 'application_complete', 'false')) <> 'true' then
    raise exception 'A completed guild application is required to create an account';
  end if;
  if nullif(v_character_name, '') is null or char_length(v_character_name) > 30 then raise exception 'A valid character name is required'; end if;
  if nullif(v_discord_name, '') is null or char_length(v_discord_name) > 40 then raise exception 'A valid Discord username is required'; end if;
  if v_class_name not in ('Death Knight','Demon Hunter','Druid','Evoker','Hunter','Mage','Monk','Paladin','Priest','Rogue','Shaman','Warlock','Warrior') then raise exception 'A valid class is required'; end if;
  if v_primary_role not in ('Tank','Healer','DPS','Flexible') then raise exception 'A valid role is required'; end if;
  if coalesce(v_meta ->> 'item_level', '') !~ '^[0-9]{1,3}$' then raise exception 'A valid item level is required'; end if;
  v_item_level := (v_meta ->> 'item_level')::integer;
  if v_item_level < 1 or v_item_level > 999 then raise exception 'Item level must be between 1 and 999'; end if;
  if nullif(v_goals, '') is null or char_length(v_goals) > 1000 then raise exception 'Guild goals are required'; end if;
  if nullif(v_experience, '') is null or char_length(v_experience) > 1000 then raise exception 'Experience is required'; end if;

  insert into public.profiles(user_id, display_name)
  values(new.id, coalesce(nullif(trim(v_meta ->> 'display_name'), ''), split_part(new.email, '@', 1)));

  insert into public.guild_memberships(user_id, guild_rank, status)
  values(new.id, 'Recruit', 'pending');

  insert into public.recruitment_applications(
    email, character_name, discord_name, class_name, primary_role, item_level,
    goals, experience, status, account_user_id
  ) values (
    new.email, v_character_name, v_discord_name, v_class_name, v_primary_role,
    v_item_level, v_goals, v_experience, 'New', new.id
  );
  return new;
end;
$$;

revoke all on function public.handle_new_guild_user() from public, anon, authenticated;

create or replace function public.review_recruitment_application(p_application_id uuid, p_status text)
returns public.recruitment_applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app public.recruitment_applications;
begin
  if not private.is_guild_leader() then raise exception 'Guild leadership access required'; end if;
  if p_status not in ('Reviewing','Interview','Accepted','Declined') then raise exception 'Invalid status'; end if;
  select * into v_app from public.recruitment_applications where id = p_application_id;
  if not found then raise exception 'Application not found'; end if;

  update public.recruitment_applications
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_application_id
  returning * into v_app;

  if p_status = 'Accepted' and v_app.account_user_id is not null then
    update public.guild_memberships
    set status = 'active',
        guild_rank = case when guild_rank = 'Recruit' then 'Member' else guild_rank end,
        updated_at = now()
    where user_id = v_app.account_user_id;
  end if;
  return v_app;
end;
$$;

revoke all on function public.review_recruitment_application(uuid,text) from public, anon;
grant execute on function public.review_recruitment_application(uuid,text) to authenticated;

drop policy if exists "Active members read guild characters" on public.characters;
drop policy if exists "Members read own characters" on public.characters;
drop policy if exists "Members insert own characters" on public.characters;
drop policy if exists "Members update own characters" on public.characters;
drop policy if exists "Members delete own characters" on public.characters;

create policy "Approved members read guild characters"
on public.characters for select to authenticated
using ((select private.is_active_member()));

create policy "Approved members insert own characters"
on public.characters for insert to authenticated
with check ((select private.is_active_member()) and (select auth.uid()) = user_id);

create policy "Approved members update own characters"
on public.characters for update to authenticated
using ((select private.is_active_member()) and (select auth.uid()) = user_id)
with check ((select private.is_active_member()) and (select auth.uid()) = user_id);

create policy "Approved members delete own characters"
on public.characters for delete to authenticated
using ((select private.is_active_member()) and (select auth.uid()) = user_id);

drop policy if exists "Members update own profile" on public.profiles;
create policy "Approved members update own profile"
on public.profiles for update to authenticated
using ((select private.is_active_member()) and (select auth.uid()) = user_id)
with check ((select private.is_active_member()) and (select auth.uid()) = user_id);
