export interface ModelOption {
  id: string;
  name: string;
  description: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  tagline: string;
  baseUrl: string;
  models: ModelOption[];
  /** When true, the setup flow will also ask for a custom model string. */
  allowCustomModel?: boolean;
}

export const DEFAULT_PROVIDER_ID = 'openrouter';
export const DEFAULT_MODEL_ID = 'meta-llama/llama-3-70b-instruct';

export const PROVIDERS: ProviderOption[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter (Universal Gateway)',
    tagline: 'Access ALL models (Llama 3, Mistral, Command R+) with one key.',
    baseUrl: 'https://openrouter.ai/api/v1',
    allowCustomModel: true,
    models: [
      { id: 'meta-llama/llama-3-70b-instruct', name: 'Meta Llama 3 70B', description: 'Top-tier open-source reasoning.' },
      { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', description: 'Largest open-source model available.' },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Updated open-source reasoning powerhouse.' },
      { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', description: 'Fast and efficient for quick tasks.' },
      { id: 'mistralai/mistral-large', name: 'Mistral Large', description: 'Elite logic and code generation.' },
      { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', description: 'MoE architecture, fast and capable.' },
      { id: 'mistralai/codestral-latest', name: 'Codestral', description: 'Dedicated code generation model.' },
      { id: 'cohere/command-r-plus', name: 'Command R+', description: 'Built for massive context and RAG workflows.' },
      { id: 'microsoft/wizardlm-2-8x22b', name: 'WizardLM-2', description: 'Incredible coding and debugging performance.' },
      { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro (OR)', description: 'Google flagship via OpenRouter.' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OR)', description: 'Anthropic flagship via OpenRouter.' },
      { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', description: 'Alibaba high-performance reasoning.' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    tagline: 'Industry-leading reasoning and complex architecture.',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest Sonnet—balanced speed and intelligence.' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most powerful Claude. Deep analysis and rewrites.' },
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Blazing speed and elite coding intelligence.' },
      { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', description: 'Heavyweight logic for massive rewrites.' },
      { id: 'claude-3-haiku-latest', name: 'Claude 3 Haiku', description: 'Instant, lightweight task execution.' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'The industry standard.',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Omni-model. Extremely fast across all programming languages.' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Cost-effective logic for smaller repairs.' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Highly reliable instruction following.' },
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Latest GPT-4 series with improved coding.' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Compact GPT-4.1 for fast iteration.' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy workhorse. Fast and cheap.' },
      { id: 'o1', name: 'o1', description: 'Reasoning model for complex multi-step problems.' },
      { id: 'o1-mini', name: 'o1 Mini', description: 'Compact reasoning model.' },
      { id: 'o3', name: 'o3', description: 'Next-gen reasoning with chain-of-thought.' },
      { id: 'o3-mini', name: 'o3 Mini', description: 'Efficient reasoning for lighter workloads.' },
    ],
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    tagline: 'Massive context windows for full-project scanning.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', description: 'Latest thinking model with 1M context.' },
      { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', description: 'Fast thinking model with adaptive reasoning.' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Instant responses. Perfect for background maintenance.' },
      { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', description: 'Enhanced accuracy for complex code analysis.' },
      { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', description: '2M+ token context window. Best for scanning monorepos.' },
      { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', description: 'Lightweight Gemini for rapid fire tasks.' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq (Ultra-Fast)',
    tagline: 'LPU inference. Blazing-fast open-source model hosting.',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Latest Llama on Groq LPU hardware.' },
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', description: 'High-quality open-source at lightning speed.' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Ultra-fast for quick code fixes.' },
      { id: 'llama3-70b-8192', name: 'Llama 3 70B', description: 'Proven reasoning at Groq speed.' },
      { id: 'llama3-8b-8192', name: 'Llama 3 8B', description: 'Lightweight and instant responses.' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'MoE architecture with 32K context.' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B', description: 'Google open model on Groq infrastructure.' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'The open-source reasoning king.',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-coder', name: 'DeepSeek-V4 (Coder)', description: 'Elite logical deduction and bug hunting.' },
      { id: 'deepseek-chat', name: 'DeepSeek-V4 (Chat)', description: 'General purpose, highly efficient reasoning.' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', description: 'Chain-of-thought reasoning specialist.' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    tagline: 'High-performance models with elite logic.',
    baseUrl: 'https://api.minimax.io/v1',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', description: 'Latest high-context reasoning model for deep code analysis.' },
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', description: 'Fast, top-tier reasoning capabilities.' },
      { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax-M2.5 Highspeed', description: 'Faster model for quick terminal interactions.' },
      { id: 'abab6.5s', name: 'abab6.5s', description: 'Legacy high-speed conversational model.' },
      { id: 'abab6.5', name: 'abab6.5', description: 'Legacy flagship model with strong logic.' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    tagline: 'European AI powerhouse. Elite code and reasoning.',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Flagship model for complex architecture.' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', description: 'Balanced speed and intelligence.' },
      { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Fast and cost-effective reasoning.' },
      { id: 'codestral-latest', name: 'Codestral', description: 'Purpose-built code generation and repair.' },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo', description: 'Open-weight 12B parameter model.' },
    ],
  },
];

export function getProvider(id: string): ProviderOption | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  return getProvider(providerId)?.models.find((model) => model.id === modelId);
}

export function getRecommendedProvider(): ProviderOption {
  return getProvider(DEFAULT_PROVIDER_ID) ?? PROVIDERS[0];
}

export function getRecommendedModel(providerId = DEFAULT_PROVIDER_ID): ModelOption | undefined {
  return getProvider(providerId)?.models[0];
}
