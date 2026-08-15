/* eslint-disable @typescript-eslint/no-explicit-any */
export async function executeLlmCall(config: any, input: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const configuredModel = config.model;
  const deprecatedModels = new Set([
    'gemini-1.5-flash',
    'gemini-1.5-flash-001',
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview',
    'gemini-2.5-flash-preview-09-25'
  ]);

  const model =
    !configuredModel || deprecatedModels.has(configuredModel)
      ? 'gemini-3.6-flash'
      : configuredModel;

  console.log(`[LLM] model=${model}`);
  
  const systemPrompt = config.prompt || 'You are a helpful assistant.';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: `System: ${systemPrompt}\n\nUser Input: ${input}` }]
      }
    ]
  };

  // Implement 1 retry
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM API Error: Status ${res.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text };
    } catch (e: any) {
      lastError = e;
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 1000)); // sleep 1s before retry
      }
    }
  }

  throw new Error(`LLM call failed after 2 attempts. Last error: ${lastError?.message}`);
}
