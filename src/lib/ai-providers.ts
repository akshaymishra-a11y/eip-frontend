import type { AiProviderName } from './types';

export type AiProviderOption = {
  id: AiProviderName;
  label: string;
  models: { id: string; label: string }[];
};

// Curated, not free-form — keeps the dropdown to models actually worth
// picking rather than every historical name each provider has shipped.
export const AI_PROVIDERS: AiProviderOption[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast, default)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast)' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
    ],
  },
];

export function defaultModelFor(provider: AiProviderName): string {
  return AI_PROVIDERS.find((p) => p.id === provider)!.models[0].id;
}
