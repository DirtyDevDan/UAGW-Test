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
