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
