-- PokéVault — Supabase Phase 1 Migration
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jsozfpsfvvnnmipsksoh/sql/new
--
-- What this does:
--   1. Enables Row Level Security on all three tables (they are currently unprotected)
--   2. Adds a permissive anon policy so the app continues to work exactly as before
--   3. Adds a nullable user_id column to each table (ready for Phase 2 auth)
--
-- Safe to run: permissive policies mean zero behaviour change for the app.
-- ─────────────────────────────────────────────────────────────────

-- ── 1a. Enable RLS ────────────────────────────────────────────
ALTER TABLE pokemon_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_moves      ENABLE ROW LEVEL SECURITY;

-- ── 1b. Permissive anon policies (maintains current behaviour) ─
CREATE POLICY "anon_full_access" ON pokemon_collection
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_access" ON pokemon_overrides
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_full_access" ON pokemon_moves
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── 1c. Add nullable user_id column to each table ─────────────
ALTER TABLE pokemon_collection ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE pokemon_overrides  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE pokemon_moves      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- ── 1d. Nick override (v3.5.48) ───────────────────────────────
-- User-authored nick override. NULL = no override (use the suggested nick);
-- '' (empty string) = a real override meaning "no nick". The null-vs-empty
-- distinction is load-bearing in the app (see clampNick / applyNickOverride).
-- The existing FOR ALL anon/owner policy already scopes column-level writes, so
-- no policy change is required for this new column.
ALTER TABLE pokemon_overrides  ADD COLUMN IF NOT EXISTS nick text DEFAULT NULL;
