import { readSettings } from '../settings/settings-service';
import { readAiCredentials } from './ai-credentials';
import { defaultModel, type AiProvider, type ResolvedAi } from './chat';

const VALID_PROVIDERS: AiProvider[] = ['claude-cli', 'anthropic', 'openai'];

/**
 * Resolve the active AI configuration from settings (provider + optional model override) and the
 * credentials file (the API key for the chosen provider). Defaults to the local `claude` CLI.
 */
export async function resolveAi(settingsPath: string, credentialsPath: string): Promise<ResolvedAi> {
  const settings = await readSettings(settingsPath);
  const provider: AiProvider = VALID_PROVIDERS.includes(settings.aiProvider as AiProvider)
    ? (settings.aiProvider as AiProvider)
    : 'claude-cli';
  const model = settings.aiModel?.trim() || defaultModel(provider);
  if (provider === 'claude-cli') return { provider, model };
  const creds = await readAiCredentials(credentialsPath);
  return { provider, model, apiKey: provider === 'anthropic' ? creds.anthropic : creds.openai };
}

/** Fast, cheap per-provider default for inline completion — latency matters more than depth here. */
function completionDefaultModel(provider: AiProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-haiku-4-5';
    case 'openai':
      return 'gpt-4o-mini';
    default:
      return 'claude-haiku-4-5'; // claude-cli: ask the CLI for the fast model
  }
}

/**
 * Like {@link resolveAi}, but for inline ghost-text completion: defaults to a low-latency model
 * (Haiku / gpt-4o-mini) rather than the assistant's heavier model, since completions fire on every
 * typing pause. Honors an explicit `aiCompletionModel` override when set.
 */
export async function resolveCompletionAi(
  settingsPath: string,
  credentialsPath: string,
): Promise<ResolvedAi> {
  const settings = await readSettings(settingsPath);
  const provider: AiProvider = VALID_PROVIDERS.includes(settings.aiProvider as AiProvider)
    ? (settings.aiProvider as AiProvider)
    : 'claude-cli';
  const model = settings.aiCompletionModel?.trim() || completionDefaultModel(provider);
  if (provider === 'claude-cli') return { provider, model };
  const creds = await readAiCredentials(credentialsPath);
  return { provider, model, apiKey: provider === 'anthropic' ? creds.anthropic : creds.openai };
}
