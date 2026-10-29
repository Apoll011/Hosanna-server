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
Before tools: read hosanna://skills/hosanna-safe-data and the service skill(s) named in this prompt.
Hard rules:
- Use only songs that exist in the organization's library (songs_search / songs_get).
- Validate with services_validate before presenting a final proposal.
- Persist only with services_save after explicit user approval.
- Do not invent unavailable songs, scripture text, or elements the user did not request without confirmation.
`;

export function registerServicePrompts(server: McpServer): void {
  server.registerPrompt(
    "services_create",
    {
      title: "Create a service",
      description:
        "Create a service plan from requirements; validate and present a draft before saving.",
      argsSchema: z.object({
        name: z.string().optional(),
        date: z.string().optional(),
        instructions: z.string().optional(),
      }),
    },
    ({ name, date, instructions }) =>
      userMessage(`Objective: create a Hosanna service plan.

name: ${name ?? "(ask)"}
date: ${date ?? "(ask)"}
instructions: ${instructions ?? "(none)"}

Workflow:
1. Read hosanna://skills/services-create-edit and hosanna://skills/hosanna-safe-data.
2. Gather essentials; read hosanna://domain/services and hosanna://schemas/service-element-types.
3. Discover songs with songs_search as needed.
4. services_create_draft; services_validate.
5. Present draft; services_save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "services_edit",
    {
      title: "Edit a service",
      description:
        "Modify an existing service; preserve unrelated elements; validate; present proposal.",
      argsSchema: z.object({
        serviceId: z.string(),
        instructions: z.string(),
      }),
    },
    ({ serviceId, instructions }) =>
      userMessage(`Objective: edit service ${serviceId}.

Instructions: ${instructions}

Workflow:
1. Read hosanna://skills/services-create-edit and hosanna://skills/hosanna-safe-data.
2. services_get.
3. Apply only requested changes; preserve unrelated elements.
4. services_propose_edit; services_validate.
5. Present; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "services_complete",
    {
      title: "Complete a service",
      description:
        "Identify missing service information and suggest additions from available data.",
      argsSchema: z.object({
        serviceId: z.string(),
        instructions: z.string().optional(),
      }),
    },
    ({ serviceId, instructions }) =>
      userMessage(`Objective: complete service ${serviceId}.

instructions: ${instructions ?? "(none)"}

Workflow:
1. Read hosanna://skills/services-plan-complete and hosanna://skills/services-create-edit.
2. services_get and services_validate.
3. Identify missing elements, song refs, or structure.
4. Suggest additions based on library search and user requirements — do not invent unavailable data.
5. Propose via services_propose_edit; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "services_fix",
    {
      title: "Fix a service",
      description:
        "Correct structural and validation problems; explain issues; preserve intended plan.",
      argsSchema: z.object({
        serviceId: z.string(),
      }),
    },
    ({ serviceId }) =>
      userMessage(`Objective: fix validation/structural issues in service ${serviceId}.

Workflow:
1. Read hosanna://skills/services-create-edit and hosanna://skills/hosanna-safe-data.
2. services_get; services_validate.
3. Explain issues; propose fixes that preserve the user's intended plan.
4. services_propose_edit; present; save only after approval.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "services_review",
    {
      title: "Review a service",
      description:
        "Review structure, references, ordering, and completeness without auto-modifying.",
      argsSchema: z.object({
        serviceId: z.string(),
      }),
    },
    ({ serviceId }) =>
      userMessage(`Objective: review service ${serviceId} without changing it.

Workflow:
1. Read hosanna://skills/services-create-edit.
2. services_get; services_validate.
3. Report actionable suggestions (ordering, missing refs, completeness).
4. Do not call services_save unless the user later asks to apply a fix.
${HARD_RULES}`),
  );

  server.registerPrompt(
    "services_plan",
    {
      title: "Plan a service",
      description:
        "Plan a service from date/theme/duration/library constraints; explain reasoning; await approval.",
      argsSchema: z.object({
        date: z.string(),
        theme: z.string().optional(),
        instructions: z.string().optional(),
        maxSongs: z.string().optional(),
      }),
    },
    ({ date, theme, instructions, maxSongs }) =>
      userMessage(`Objective: plan a service.

date: ${date}
theme: ${theme ?? "(none)"}
maxSongs: ${maxSongs ?? "5"}
instructions: ${instructions ?? "(none)"}

Workflow:
1. Read hosanna://skills/services-plan-complete, hosanna://skills/services-create-edit, and hosanna://skills/hosanna-safe-data.
2. Read hosanna://domain/services.
3. services_plan_suggest with constraints; optionally refine with songs_search.
4. Explain reasoning for song choices from the actual library.
5. Present draft; services_save only after approval.
${HARD_RULES}`),
  );
}
