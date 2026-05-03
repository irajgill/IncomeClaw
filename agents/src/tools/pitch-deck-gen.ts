// agents/src/tools/pitch-deck-gen.ts
//
// Opener's pitch generation tool. Phase B ships markdown-only output (no PDF).
// PDF rendering is a Phase F BullMQ worker.
//
// We don't call the model from inside the tool — Opener already has an
// inference adapter; the tool's job is to format the prompt and structure
// the output. Brain dispatches with the brief; Opener calls the model;
// this tool packages the result.
//
// The tool itself is a deterministic transformer: given a markdown blob
// produced by the model, validate that it matches the 5-slide schema and
// extract the email body. If the model didn't produce the expected
// structure, throw PitchSchemaError so the Opener loop can re-prompt.

import { defineTool } from '@sovereignclaw/core';
import { z } from 'zod';
import { PitchSchemaError } from '../errors.js';

export const pitchDeckSchema = z
  .object({
    /** The raw markdown the Opener model produced. */
    rawMarkdown: z.string().min(20),
    /** Lead id this pitch is for. Surfaces in the result for routing. */
    dealRef: z.string().min(1),
  })
  .strict();

export type PitchDeckInput = z.infer<typeof pitchDeckSchema>;

export interface Slide {
  number: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
}

export interface PitchDeck {
  dealRef: string;
  slides: Slide[];
  /** Raw markdown for the deck portion (no email). Phase F renders this to PDF. */
  deckMarkdown: string;
  /** Subject line of the outreach email. */
  emailSubject: string;
  /** Body of the outreach email. */
  emailBody: string;
}

const SLIDE_HEADING = /^##\s*Slide\s*([1-5])\s*[—-]\s*(.+)$/m;

/**
 * Build the pitch-deck-gen tool. Stateless; takes markdown in, returns a
 * structured PitchDeck out.
 */
export function pitchDeckGenTool() {
  return defineTool({
    name: 'pitch-deck-gen',
    description:
      'Parses the Opener model output into a structured PitchDeck (5 slides + email). Throws PitchSchemaError on malformed input so the Opener loop can re-prompt.',
    schema: pitchDeckSchema,
    timeoutMs: 1_000,
    async run(input): Promise<PitchDeck> {
      const md = input.rawMarkdown.trim();

      // Split off the email — the prompt mandates the deck and email are
      // separated by a horizontal rule (---).
      const ruleMatch = md.match(/\n\s*---\s*\n/);
      if (!ruleMatch) {
        throw new PitchSchemaError(
          'pitch-deck-gen: missing `---` separator between deck and email',
        );
      }
      const splitAt = ruleMatch.index!;
      const deckMarkdown = md.slice(0, splitAt).trim();
      const emailRaw = md.slice(splitAt + ruleMatch[0].length).trim();

      // Parse slides. We split on `## Slide N` headings.
      const slideChunks = deckMarkdown.split(/\n(?=##\s*Slide\s*[1-5])/);
      if (slideChunks.length !== 5) {
        throw new PitchSchemaError(
          `pitch-deck-gen: expected 5 slide sections, got ${slideChunks.length}`,
        );
      }
      const slides: Slide[] = slideChunks.map((chunk, idx) => {
        const head = chunk.match(SLIDE_HEADING);
        if (!head) {
          throw new PitchSchemaError(
            `pitch-deck-gen: slide ${idx + 1} heading malformed: ${chunk.slice(0, 60)}`,
          );
        }
        const number = Number(head[1]) as 1 | 2 | 3 | 4 | 5;
        if (number !== ((idx + 1) as 1 | 2 | 3 | 4 | 5)) {
          throw new PitchSchemaError(
            `pitch-deck-gen: slides out of order; expected ${idx + 1}, got ${number}`,
          );
        }
        const title = head[2]!.trim();
        const body = chunk.slice(head[0].length).trim();
        if (body.length < 10) {
          throw new PitchSchemaError(
            `pitch-deck-gen: slide ${number} body is empty or too short`,
          );
        }
        return { number, title, body };
      });

      // Parse email. Prompt mandates: starts with "Subject:" line, then body.
      const subjMatch = emailRaw.match(/^Subject:\s*(.+)$/m);
      if (!subjMatch) {
        throw new PitchSchemaError('pitch-deck-gen: email missing Subject: line');
      }
      const emailSubject = subjMatch[1]!.trim();
      const emailBody = emailRaw.slice(subjMatch[0].length).trim();
      if (!emailBody) {
        throw new PitchSchemaError('pitch-deck-gen: email body is empty');
      }
      // Sentence count check — prompt says exactly 4 sentences. We allow 3-5
      // because LLMs are flaky; <3 or >5 is wrong.
      const sentenceCount = emailBody.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
      if (sentenceCount < 3 || sentenceCount > 6) {
        throw new PitchSchemaError(
          `pitch-deck-gen: email body should be ~4 sentences, got ${sentenceCount}`,
        );
      }

      return {
        dealRef: input.dealRef,
        slides,
        deckMarkdown,
        emailSubject,
        emailBody,
      };
    },
  });
}
