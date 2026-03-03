-- ============================================
-- FlowFic Monetization Migration
-- - Wallet + Coin ledger
-- - VIP entitlement
-- - Premium chapters + unlocks
-- ============================================

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS coin_price int NOT NULL DEFAULT 0;

ALTER TABLE public.chapters
  DROP CONSTRAINT IF EXISTS chapters_coin_price_check;

ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_coin_price_check CHECK (coin_price >= 0);

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coin_balance int NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS on_wallets_updated ON public.wallets;
CREATE TRIGGER on_wallets_updated
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;
CREATE POLICY "Users can view their own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.vip_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive',
  plan_code text NOT NULL DEFAULT 'vip_monthly',
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS on_vip_entitlements_updated ON public.vip_entitlements;
CREATE TRIGGER on_vip_entitlements_updated
  BEFORE UPDATE ON public.vip_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.vip_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own vip entitlement" ON public.vip_entitlements;
CREATE POLICY "Users can view their own vip entitlement" ON public.vip_entitlements
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount int NOT NULL,
  txn_type text NOT NULL,
  description text,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coin_transactions_user_created_idx
  ON public.coin_transactions(user_id, created_at DESC);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own coin transactions" ON public.coin_transactions;
CREATE POLICY "Users can view their own coin transactions" ON public.coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.chapter_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE NOT NULL,
  spent_coins int NOT NULL DEFAULT 0 CHECK (spent_coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS chapter_unlocks_user_story_idx
  ON public.chapter_unlocks(user_id, story_id);

ALTER TABLE public.chapter_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chapter unlocks" ON public.chapter_unlocks;
CREATE POLICY "Users can view their own chapter unlocks" ON public.chapter_unlocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.unlock_premium_chapter(p_chapter_id uuid)
RETURNS TABLE (success boolean, message text, new_balance int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_story_id uuid;
  v_coin_price int;
  v_is_premium boolean;
  v_coin_balance int;
  v_vip_active boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'AUTH_REQUIRED', 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_chapter_id::text));

  SELECT c.story_id, c.coin_price, c.is_premium
    INTO v_story_id, v_coin_price, v_is_premium
  FROM public.chapters c
  WHERE c.id = p_chapter_id AND c.status = 'published';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'CHAPTER_NOT_FOUND', 0;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chapter_unlocks u
    WHERE u.user_id = v_user_id AND u.chapter_id = p_chapter_id
  ) THEN
    SELECT COALESCE(w.coin_balance, 0)
      INTO v_coin_balance
    FROM public.wallets w
    WHERE w.user_id = v_user_id;

    RETURN QUERY SELECT true, 'ALREADY_UNLOCKED', COALESCE(v_coin_balance, 0);
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vip_entitlements v
    WHERE v.user_id = v_user_id
      AND v.status = 'active'
      AND (v.current_period_end IS NULL OR v.current_period_end > now())
  ) INTO v_vip_active;

  IF v_vip_active OR NOT v_is_premium OR COALESCE(v_coin_price, 0) = 0 THEN
    INSERT INTO public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
    VALUES (v_user_id, v_story_id, p_chapter_id, 0)
    ON CONFLICT (user_id, chapter_id) DO NOTHING;

    SELECT COALESCE(w.coin_balance, 0)
      INTO v_coin_balance
    FROM public.wallets w
    WHERE w.user_id = v_user_id;

    RETURN QUERY SELECT true, CASE WHEN v_vip_active THEN 'UNLOCKED_BY_VIP' ELSE 'UNLOCKED_FREE' END, COALESCE(v_coin_balance, 0);
    RETURN;
  END IF;

  INSERT INTO public.wallets (user_id, coin_balance)
  VALUES (v_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT w.coin_balance
    INTO v_coin_balance
  FROM public.wallets w
  WHERE w.user_id = v_user_id
  FOR UPDATE;

  IF v_coin_balance < v_coin_price THEN
    RETURN QUERY SELECT false, 'INSUFFICIENT_COINS', v_coin_balance;
    RETURN;
  END IF;

  UPDATE public.wallets
    SET coin_balance = coin_balance - v_coin_price
  WHERE user_id = v_user_id
  RETURNING coin_balance INTO v_coin_balance;

  INSERT INTO public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
  VALUES (v_user_id, v_story_id, p_chapter_id, v_coin_price)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  INSERT INTO public.coin_transactions (user_id, amount, txn_type, description, chapter_id)
  VALUES (v_user_id, -v_coin_price, 'chapter_unlock', 'Unlock premium chapter', p_chapter_id);

  RETURN QUERY SELECT true, 'UNLOCKED', v_coin_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_premium_chapter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_premium_chapter(uuid) TO authenticated;
