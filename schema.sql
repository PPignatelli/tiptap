-- ============================================
-- TipsTap — Supabase Schema
-- Pourboire digital par QR code
-- ============================================

-- 1. Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  photo_url text,
  job text default 'Serveur',
  message text default 'Merci pour votre générosité !',
  slug text unique not null,
  stripe_account_id text,
  stripe_onboarded boolean default false,
  total_tips_count integer default 0,
  total_tips_amount integer default 0, -- in cents
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Tips
create table tips (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  amount integer not null, -- total charged in cents
  platform_fee integer not null default 0, -- TipsTap fee in cents
  net_amount integer not null default 0, -- what pro receives in cents
  currency text default 'eur',
  stripe_payment_intent_id text,
  tipper_name text,
  tipper_message text,
  status text default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  created_at timestamptz default now()
);

-- 3. Indexes
create index idx_tips_profile on tips(profile_id);
create index idx_tips_created on tips(created_at desc);
create index idx_profiles_slug on profiles(slug);

-- 4. RLS
alter table profiles enable row level security;
alter table tips enable row level security;

-- Profiles: public read (for tip pages), owner can update/insert
create policy "Anyone can view profiles"
  on profiles for select using (true);

create policy "Owner can insert profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Owner can update profile"
  on profiles for update using (auth.uid() = id);

-- Tips: anyone can insert (to tip), owner can read their tips
create policy "Anyone can create a tip"
  on tips for insert with check (true);

create policy "Owner can view their tips"
  on tips for select using (auth.uid() = profile_id);

-- 5. Function: increment tip counters on profile
create or replace function increment_tip_stats()
returns trigger as $$
begin
  if NEW.status = 'succeeded' then
    update profiles
    set total_tips_count = total_tips_count + 1,
        total_tips_amount = total_tips_amount + NEW.net_amount,
        updated_at = now()
    where id = NEW.profile_id;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_tip_succeeded
  after insert or update on tips
  for each row
  execute function increment_tip_stats();

-- 6. Function: auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
declare
  new_slug text;
begin
  new_slug := lower(replace(
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    ' ', '-'
  ));
  -- Ensure unique slug
  if exists (select 1 from profiles where slug = new_slug) then
    new_slug := new_slug || '-' || substr(NEW.id::text, 1, 6);
  end if;

  insert into profiles (id, email, full_name, slug)
  values (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_slug
  );
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- 7. Function: generate slug from name
create or replace function generate_unique_slug(name text)
returns text as $$
declare
  base_slug text;
  final_slug text;
  counter integer := 0;
begin
  base_slug := lower(regexp_replace(
    regexp_replace(unaccent(name), '[^a-z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  final_slug := base_slug;
  while exists (select 1 from profiles where slug = final_slug) loop
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;
  return final_slug;
end;
$$ language plpgsql security definer;

-- 8. Enable unaccent extension (for slug generation)
create extension if not exists unaccent;

-- ============================================
-- 9. Storage bucket for profile photos
-- Run in Supabase Dashboard > Storage > New Bucket
-- ============================================
-- Bucket name: avatars
-- Public: true
-- File size limit: 2MB
-- Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Storage policies (add in Dashboard > Storage > Policies):
--
-- SELECT (public read):
--   allow for all users (true)
--
-- INSERT (authenticated upload own):
--   allow for authenticated where (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
--
-- UPDATE (authenticated update own):
--   allow for authenticated where (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
--
-- DELETE (authenticated delete own):
--   allow for authenticated where (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])

-- ============================================
-- 10. Supabase Auth settings (configure in Dashboard)
-- ============================================
-- Site URL: https://your-domain.com
-- Redirect URLs:
--   https://your-domain.com/confirm.html
--   https://your-domain.com/reset-password.html
--   https://your-domain.com/dashboard.html
-- Email templates: customize with TipsTap branding
