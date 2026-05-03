// Agent definitions land in Phase C (gated on @sovereignclaw/core@0.2.0
// + @sovereignclaw/mesh@0.2.0 — see IncomeClaw-Roadmap.md §7 Phase B).
// Phase A ships only the typed errors and the Tavily web-search wrapper
// (used by scripts/smoke-tavily.ts and consumed by Brain + Strategist later).

export * from './errors.js';
export * from './web-search.js';
