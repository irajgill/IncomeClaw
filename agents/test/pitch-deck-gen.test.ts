import { describe, expect, it } from 'vitest';
import { pitchDeckGenTool } from '../src/tools/pitch-deck-gen.js';
import { PitchSchemaError } from '../src/errors.js';

const VALID = `## Slide 1 — Acme Order Intake
Order intake desk SLA breach is creeping past 12% — board memo wants AI ops in 2026.

## Slide 2 — Problem
Manual intake desk eats 25 hours per week and 12% SLA breach hurts the warranty book.

## Slide 3 — Solution
30/60/90: stand up AI-assisted intake by day 30, RMA loop by 60, full handoff by 90.

## Slide 4 — Proof
SLA-tied fees: if breach rate doesn't drop below 6% by month four, you withhold 30% of the fee.

## Slide 5 — Ask
Tuesday 2pm Pittsburgh time, 45 minutes, with Maya and procurement, term sheet in advance.

---

Subject: AI-assisted ops for Acme — board-mandate aligned

Saw the Q1 board memo flag AI-assisted operations as a 2026 mandate. The intake desk is the fastest wedge — most measurable, lowest political surface area. Could we get 45 minutes Tuesday with Maya and procurement to walk through a SLA-tied pilot? I'll send the term sheet in advance so the meeting is sign-or-pass, not learn-and-evaluate.`;

describe('pitch-deck-gen', () => {
  it('parses a valid 5-slide + 4-sentence-email markdown', async () => {
    const tool = pitchDeckGenTool();
    const out = await tool.run({ rawMarkdown: VALID, dealRef: 'ACME-2026-01' });
    expect(out.slides).toHaveLength(5);
    expect(out.slides.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(out.slides[0]!.title).toBe('Acme Order Intake');
    expect(out.emailSubject).toBe('AI-assisted ops for Acme — board-mandate aligned');
    expect(out.emailBody).toMatch(/Saw the Q1 board memo/);
    expect(out.deckMarkdown).not.toContain('Subject:');
    expect(out.dealRef).toBe('ACME-2026-01');
  });

  it('throws PitchSchemaError when --- separator missing', async () => {
    const tool = pitchDeckGenTool();
    await expect(
      tool.run({ rawMarkdown: VALID.replace('---', ''), dealRef: 'X' }),
    ).rejects.toBeInstanceOf(PitchSchemaError);
  });

  it('throws PitchSchemaError when slide count is wrong', async () => {
    const tool = pitchDeckGenTool();
    const broken = VALID.replace(/## Slide 5 — Ask[\s\S]*?(?=\n---)/, '');
    await expect(tool.run({ rawMarkdown: broken, dealRef: 'X' })).rejects.toBeInstanceOf(
      PitchSchemaError,
    );
  });

  it('throws PitchSchemaError when slides are out of order', async () => {
    const tool = pitchDeckGenTool();
    const swapped = VALID.replace('## Slide 2 — Problem', '## Slide 3 — Wrong');
    await expect(tool.run({ rawMarkdown: swapped, dealRef: 'X' })).rejects.toBeInstanceOf(
      PitchSchemaError,
    );
  });

  it('throws PitchSchemaError when email Subject: missing', async () => {
    const tool = pitchDeckGenTool();
    const noSubj = VALID.replace(/Subject:.*\n/, '');
    await expect(tool.run({ rawMarkdown: noSubj, dealRef: 'X' })).rejects.toBeInstanceOf(
      PitchSchemaError,
    );
  });
});
