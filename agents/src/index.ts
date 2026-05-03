// Phase A shipped: typed errors + Tavily web-search wrapper.
// Phase B (this commit) adds: 4 tools and 5 agent factories.
// Per IncomeClaw-Roadmap.md §7 Phase B and §13 working agreement #5
// (single public surface — no internal-reach across packages).

export * from './errors.js';
export * from './web-search.js';

// Tools
export * from './tools/lead-search.js';
export * from './tools/pitch-deck-gen.js';
export * from './tools/contract-gen.js';
export * from './tools/pay-onchain.js';

// Agent factories
export * from './brain.js';
export * from './strategist.js';
export * from './opener.js';
export * from './closer.js';
export * from './operator.js';
export * from './shared.js';

// Phase C — mesh wiring
export * from './mesh.js';
