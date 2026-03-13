import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

const PLATFORM_FEE_PERCENT = 10 // 10% commission

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, profile_id, tipper_name, tipper_message } = await req.json()

    if (!amount || amount < 100) throw new Error('Montant minimum : 1,00 EUR')
    if (!profile_id) throw new Error('Profil manquant')

    // Calculate platform fee
    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT / 100)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Look up profile for Stripe Connect info
    const { data: profileData } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', profile_id)
      .single()

    // Build PaymentIntent params
    const piParams: Record<string, any> = {
      amount,
      currency: 'eur',
      metadata: {
        profile_id,
        tipper_name: tipper_name || 'Anonyme',
        tipper_message: tipper_message || '',
        platform_fee: platformFee.toString(),
        net_amount: (amount - platformFee).toString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    }

    // If recipient has connected Stripe → destination charges
    // 90% goes to their bank, 10% stays on platform (Stripe fees deducted from platform's 10%)
    if (profileData?.stripe_onboarded && profileData?.stripe_account_id) {
      piParams.transfer_data = {
        destination: profileData.stripe_account_id,
      }
      piParams.application_fee_amount = platformFee
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams)

    // Create tip record in Supabase (pending)
    await supabase.from('tips').insert({
      profile_id,
      amount,
      platform_fee: platformFee,
      net_amount: amount - platformFee,
      stripe_payment_intent_id: paymentIntent.id,
      tipper_name: tipper_name || null,
      tipper_message: tipper_message || null,
      status: 'pending',
    })

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
