import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { asRecord, loadConfig, PROVIDERS, saveConfig } from '@genie-ai/core';
import { normalizeApiKey, testProviderKey } from '../utils/test-key.js';

const KEY_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/app/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  minimax: 'https://www.minimax.io/platform/user-center/basic-information/interface-key',
  openai: 'https://platform.openai.com/api-keys',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
};

export async function setupCommand(options: { reset?: boolean } = {}): Promise<void> {
  console.clear();
  console.log(chalk.magenta('GENIE setup'));
  console.log(chalk.gray('Your key is stored only at ~/.genie/config.json with owner-only file permissions.\n'));

  const existing = await loadConfig();
  if (existing?.setupComplete && !options.reset) {
    console.log(chalk.gray('Already configured: ') + chalk.cyan(`${existing.provider} / ${existing.model}`));
    const { redo } = await inquirer.prompt<{ redo: boolean }>([{
      type: 'confirm',
      name: 'redo',
      message: 'Reconfigure?',
      default: false,
    }]);
    if (!redo) return;
  }

  // CACHE WIPE: Completely clear the in-memory config state before re-prompting.
  // This prevents stale provider/model/key values from the previous run from leaking through.
  console.log(chalk.gray('Clearing previous configuration state...\n'));

  const { providerId } = await inquirer.prompt<{ providerId: string }>([{
    type: 'select',
    name: 'providerId',
    message: 'Choose your AI provider',
    pageSize: 12,
    choices: PROVIDERS.map((provider) => ({
      name: `${provider.name.padEnd(34)} ${provider.tagline}`,
      value: provider.id,
      short: provider.name,
    })),
  } as never]);

  const provider = PROVIDERS.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  let modelId = 'auto';
  let validationModelId = provider.models[0]?.id ?? 'auto';

  if (provider.allowCustomModel) {
    // OpenRouter and similar: offer preset models plus a custom model input option.
    const presetChoices = provider.models.map((model) => ({
      name: `${model.name.padEnd(28)} ${model.description}`,
      value: model.id,
      short: model.name,
    }));
    presetChoices.push({
      name: '✏️  Custom model string         Enter any model identifier manually.',
      value: '__custom__',
      short: 'Custom',
    });

    const answer = await inquirer.prompt<{ modelId: string }>([{
      type: 'select',
      name: 'modelId',
      message: `Choose a ${provider.name} model`,
      pageSize: 16,
      choices: presetChoices,
    } as never]);

    if (answer.modelId === '__custom__') {
      const { customModel } = await inquirer.prompt<{ customModel: string }>([{
        type: 'input',
        name: 'customModel',
        message: 'Enter the full model identifier (e.g. meta-llama/llama-3-70b-instruct):',
        validate: (value: string) => value.trim().length >= 3 || 'Model ID too short',
      }]);
      modelId = customModel.trim();
      validationModelId = modelId;
    } else {
      modelId = answer.modelId;
      validationModelId = answer.modelId;
    }
  } else {
    const answer = await inquirer.prompt<{ modelId: string }>([{
      type: 'select',
      name: 'modelId',
      message: `Choose a ${provider.name} model`,
      pageSize: 14,
      choices: provider.models.map((model) => ({
        name: `${model.name.padEnd(28)} ${model.description}`,
        value: model.id,
        short: model.name,
      })),
    } as never]);
    modelId = answer.modelId;
    validationModelId = answer.modelId;
  }

  console.log(chalk.gray(`\nGet your key: ${KEY_URLS[provider.id] ?? provider.baseUrl}\n`));
  const { key } = await inquirer.prompt<{ key: string }>([{
    type: 'password',
    name: 'key',
    mask: '*',
    message: `Paste your ${provider.name} API key`,
    validate: (value: string) => value.trim().length >= 10 || 'Key too short',
  }]);
  const apiKey = normalizeApiKey(key);

  const spinner = ora('Testing API key...').start();
  try {
    await testSetupProviderKey(providerId, validationModelId, apiKey);
    spinner.succeed('API key works');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(message);
    const { saveAnyway } = await inquirer.prompt<{ saveAnyway: boolean }>([{
      type: 'confirm',
      name: 'saveAnyway',
      message: 'Save this key anyway?',
      default: false,
    }]);
    if (!saveAnyway) return;
  }

  await saveConfig({
    provider: providerId,
    model: modelId,
    baseUrl: provider.baseUrl,
    apiKey,
    setupComplete: true,
    setupAt: new Date().toISOString(),
  });

  const modelName = modelId === 'auto'
    ? 'auto (dynamic routing)'
    : provider.models.find((model) => model.id === modelId)?.name ?? modelId;
  console.log(chalk.green('\nGENIE is ready.'));
  console.log(chalk.gray('Provider: ') + chalk.cyan(provider.name));
  console.log(chalk.gray('Model:    ') + chalk.cyan(modelName));
  console.log(chalk.gray('Config:   ~/.genie/config.json\n'));
}

async function testSetupProviderKey(providerId: string, modelId: string, apiKey: string): Promise<void> {
  if (providerId === 'minimax') {
    await testMiniMaxSetupKey(apiKey);
    return;
  }

  await testProviderKey(providerId, modelId, apiKey);
}

async function testMiniMaxSetupKey(apiKey: string): Promise<void> {
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: 'test' }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MiniMax key test failed: ${text || response.statusText}`);
  }

  assertMiniMaxSetupPayload(text);
}

function assertMiniMaxSetupPayload(text: string): void {
  const payload = parseJsonRecord(text);
  const baseResp = asRecord(payload.base_resp);
  const statusCode = baseResp.status_code;
  if (typeof statusCode !== 'number' || statusCode === 0) return;

  const statusMessage = typeof baseResp.status_msg === 'string'
    ? baseResp.status_msg
    : `status_code ${statusCode}`;
  throw new Error(`MiniMax key test failed: ${statusMessage}`);
}

function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    return asRecord(value);
  } catch {
    return {};
  }
}
