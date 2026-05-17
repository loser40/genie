import { getInjectText } from '@genie-ai/core';

export async function injectCommand(projectPath?: string): Promise<void> {
  console.log(await getInjectText(projectPath ?? process.cwd()));
}
