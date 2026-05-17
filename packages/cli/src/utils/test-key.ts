import { getProvider, normalizeApiKey } from '@genie-ai/core';

export { normalizeApiKey } from '@genie-ai/core';

export async function testProviderKey(provider: string, model: string, key: string): Promise<void> {
  const ping = 'Reply with exactly: {"ok":true}';
  const providerOption = getProvider(provider);
  const baseUrl = providerOption?.baseUrl;

  if (provider === 'minimax') {
    const response = await fetch(`${normalizeMiniMaxBaseUrl(baseUrl)}/models`, {
      method: 'GET',
      headers: jsonBearerHeaders(key),
    });
    await assertOk(response, 'MiniMax');
    assertMiniMaxPayload(await response.json().catch(() => null));
    return;
  }

  if (provider === 'anthropic') {
    await assertOk(await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizeApiKey(key)}`,
        'x-api-key': normalizeApiKey(key),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 20, messages: [{ role: 'user', content: ping }] }),
    }), 'Anthropic');
    return;
  }

  if (provider === 'google' || provider === 'gemini') {
    const endpoint = new URL(`${(baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${model}:generateContent`);
    endpoint.searchParams.set('key', key);
    await assertOk(await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: ping }] }] }),
    }), 'Gemini');
    return;
  }

  if (provider === 'groq') {
    await assertOk(await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: jsonBearerHeaders(key),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: ping }], max_tokens: 20 }),
    }), 'Groq');
    return;
  }

  if (provider === 'mistral') {
    await assertOk(await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: jsonBearerHeaders(key),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: ping }], max_tokens: 20 }),
    }), 'Mistral');
    return;
  }

  if (provider === 'openrouter' || provider === 'openai' || provider === 'deepseek') {
    await assertOk(await fetch(`${(baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: jsonBearerHeaders(key),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: ping }], max_tokens: 20 }),
    }), provider);
    return;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function jsonBearerHeaders(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${normalizeApiKey(key)}`,
  };
}

function normalizeMiniMaxBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? 'https://api.minimax.io/v1')
    .replace('https://api.minimax.chat/v1', 'https://api.minimax.io/v1')
    .replace(/\/$/, '');
}

async function assertOk(response: Response, provider: string): Promise<void> {
  if (response.ok) return;
  throw new Error(`${provider} key test failed: ${await response.text()}`);
}

function assertMiniMaxPayload(value: unknown): void {
  const record = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const baseResp = record.base_resp !== null && typeof record.base_resp === 'object'
    ? record.base_resp as Record<string, unknown>
    : {};
  const statusCode = baseResp.status_code;
  if (typeof statusCode !== 'number' || statusCode === 0) return;
  const statusMessage = typeof baseResp.status_msg === 'string' ? baseResp.status_msg : `status_code ${statusCode}`;
  throw new Error(`MiniMax key test failed: ${statusMessage}`);
}
