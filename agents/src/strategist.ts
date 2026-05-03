// agents/src/strategist.ts — research agent. Reads target brief, writes
// 200-word dossier. Phase B v0 has no tools (Tavily wrapper is consumed in a
// later iteration via the optional `webSearch` injection — keeps this
// factory's API simple now).

import { Agent } from '@sovereignclaw/core';
import { buildInferenceAdapter, buildMemory, loadSystemPrompt, type AgentEnv } from './shared.js';

export interface StrategistOptions {
  env: AgentEnv;
}

export async function createStrategistAgent(options: StrategistOptions): Promise<Agent> {
  const { env } = options;
  const memory = await buildMemory(env, 'strategist');
  const systemPrompt = await loadSystemPrompt('strategist');

  return new Agent({
    role: 'strategist',
    inference: buildInferenceAdapter(env),
    memory: memory.state,
    history: memory.history,
    systemPrompt,
    temperature: 0.4,
    maxTokens: 600,
  });
}
