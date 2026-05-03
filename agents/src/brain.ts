// agents/src/brain.ts — strategic orchestrator. Phase B agent factory.
// Inputs: leads (via lead-search tool) + own memory.
// Output: dispatch JSON for the rest of the team. Reflection enabled.

import { Agent, type Tool } from '@sovereignclaw/core';
import {
  buildInferenceAdapter,
  buildMemory,
  loadSystemPrompt,
  type AgentEnv,
} from './shared.js';
import { leadSearchTool } from './tools/lead-search.js';

export interface BrainOptions {
  env: AgentEnv;
  /** Override the leads file path (mostly for tests). */
  leadsPath?: string;
}

/**
 * Construct the Brain agent. Caller is responsible for `await agent.close()`
 * once they're done so memory providers release resources cleanly.
 */
export async function createBrainAgent(options: BrainOptions): Promise<Agent> {
  const { env } = options;
  const memory = await buildMemory(env, 'brain');
  const systemPrompt = await loadSystemPrompt('brain');
  const tools: Tool[] = [
    leadSearchTool(options.leadsPath ? { leadsPath: options.leadsPath } : {}),
  ];

  return new Agent({
    role: 'brain',
    inference: buildInferenceAdapter(env),
    memory: memory.state,
    history: memory.history,
    systemPrompt,
    tools,
    temperature: 0.2,
    maxTokens: 800,
  });
}
