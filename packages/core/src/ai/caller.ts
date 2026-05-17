import { GenieConfig } from '../config';
import { asRecord, normalizeApiKey, readArray, readString } from '../utils';
import { DEFAULT_MODEL_ID, getProvider } from './registry';
import { AITaskType, ModelRouter } from './router';

const SYSTEM_PROMPT = 'You are GENIE, an AI maintainability system. Return only valid JSON when asked. No markdown.';
const MAX_TOKENS = 3000;
const TEMPERATURE = 0.1;

interface ChatChoiceResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
    messages?: Array<{
      text?: string;
      content?: string;
    }>;
    text?: string;
  }>;
  reply?: string;
  result?: string;
  text?: string;
  output_text?: string;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface OllamaResponse {
  response?: string;
}

export async function callAI(prompt: string, config: GenieConfig, taskType: AITaskType = 'scan'): Promise<string> {
  const model = config.model || DEFAULT_MODEL_ID;
  const provider = getProvider(config.provider);
  const baseUrl = config.baseUrl ?? provider?.baseUrl;

  switch (config.provider) {
    case 'minimax':
      return minimax(normalizeMiniMaxBaseUrl(baseUrl), normalizeMiniMaxModel(model), config.apiKey, prompt);
    case 'anthropic':
      return anthropic(baseUrl ?? 'https://api.anthropic.com/v1', model, config.apiKey, prompt);
    case 'openrouter': {
      const routedModel = ModelRouter(taskType);
      return openaiCompat(baseUrl ?? 'https://openrouter.ai/api/v1', routedModel, config.apiKey, prompt);
    }
    case 'openai':
    case 'deepseek':
      return openaiCompat(baseUrl ?? 'https://api.openai.com/v1', model, config.apiKey, prompt);
    case 'google':
    case 'gemini':
      return gemini(baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta', model, config.apiKey, prompt);
    case 'mistral':
      return openaiCompat('https://api.mistral.ai/v1', model, config.apiKey, prompt);
    case 'groq':
      return openaiCompat('https://api.groq.com/openai/v1', model, config.apiKey, prompt);
    case 'local':
      return local(model, prompt);
    default:
      if (baseUrl) return openaiCompat(baseUrl, model, config.apiKey, prompt);
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

async function minimax(baseUrl: string, model: string, key: string, prompt: string): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/text/chatcompletion_v2`, {
    method: 'POST',
    headers: jsonBearerHeaders(key),
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  await assertOk(response, 'MiniMax');
  const data = (await response.json()) as ChatChoiceResponse;
  assertMiniMaxOk(data);
  return extractChatText(data);
}

async function anthropic(baseUrl: string, model: string, key: string, prompt: string): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalizeApiKey(key)}`,
      'x-api-key': normalizeApiKey(key),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  await assertOk(response, 'Anthropic');
  const data = (await response.json()) as AnthropicResponse;
  return data.content?.map((part) => part.text ?? '').join('').trim() ?? '';
}

async function openaiCompat(baseUrl: string, model: string, key: string, prompt: string): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: jsonBearerHeaders(key),
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  await assertOk(response, baseUrl);
  const data = (await response.json()) as ChatChoiceResponse;
  return extractChatText(data);
}

async function gemini(baseUrl: string, model: string, key: string, prompt: string): Promise<string> {
  const endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent`);
  endpoint.searchParams.set('key', key);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_TOKENS,
      },
    }),
  });

  await assertOk(response, 'Gemini');
  const data = (await response.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

async function local(model: string, prompt: string): Promise<string> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: TEMPERATURE,
      },
      prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
    }),
  });

  await assertOk(response, 'Ollama');
  const data = (await response.json()) as OllamaResponse;
  return data.response ?? '';
}

async function assertOk(response: Response, providerName: string): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw new Error(`${providerName} ${response.status}: ${body || response.statusText}`);
}

function assertMiniMaxOk(value: unknown): void {
  const baseResp = asRecord(asRecord(value).base_resp);
  const statusCode = baseResp.status_code;
  if (typeof statusCode !== 'number' || statusCode === 0) return;
  const statusMessage = readString(baseResp.status_msg) || `status_code ${statusCode}`;
  throw new Error(`MiniMax ${statusCode}: ${statusMessage}`);
}

function extractChatText(value: unknown): string {
  const record = asRecord(value);
  const direct = readString(record.reply)
    || readString(record.result)
    || readString(record.text)
    || readString(record.output_text);
  if (direct) return direct;

  const data = asRecord(record.data);
  if (Object.keys(data).length > 0) {
    const nested = extractChatText(data);
    if (nested) return nested;
  }

  for (const choice of readArray(record.choices)) {
    const choiceRecord = asRecord(choice);
    const message = asRecord(choiceRecord.message);
    const messageContent = readContent(message.content);
    if (messageContent) return messageContent;

    const choiceText = readString(choiceRecord.text);
    if (choiceText) return choiceText;

    const messages = readArray(choiceRecord.messages)
      .map((item) => {
        const itemRecord = asRecord(item);
        return readString(itemRecord.text) || readContent(itemRecord.content);
      })
      .filter(Boolean)
      .join('');
    if (messages) return messages;
  }

  return '';
}

function readContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      const partRecord = asRecord(part);
      return readString(partRecord.text) || readString(partRecord.content);
    })
    .filter(Boolean)
    .join('');
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

function normalizeMiniMaxModel(model: string): string {
  const legacyModels: Record<string, string> = {
    'minimax-2.5': 'MiniMax-M2.5',
    'abab6.5s': 'MiniMax-M2.5-highspeed',
    'MiniMax-Text-01': 'MiniMax-M2.5',
  };
  return legacyModels[model] ?? model;
}
