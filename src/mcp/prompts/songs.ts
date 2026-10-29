import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function userMessage(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

const HARD_RULES = `
Before tools: read hosanna://skills/hosanna-safe-data and the song skill(s) named in this prompt.
Hard rules:
- Never fabricate lyrics, chords, verses, or present invented content as authentic.
- Never silently drop information from the document.
- Read hosanna://chordpro/guide and hosanna://chordpro/features when unsure.
- Validate with chordpro.validate before presenting a final proposal.
- Persist only with songs.save after the user explicitly approves.
`;

export function registerSongPrompts(server: McpServer): void {
  server.registerPrompt(
    "songs.create",
    {
      title: "Create a song",
      description:
        "Help create a new ChordPro song from user input; validate and present before saving.",
      argsSchema: z.object({
        title: z.string().optional(),
        artist: z.string().optional(),
        instructions: z.string().optional(),
      }),
    },
    ({ title, artist, instructions }) =>
      userMessage(`Objective: create a new Hosanna song.

Given:
- title: ${title ?? "(ask if missing)"}
- artist: ${artist ?? "(ask if missing)"}
- instructions: ${instructions ?? "(none)"}

Workflow:
1. Read hosanna://skills/chordpro-create and hosanna://skills/hosanna-safe-data.
2. Ask for missing essential metadata (title, artist, key if needed).
3. Read hosanna://chordpro/guide and hosanna://chordpro/examples/valid.
4. Draft ChordPro using supported syntax only.
5. Call songs.create_draft then chordpro.validate.
6. Present the proposal; save with songs.save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.edit",
    {
      title: "Edit a song",
      description:
        "Modify an existing song per instructions; preserve unrelated content; show proposed changes.",
      argsSchema: z.object({
        songId: z.string(),
        instructions: z.string(),
      }),
    },
    ({ songId, instructions }) =>
      userMessage(`Objective: edit song ${songId}.

Instructions: ${instructions}

Workflow:
1. Read hosanna://skills/songs-edit-fix and hosanna://skills/hosanna-safe-data.
2. songs.get to load current content.
3. Make only the requested changes; preserve unrelated lyrics/metadata/variants.
4. songs.propose_edit with the new content.
5. Show the diff; songs.save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.fix",
    {
      title: "Fix a song",
      description:
        "Inspect malformed ChordPro, explain issues, propose corrections without inventing lyrics.",
      argsSchema: z.object({
        songId: z.string(),
      }),
    },
    ({ songId }) =>
      userMessage(`Objective: fix ChordPro issues in song ${songId}.

Workflow:
1. Read hosanna://skills/songs-edit-fix and hosanna://skills/hosanna-safe-data.
2. songs.get and chordpro.validate / songs.propose_fix.
3. Explain each problem in plain language.
4. Propose corrections that preserve original lyrics and meaning.
5. Do not invent missing lyrics or silently remove information.
6. Present proposal; songs.save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.complete",
    {
      title: "Complete a song document",
      description:
        "Complete unfinished ChordPro structure/metadata; never fabricate musical content.",
      argsSchema: z.object({
        songId: z.string().optional(),
        content: z.string().optional(),
        instructions: z.string().optional(),
      }),
    },
    ({ songId, content, instructions }) =>
      userMessage(`Objective: complete an unfinished ChordPro document.

songId: ${songId ?? "(none — use provided content)"}
content provided: ${content ? "yes" : "no"}
instructions: ${instructions ?? "(none)"}

Workflow:
1. Read hosanna://skills/songs-edit-fix (and chordpro-create if new).
2. Load song or use provided content; chordpro.parse_summary.
3. Identify missing metadata, section markers, or structure.
4. Distinguish structural inferences (safe) from musical/lyrical content (must ask user).
5. Never fabricate lyrics/chords/verses as authentic.
6. Propose via songs.propose_edit or songs.create_draft; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.review",
    {
      title: "Review a song",
      description:
        "Review structural correctness and metadata; report findings without modifying automatically.",
      argsSchema: z.object({
        songId: z.string(),
      }),
    },
    ({ songId }) =>
      userMessage(`Objective: review song ${songId} without changing it.

Workflow:
1. Read hosanna://skills/songs-validate-review.
2. songs.get, chordpro.validate, chordpro.parse_summary.
3. Report findings and suggested improvements.
4. Do not call songs.save unless the user later asks to apply a specific fix.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.transpose",
    {
      title: "Transpose a song",
      description:
        "Transpose to a requested key using Hosanna source-preserving transpose; validate result.",
      argsSchema: z.object({
        songId: z.string(),
        toKey: z.string(),
      }),
    },
    ({ songId, toKey }) =>
      userMessage(`Objective: transpose song ${songId} to key ${toKey}.

Workflow:
1. Read hosanna://skills/songs-transpose-arrange and hosanna://skills/hosanna-safe-data.
2. songs.get.
3. chordpro.transpose with toKey=${toKey}.
4. Preserve lyrics, sections, variants, unrelated metadata.
5. songs.propose_edit with transposed content; validate; present; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.arrange",
    {
      title: "Arrange a song",
      description:
        "Modify arrangement (sections, repetitions, variants) within real Hosanna capabilities.",
      argsSchema: z.object({
        songId: z.string(),
        instructions: z.string(),
      }),
    },
    ({ songId, instructions }) =>
      userMessage(`Objective: arrange song ${songId}.

Instructions: ${instructions}

Workflow:
1. Read hosanna://skills/songs-transpose-arrange and hosanna://skills/chordpro-directives-variants.
2. Read hosanna://chordpro/features and hosanna://chordpro/examples/variants.
3. songs.get; explain any unsupported requests (e.g. {define}, layout directives).
4. Apply only supported changes (sections, repeats, variations, chord placement).
5. Propose via songs.propose_edit; validate; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "songs.explain_chordpro",
    {
      title: "Explain ChordPro",
      description:
        "Explain a ChordPro directive or feature as Hosanna implements it.",
      argsSchema: z.object({
        topic: z.string().describe("Directive name, feature, or question"),
      }),
    },
    ({ topic }) =>
      userMessage(`Objective: explain ChordPro topic "${topic}" for Hosanna.

Workflow:
1. Read hosanna://skills/chordpro-directives-variants.
2. chordpro.directives with name if it looks like a directive; else read hosanna://chordpro/guide and hosanna://chordpro/features.
3. Give accurate examples and state limitations (parsed vs formatter-only vs unsupported).
4. Do not invent features that are not implemented.`),
  );
}
