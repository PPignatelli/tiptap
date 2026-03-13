import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

const PLATFORM_FEE_PERCENT = 10

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { card_id } = await req.json()

    if (!card_id) throw new Error('card_id manquant')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get card details
    const { data: cardData, error: cardErr } = await supabase
      .from('cards')
      .select('id, owner_id, price, title')
      .eq('id', card_id)
      .single()

    if (cardErr || !cardData) throw new Error('Carte introuvable')

    const amount = cardData.price
    if (amount < 100) throw new Error('Montant minimum : 1,00 EUR')

    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT / 100)

    // Look up owner's Stripe Connect account
    const { data: profileData } = await supabase
      .from('profiles')
      .select('stripe_account_id, stripe_onboarded')
      .eq('id', cardData.owner_id)
      .single()

    // Build PaymentIntent
    const piParams: Record<string, any> = {
      amount,
      currency: 'eur',
      metadata: {
        card_id: cardData.id,
        owner_id: cardData.owner_id,
        platform_fee: platformFee.toString(),
        net_amount: (amount - platformFee).toString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    }

    // Destination charges if owner has connected Stripe
    if (profileData?.stripe_onboarded && profileData?.stripe_account_id) {
      piParams.transfer_data = {
        destination: profileData.stripe_account_id,
      }
      piParams.application_fee_amount = platformFee
    }

    const paymentIntent = await stripe.paymentIntents.create(piParams)

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
