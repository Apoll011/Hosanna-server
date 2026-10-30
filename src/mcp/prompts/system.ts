import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  buildHosannaMcpInstructions,
  SYSTEM_PROMPT_NAME,
} from "../instructions.js";

export function registerSystemPrompts(server: McpServer): void {
  server.registerPrompt(
    SYSTEM_PROMPT_NAME,
    {
      title: "Hosanna system setup",
      description:
        "Load Hosanna MCP operating rules and the skills needed for the current job before using tools.",
      argsSchema: z.object({
        job: z
          .enum([
            "create_song",
            "edit_song",
            "fix_song",
            "review_song",
            "transpose_arrange",
            "explain_chordpro",
            "create_service",
            "edit_service",
            "plan_service",
            "general",
          ])
          .optional()
          .describe("What you are about to do — selects which skills to load"),
      }),
    },
    ({ job }) => {
      const skillUris = skillsForJob(job ?? "general");
      const skillList = skillUris.map((u) => `- ${u}`).join("\n");

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `${buildHosannaMcpInstructions()}

## This session

Job: ${job ?? "general"}

Read these skill resources now (in order), then confirm you have loaded them before calling other tools:

${skillList}

After reading, briefly list the key constraints you will follow, then proceed with the user's request.
`,
            },
          },
        ],
      };
    },
  );
}

function skillsForJob(job: string): string[] {
  const safe = "hosanna://skills/hosanna-safe-data";
  switch (job) {
    case "create_song":
      return [safe, "hosanna://skills/chordpro-create", "hosanna://chordpro/guide"];
    case "edit_song":
    case "fix_song":
      return [safe, "hosanna://skills/songs-edit-fix"];
    case "review_song":
      return [
        "hosanna://skills/songs-validate-review",
        "hosanna://skills/chordpro-directives-variants",
      ];
    case "transpose_arrange":
      return [
        safe,
        "hosanna://skills/songs-transpose-arrange",
        "hosanna://skills/chordpro-directives-variants",
      ];
    case "explain_chordpro":
      return [
        "hosanna://skills/chordpro-directives-variants",
        "hosanna://chordpro/guide",
        "hosanna://chordpro/features",
      ];
    case "create_service":
    case "edit_service":
      return [safe, "hosanna://skills/services-create-edit"];
    case "plan_service":
      return [
        safe,
        "hosanna://skills/services-plan-complete",
        "hosanna://skills/services-create-edit",
      ];
    default:
      return [
        safe,
        "hosanna://skills/chordpro-create",
        "hosanna://skills/services-create-edit",
      ];
  }
}
