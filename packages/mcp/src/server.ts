#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getInjectText, loadCapsule, scanProject } from '@genie-ai/core';

interface ToolArguments {
  projectPath?: unknown;
  skipAI?: unknown;
}

const server = new Server(
  { name: 'genie', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'genie_scan',
      description: 'Scan a project for maintainability issues: duplicates, circular dependencies, orphan files, and graph health.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Absolute path to the project' },
          skipAI: { type: 'boolean', description: 'Skip AI layer for faster structural-only scan' },
        },
        required: ['projectPath'],
      },
    },
    {
      name: 'genie_inject',
      description: 'Load Wish Capsule context for the /genie command.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Absolute path to the project' },
        },
        required: ['projectPath'],
      },
    },
    {
      name: 'genie_capsule',
      description: 'Get full Wish Capsule JSON for a project.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Absolute path to the project' },
        },
        required: ['projectPath'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as ToolArguments;

  if (request.params.name === 'genie_scan') {
    const projectPath = readProjectPath(args);
    const skipAI = typeof args.skipAI === 'boolean' ? args.skipAI : true;
    const result = await scanProject({ projectPath, skipAI });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          healthScore: result.graph.healthScore,
          filesScanned: result.filesScanned,
          circularChains: result.deps.circularChains,
          duplicateGroups: result.duplicates.length,
          issues: result.ai?.issues.slice(0, 10) ?? [],
          capsuleCreated: Boolean(result.capsule),
        }, null, 2),
      }],
    };
  }

  if (request.params.name === 'genie_inject') {
    return {
      content: [{ type: 'text', text: await getInjectText(readProjectPath(args)) }],
    };
  }

  if (request.params.name === 'genie_capsule') {
    const capsule = await loadCapsule(readProjectPath(args));
    return {
      content: [{ type: 'text', text: JSON.stringify(capsule, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

function readProjectPath(args: ToolArguments): string {
  if (typeof args.projectPath !== 'string' || args.projectPath.trim().length === 0) {
    throw new Error('projectPath is required');
  }
  return args.projectPath;
}
