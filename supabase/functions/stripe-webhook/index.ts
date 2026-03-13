import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Manual Stripe signature verification (works reliably in Deno/Edge)
async function verifyStripeSignature(body: string, signature: string, secret: string) {
  const parts = signature.split(',').reduce((acc: Record<string, string>, part) => {
    const [key, value] = part.split('=')
    acc[key.trim()] = value
    return acc
  }, {})

  const timestamp = parts['t']
  const sig = parts['v1']
  if (!timestamp || !sig) throw new Error('Invalid signature format')

  // Verify timestamp is not too old (5 min tolerance)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp)
  if (age > 300) throw new Error('Timestamp too old')

  const payload = `${timestamp}.${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expectedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (expectedSig !== sig) throw new Error('Signature mismatch')

  return JSON.parse(body)
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.text()
    const event = await verifyStripeSignature(body, signature, webhookSecret)

    console.log('Webhook event received:', event.type, event.data?.object?.id)

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const piId = event.data.object.id
        const { error } = await supabase
          .from('tips')
          .update({ status: 'succeeded' })
          .eq('stripe_payment_intent_id', piId)
        if (error) console.error('DB update error:', error)
        else console.log('Tip updated to succeeded for PI:', piId)
        break
      }

      case 'payment_intent.payment_failed': {
        const piId = event.data.object.id
        const { error } = await supabase
          .from('tips')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', piId)
        if (error) console.error('DB update error:', error)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
