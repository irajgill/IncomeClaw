// agents/src/opener.ts — pitch + outreach generator.
//
// Tools: pitch-deck-gen for parsing the model output into a structured
// PitchDeck. The Opener typically calls inference once, hands the raw
// markdown to the tool, and returns the structured deck. The tool throws
// PitchSchemaError if the model didn't follow the prompt — caller decides
// whether to retry.

import { Agent, type Tool } from '@sovereignclaw/core';
import { buildInferenceAdapter, buildMemory, loadSystemPrompt, type AgentEnv } from './shared.js';
import { pitchDeckGenTool } from './tools/pitch-deck-gen.js';

export interface OpenerOptions {
  env: AgentEnv;
}

export async function createOpenerAgent(options: OpenerOptions): Promise<Agent> {
  const { env } = options;
  const memory = await buildMemory(env, 'opener');
  const systemPrompt = await loadSystemPrompt('opener');
  const tools: Tool[] = [pitchDeckGenTool()];

  return new Agent({
    role: 'opener',
    inference: buildInferenceAdapter(env),
    memory: memory.state,
    history: memory.history,
    systemPrompt,
    tools,
    temperature: 0.7,
    maxTokens: 900,
  });
}
