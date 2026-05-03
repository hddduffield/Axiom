-- Phase 4 Step 2 — Seed the 3 PSA Wealth advisors.
--
-- The id values below are placeholders. Real ids must match auth.users.id
-- from Supabase Auth, which only exists after Hayden invites each advisor
-- via the Supabase Dashboard. After invitation, run:
--
--   update public.advisors
--      set id = '<real-auth-user-id>'
--    where email = '<advisor-email>';
--
-- Or simpler: delete the seed row and let the post-invite onboarding flow
-- (Phase 4 Step 4+) create the advisor row using the real auth.uid().
--
-- The 3rd advisor email is a placeholder pending Hayden confirming who.

-- The placeholder ids violate the auth.users(id) FK, so this seed will FAIL
-- to apply against a fresh schema. That's intentional — it serves as a
-- TODO marker. Hayden should either (a) invite the 3 advisors first and
-- replace the ids before applying this migration, or (b) drop this file
-- and rely on the post-invite onboarding flow.
--
-- Wrapped in a guard so the migration is idempotent and skippable.

do $$
begin
  if exists (
    select 1 from auth.users where id in (
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid
    )
  ) then
    insert into public.advisors (id, email, first_name, last_name, role, active)
    values
      ('00000000-0000-0000-0000-000000000001', 'hayden@psawealth.com', 'Hayden',  'Duffield', 'advisor', true),
      ('00000000-0000-0000-0000-000000000002', 'will@psawealth.com',   'Will',    'Bearden',  'advisor', true),
      ('00000000-0000-0000-0000-000000000003', 'advisor3@psawealth.com', 'TBD',   'TBD',      'advisor', true)
    on conflict (id) do nothing;
  else
    raise notice 'Skipping advisor seed — placeholder auth.users rows do not exist. Invite advisors via Supabase Dashboard, then re-run with real ids.';
  end if;
end;
$$;
