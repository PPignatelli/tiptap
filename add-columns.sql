-- TipsTap — New columns for Sprint 1, 3, 4, 7
-- Run this in Supabase Dashboard > SQL Editor

-- Sprint 1: Custom tip amounts
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tip_amounts jsonb DEFAULT '[100, 200, 500]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_tip_index integer DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS thank_you_message text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_review_url text;

-- Sprint 3: QR accent color
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qr_accent_color text DEFAULT '#FF6B35';

-- Sprint 7: Referral
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_invited integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_signed_up integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_earned integer DEFAULT 0;

-- Generate referral codes for existing users (using their slug)
UPDATE profiles SET referral_code = slug WHERE referral_code IS NULL AND slug IS NOT NULL;
