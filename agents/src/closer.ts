// agents/src/closer.ts — negotiation + terms agent.
//
// In v0 the Closer reads from data/canned-negotiation.json (roadmap §5.4 and
// §13/I3). The model's job is to format the agreed terms as the JSON schema
// in the prompt; production deployments would do live negotiation through a
// chat UI.
//
// Reflection is intentionally OFF — early experiments showed reflection
// produced more bloated terms, not better ones. Revisit in v2 with a
// rubric tuned for negotiation outcomes.

import { Agent } from '@sovereignclaw/core';
import { buildInferenceAdapter, buildMemory, loadSystemPrompt, type AgentEnv } from './shared.js';

export interface CloserOptions {
  env: AgentEnv;
}

export async function createCloserAgent(options: CloserOptions): Promise<Agent> {
  const { env } = options;
  const memory = await buildMemory(env, 'closer');
  const systemPrompt = await loadSystemPrompt('closer');

  return new Agent({
    role: 'closer',
    inference: buildInferenceAdapter(env),
    memory: memory.state,
    history: memory.history,
    systemPrompt,
    temperature: 0.3,
    maxTokens: 700,
  });
}
