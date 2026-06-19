import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://bjzyrmhwqfapysmucloi.supabase.co';
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const WEBHOOK_TOKEN = 'coachorg2026webhook$Kiwify!';

// Thresholds de recompensa
const REWARDS = [
  { count: 5, plan: 'vitalicio' },
  { count: 3, plan: 'anual'     },
  { count: 1, plan: 'mensal'    },
];

function detectPlan(productName: string = '', planName: string = ''): string {
  const s = (productName + ' ' + planName).toLowerCase();
  if (s.includes('vitalic')) return 'vitalicio';
  if (s.includes('anual'))   return 'anual';
  return 'mensal';
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  // Validar token
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // Extrair email (Kiwify pode mandar em formatos diferentes)
  const email =
    body?.customer?.email ||
    body?.data?.customer?.email ||
    body?.order?.customer?.email ||
    body?.email ||
    null;

  if (!email) {
    return new Response(JSON.stringify({ error: 'no email' }), { status: 400 });
  }

  // Só processar pagamentos aprovados
  const event = body?.event || body?.type || '';
  const status = body?.Payment?.status || body?.data?.status || body?.order?.status || 'approved';
  if (!event.includes('approved') && !event.includes('paid') && status !== 'approved') {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // Detectar plano
  const productName = body?.product?.name || body?.data?.product?.name || '';
  const planName    = body?.subscription?.plan?.name || body?.data?.subscription?.plan?.name || '';
  const plan = detectPlan(productName, planName);

  const orderId = body?.order_id || body?.id || body?.data?.id || null;

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Registrar ativação Pro por email
  await sb.from('pro_activations').upsert(
    { email, plan, kiwify_order_id: orderId },
    { onConflict: 'email' }
  );

  // 2. Processar referral — verificar se esse email foi indicado por alguém
  const { data: referral } = await sb
    .from('referrals')
    .select('*')
    .eq('referred_email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (referral) {
    // Marcar referral como pago
    await sb.from('referrals').update({ status: 'paid' }).eq('id', referral.id);

    // Contar quantos referrals pagos o indicador já tem
    const { data: paidRefs } = await sb
      .from('referrals')
      .select('id')
      .eq('referrer_email', referral.referrer_email)
      .eq('status', 'paid');

    const paidCount = (paidRefs?.length || 0);

    // Determinar recompensa
    const reward = REWARDS.find(r => paidCount >= r.count);
    if (reward) {
      await sb.from('pro_activations').upsert(
        { email: referral.referrer_email, plan: reward.plan, kiwify_order_id: `referral-reward-${paidCount}` },
        { onConflict: 'email' }
      );
    }
  }

  return new Response(JSON.stringify({ ok: true, email, plan }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
