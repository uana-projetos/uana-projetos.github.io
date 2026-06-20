const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SYSTEM_PROMPT = `Você é nutricionista esportivo brasileiro com 20 anos de experiência. Faz estimativa rápida de calorias e macronutrientes de refeições descritas em texto livre.

REGRAS:
- Use tabela TACO (Universidade Estadual de Campinas) como base. Se não tiver TACO, use USDA traduzido pra alimentos comuns do Brasil.
- Português brasileiro
- Quando a porção não for clara, assume tamanho típico brasileiro (ex: prato, fatia, copo)
- Nunca diagnostica nem prescreve. Apenas estima.
- Sempre cite margem de erro (~15-20%)`;

interface NutritionRequest {
  description: string; // ex: "100g arroz, 150g frango grelhado, 1 banana"
  mealLabel?: string; // ex: "Almoço"
}

function buildUserPrompt(req: NutritionRequest): string {
  return `REFEIÇÃO ${req.mealLabel ? '('+req.mealLabel+')' : ''}:
${req.description}

Estime calorias e macros. Retorne JSON:

{
  "kcal": número total estimado,
  "protein": gramas de proteína,
  "carbs": gramas de carboidrato,
  "fat": gramas de gordura,
  "fiber": gramas de fibra (opcional),
  "items": [
    { "alimento": "nome", "porcao": "ex: 100g", "kcal": número }
  ],
  "observacao": "1 frase curta — ex: refeição balanceada, ou alta em sódio, ou rica em proteína"
}

Retorne APENAS o JSON. Sem texto antes ou depois.`;
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt + '\n\n---\n\n' + userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error('Gemini error ' + res.status + ': ' + errorText);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'gemini_key_missing' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: NutritionRequest = await req.json();
    if (!body.description || !body.description.trim()) {
      return new Response(JSON.stringify({ error: 'missing description' }), { status: 400, headers: corsHeaders });
    }

    const result = await callGemini(SYSTEM_PROMPT, buildUserPrompt(body));
    return new Response(JSON.stringify({ ...result, source: 'gemini-nutrition' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
