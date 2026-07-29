-- Production RPC permissions for the public website.
-- Apply after the other United Azeroth migrations.

revoke all on function public.handle_new_guild_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

revoke all on function public.rsvp_for_event(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.review_recruitment_application(uuid, text) from public, anon, authenticated;
revoke all on function public.manage_guild_member(uuid, text, text) from public, anon, authenticated;
revoke all on function public.event_rsvp_counts(uuid) from public, anon, authenticated;

grant execute on function public.rsvp_for_event(uuid, uuid, text) to authenticated;
grant execute on function public.review_recruitment_application(uuid, text) to authenticated;
grant execute on function public.manage_guild_member(uuid, text, text) to authenticated;
grant execute on function public.event_rsvp_counts(uuid) to anon, authenticated;

-- Cover foreign keys used by calendar, roster, recruitment, and officer queries.
create index if not exists event_attendance_character_id_idx
  on public.event_attendance (character_id);
create index if not exists event_attendance_updated_by_idx
  on public.event_attendance (updated_by);
create index if not exists event_rsvps_character_id_idx
  on public.event_rsvps (character_id);
create index if not exists event_rsvps_user_id_idx
  on public.event_rsvps (user_id);
create index if not exists guild_announcements_created_by_idx
  on public.guild_announcements (created_by);
create index if not exists guild_events_created_by_idx
  on public.guild_events (created_by);
create index if not exists guild_settings_updated_by_idx
  on public.guild_settings (updated_by);
create index if not exists officer_audit_log_officer_id_idx
  on public.officer_audit_log (officer_id);
create index if not exists recruitment_applications_account_user_id_idx
  on public.recruitment_applications (account_user_id);
create index if not exists recruitment_applications_reviewed_by_idx
  on public.recruitment_applications (reviewed_by);
create index if not exists roster_decisions_character_id_idx
  on public.roster_decisions (character_id);
create index if not exists roster_decisions_updated_by_idx
  on public.roster_decisions (updated_by);
