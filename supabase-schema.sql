-- United Azeroth member accounts and private character rosters
-- Run this entire file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  discord_name text not null default '',
  bio text not null default '' check (char_length(bio) <= 500),
  visibility text not null default 'guild' check (visibility in ('guild', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guild_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  guild_rank text not null default 'Member' check (guild_rank in ('Guild Master', 'Co-Guild Master', 'Raid Officer', 'Event Officer', 'Veteran', 'Member', 'Recruit')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  realm text not null check (char_length(realm) between 1 and 40),
  class_name text not null check (char_length(class_name) between 1 and 30),
  specialization text not null check (char_length(specialization) between 1 and 30),
  primary_role text not null check (primary_role in ('Tank', 'Healer', 'DPS', 'Flexible')),
  item_level integer check (item_level between 1 and 999),
  professions text[] not null default '{}',
  is_main boolean not null default false,
  profile_note text not null default '' check (char_length(profile_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, realm)
);

create index if not exists characters_user_id_idx on public.characters(user_id);
create unique index if not exists one_main_character_per_user on public.characters(user_id) where is_main;

create or replace function private.is_guild_leader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.guild_memberships
    where user_id = (select auth.uid())
      and status = 'active'
      and guild_rank in ('Guild Master', 'Co-Guild Master')
  );
$$;

revoke all on function private.is_guild_leader() from public;
grant execute on function private.is_guild_leader() to authenticated;

create or replace function public.handle_new_guild_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  insert into public.guild_memberships (user_id, guild_rank, status)
  values (new.id, 'Recruit', 'pending');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_guild_user();

alter table public.profiles enable row level security;
alter table public.guild_memberships enable row level security;
alter table public.characters enable row level security;

drop policy if exists "Members read own profile" on public.profiles;
create policy "Members read own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()));
drop policy if exists "Members update own profile" on public.profiles;
create policy "Members update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Members read own membership" on public.guild_memberships;
create policy "Members read own membership" on public.guild_memberships for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()));
drop policy if exists "Leaders insert memberships" on public.guild_memberships;
create policy "Leaders insert memberships" on public.guild_memberships for insert to authenticated
  with check ((select private.is_guild_leader()));
drop policy if exists "Leaders update memberships" on public.guild_memberships;
create policy "Leaders update memberships" on public.guild_memberships for update to authenticated
  using ((select private.is_guild_leader())) with check ((select private.is_guild_leader()));
drop policy if exists "Leaders delete memberships" on public.guild_memberships;
create policy "Leaders delete memberships" on public.guild_memberships for delete to authenticated
  using ((select private.is_guild_leader()));

drop policy if exists "Members read own characters" on public.characters;
create policy "Members read own characters" on public.characters for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_guild_leader()));
drop policy if exists "Members insert own characters" on public.characters;
create policy "Members insert own characters" on public.characters for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Members update own characters" on public.characters;
create policy "Members update own characters" on public.characters for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Members delete own characters" on public.characters;
create policy "Members delete own characters" on public.characters for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.guild_memberships to authenticated;
grant select, insert, update, delete on public.characters to authenticated;

-- After registering the first account, promote it once from the SQL Editor:
-- update public.guild_memberships
-- set guild_rank = 'Guild Master', status = 'active'
-- where user_id = (select id from auth.users where email = 'YOUR_EMAIL');
