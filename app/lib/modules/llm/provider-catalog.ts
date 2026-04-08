import type { ProviderInfo } from '~/types/model';
import {
  FREE_HOSTED_MODEL,
  FREE_HOSTED_MODEL_LABEL,
  FREE_HOSTED_MODEL_MAX_TOKENS,
} from '~/lib/modules/llm/free-provider-config';

export const DEFAULT_PROVIDER_NAME = 'FREE';
export const DEFAULT_MODEL_NAME = FREE_HOSTED_MODEL;

export const PROVIDER_BASE_URL_ENV_KEYS: Record<string, { baseUrlKey?: string; apiTokenKey?: string }> = {
  FREE: { apiTokenKey: 'FREE_OPENROUTER_API_KEY' },
  Anthropic: { apiTokenKey: 'ANTHROPIC_API_KEY' },
  AmazonBedrock: { apiTokenKey: 'AWS_BEDROCK_CONFIG' },
  Cerebras: { apiTokenKey: 'CEREBRAS_API_KEY' },
  Cohere: { apiTokenKey: 'COHERE_API_KEY' },
  DeepSeek: { apiTokenKey: 'DEEPSEEK_API_KEY' },
  Fireworks: { apiTokenKey: 'FIREWORKS_API_KEY' },
  GitHub: { apiTokenKey: 'GITHUB_API_KEY' },
  Google: { apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  Groq: { apiTokenKey: 'GROQ_API_KEY' },
  HuggingFace: { apiTokenKey: 'HuggingFace_API_KEY' },
  Hyperbolic: { apiTokenKey: 'HYPERBOLIC_API_KEY' },
  LMStudio: { baseUrlKey: 'LMSTUDIO_API_BASE_URL' },
  Mistral: { apiTokenKey: 'MISTRAL_API_KEY' },
  Moonshot: { apiTokenKey: 'MOONSHOT_API_KEY' },
  Ollama: { baseUrlKey: 'OLLAMA_API_BASE_URL' },
  OpenAI: { apiTokenKey: 'OPENAI_API_KEY' },
  OpenAILike: {
    baseUrlKey: 'OPENAI_LIKE_API_BASE_URL',
    apiTokenKey: 'OPENAI_LIKE_API_KEY',
  },
  OpenRouter: { apiTokenKey: 'OPEN_ROUTER_API_KEY' },
  Perplexity: { apiTokenKey: 'PERPLEXITY_API_KEY' },
  Together: {
    baseUrlKey: 'TOGETHER_API_BASE_URL',
    apiTokenKey: 'TOGETHER_API_KEY',
  },
  xAI: { apiTokenKey: 'XAI_API_KEY' },
  ZAI: {
    baseUrlKey: 'ZAI_BASE_URL',
    apiTokenKey: 'ZAI_API_KEY',
  },
};

export const PROVIDER_CATALOG: ProviderInfo[] = [
  {
    name: 'FREE',
    staticModels: [
      {
        name: DEFAULT_MODEL_NAME,
        label: FREE_HOSTED_MODEL_LABEL,
        provider: 'FREE',
        maxTokenAllowed: FREE_HOSTED_MODEL_MAX_TOKENS,
      },
    ],
    allowsUserApiKey: false,
  },
  { name: 'OpenAI', staticModels: [] },
  { name: 'Anthropic', staticModels: [] },
  {
    name: 'OpenRouter',
    staticModels: [],
    getApiKeyLink: 'https://openrouter.ai/settings/keys',
  },
  {
    name: 'Google',
    staticModels: [],
    getApiKeyLink: 'https://aistudio.google.com/app/apikey',
  },
  {
    name: 'DeepSeek',
    staticModels: [],
    getApiKeyLink: 'https://platform.deepseek.com/apiKeys',
  },
  {
    name: 'Groq',
    staticModels: [],
    getApiKeyLink: 'https://console.groq.com/keys',
  },
  {
    name: 'Cohere',
    staticModels: [],
    getApiKeyLink: 'https://dashboard.cohere.com/api-keys',
  },
  {
    name: 'Mistral',
    staticModels: [],
    getApiKeyLink: 'https://console.mistral.ai/api-keys/',
  },
  {
    name: 'LMStudio',
    staticModels: [],
    getApiKeyLink: 'https://lmstudio.ai/',
    labelForGetApiKey: 'Get LMStudio',
    icon: 'i-ph:cloud-arrow-down',
  },
  {
    name: 'Ollama',
    staticModels: [],
    getApiKeyLink: 'https://ollama.com/download',
    labelForGetApiKey: 'Download Ollama',
    icon: 'i-ph:cloud-arrow-down',
  },
  {
    name: 'Together',
    staticModels: [],
    getApiKeyLink: 'https://api.together.xyz/settings/api-keys',
  },
  { name: 'OpenAILike', staticModels: [] },
  {
    name: 'Fireworks',
    staticModels: [],
    getApiKeyLink: 'https://fireworks.ai/api-keys',
  },
  {
    name: 'Cerebras',
    staticModels: [],
    getApiKeyLink: 'https://cloud.cerebras.ai/settings',
  },
  {
    name: 'xAI',
    staticModels: [],
    getApiKeyLink: 'https://docs.x.ai/docs/quickstart#creating-an-api-key',
  },
  {
    name: 'Hyperbolic',
    staticModels: [],
    getApiKeyLink: 'https://app.hyperbolic.xyz/settings',
  },
  {
    name: 'HuggingFace',
    staticModels: [],
    getApiKeyLink: 'https://huggingface.co/settings/tokens',
  },
  {
    name: 'GitHub',
    staticModels: [],
    getApiKeyLink: 'https://github.com/settings/personal-access-tokens',
  },
  {
    name: 'Moonshot',
    staticModels: [],
    getApiKeyLink: 'https://platform.moonshot.ai/console/api-keys',
  },
  {
    name: 'Perplexity',
    staticModels: [],
    getApiKeyLink: 'https://www.perplexity.ai/settings/api',
  },
  {
    name: 'AmazonBedrock',
    staticModels: [],
    getApiKeyLink: 'https://console.aws.amazon.com/iam/home',
  },
  {
    name: 'ZAI',
    staticModels: [],
    getApiKeyLink: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
];

export const DEFAULT_PROVIDER =
  PROVIDER_CATALOG.find((provider) => provider.name === DEFAULT_PROVIDER_NAME) || PROVIDER_CATALOG[0];
