import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  errorResult,
  jsonResult,
  requireMcpContext,
  requirePermission,
  requireWriteEntitlement,
  services as serviceService,
  songs as songService,
} from "../context.js";
import { validateServicePlan } from "../lib/serviceElements.js";
import {
  serviceElementSchema,
  serviceElementsSchema,
} from "../lib/serviceElements.js";

export function registerServiceTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "services.search",
    {
      title: "Search services",
      description: "List services in the active organization.",
      inputSchema: z.object({
        archived: z.boolean().optional().default(false),
        search: z.string().optional(),
      }),
    },
    async ({ archived, search }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        let list = await serviceService(ctx).list({ archived });
        if (search?.trim()) {
          const q = search.toLowerCase();
          list = list.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.notes ?? "").toLowerCase().includes(q),
          );
        }
        return jsonResult({ services: list, total: list.length });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.get",
    {
      title: "Get service",
      description: "Retrieve a service plan including elements.",
      inputSchema: z.object({
        serviceId: z.string().uuid(),
      }),
    },
    async ({ serviceId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        const service = await serviceService(ctx).getByIdSerialized(serviceId);
        const validation = await validateServicePlan(
          service.elements,
          songService(ctx),
        );
        return jsonResult({ service, validation });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.create_draft",
    {
      title: "Create service draft",
      description:
        "Build and validate a service plan proposal without saving.",
      inputSchema: z.object({
        name: z.string().min(1),
        date: z.string().min(1).describe("ISO date or datetime"),
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional().default([]),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.create");
        const elements = (args.elements ?? []).map((el, i) => ({
          ...el,
          id: el.id || randomUUID(),
          position: el.position ?? i,
        }));
        const validation = await validateServicePlan(
          elements,
          songService(ctx),
        );
        return jsonResult({
          proposal: {
            name: args.name,
            date: args.date,
            notes: args.notes ?? "",
            elements,
          },
          validation,
          next: "Call services.save with mode=create after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.propose_edit",
    {
      title: "Propose service edit",
      description:
        "Load a service, apply changes, validate references, return proposal (not saved).",
      inputSchema: z.object({
        serviceId: z.string().uuid(),
        name: z.string().optional(),
        date: z.string().optional(),
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional(),
        archived: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.update");
        const current = await serviceService(ctx).getByIdSerialized(
          args.serviceId,
        );
        const elements =
          args.elements ??
          (Array.isArray(current.elements) ? current.elements : []);
        const validation = await validateServicePlan(
          elements,
          songService(ctx),
        );
        return jsonResult({
          proposal: {
            id: current.id,
            name: args.name ?? current.name,
            date:
              args.date ??
              (current.date instanceof Date
                ? current.date.toISOString()
                : String(current.date)),
            notes: args.notes ?? current.notes ?? "",
            elements,
            archived: args.archived,
            updatedAt:
              current.updatedAt instanceof Date
                ? current.updatedAt.toISOString()
                : new Date(current.updatedAt).toISOString(),
          },
          validation,
          next: "Call services.save with mode=update after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.validate",
    {
      title: "Validate service",
      description:
        "Validate service element structure and song references without saving.",
      inputSchema: z.object({
        elements: serviceElementsSchema,
        serviceId: z
          .string()
          .uuid()
          .optional()
          .describe("Optional: also load and compare against existing service"),
      }),
    },
    async ({ elements, serviceId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        const validation = await validateServicePlan(
          elements,
          songService(ctx),
        );
        let existing = null;
        if (serviceId) {
          existing = await serviceService(ctx).getByIdSerialized(serviceId);
        }
        return jsonResult({ validation, existing });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.save",
    {
      title: "Save service",
      description:
        "Persist a validated service create or update after user approval.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        serviceId: z.string().uuid().optional(),
        updatedAt: z.string().optional(),
        name: z.string().min(1),
        date: z.string().min(1),
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional(),
        archived: z.boolean().optional(),
        allowInvalid: z.boolean().optional().default(false),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        const elements = args.elements ?? [];
        const validation = await validateServicePlan(
          elements,
          songService(ctx),
        );
        if (!validation.ok && !args.allowInvalid) {
          return jsonResult(
            {
              error: "Service validation failed",
              validation,
              hint: "Fix song references/structure or set allowInvalid=true.",
            },
            true,
          );
        }

        if (args.mode === "create") {
          requirePermission(ctx, "service.create");
          const created = await serviceService(ctx).create({
            name: args.name,
            date: new Date(args.date),
            notes: args.notes,
            elements,
          });
          return jsonResult({ saved: true, service: created, validation });
        }

        requirePermission(ctx, "service.update");
        if (!args.serviceId || !args.updatedAt) {
          return jsonResult(
            { error: "serviceId and updatedAt are required for update" },
            true,
          );
        }
        const updated = await serviceService(ctx).update(
          args.serviceId,
          new Date(args.updatedAt),
          {
            name: args.name,
            date: new Date(args.date),
            notes: args.notes,
            elements,
            archived: args.archived,
          },
        );
        return jsonResult({ saved: true, service: updated, validation });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.delete",
    {
      title: "Delete service",
      description: "Soft-delete a service plan.",
      inputSchema: z.object({
        serviceId: z.string().uuid(),
      }),
    },
    async ({ serviceId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.delete");
        requireWriteEntitlement(ctx);
        await serviceService(ctx).delete(serviceId);
        return jsonResult({ deleted: true, serviceId });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services.plan_suggest",
    {
      title: "Suggest a service plan",
      description:
        "Search the church library and propose a draft service plan from constraints. Does not save.",
      inputSchema: z.object({
        name: z.string().optional().default("Service draft"),
        date: z.string().min(1),
        theme: z.string().optional(),
        tags: z.array(z.string()).optional(),
        key: z.string().optional(),
        maxSongs: z.number().int().positive().max(20).optional().default(5),
        includeWelcome: z.boolean().optional().default(true),
        includeMessage: z.boolean().optional().default(true),
        notes: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.create");
        requirePermission(ctx, "song.access");

        const search =
          args.theme?.trim() ||
          (args.tags?.length ? args.tags.join(" ") : undefined);
        const library = await songService(ctx).list({
          search,
          key: args.key,
          tag: args.tags?.[0],
          page: 1,
          limit: Math.max(args.maxSongs * 3, 15),
          sortBy: "title",
          sortOrder: "asc",
          searchFields: JSON.stringify({
            title: true,
            artist: true,
            content: true,
            tags: true,
          }),
        });

        const picked = library.songs.slice(0, args.maxSongs);
        const elements: z.infer<typeof serviceElementSchema>[] = [];
        let position = 0;

        if (args.includeWelcome) {
          elements.push({
            id: randomUUID(),
            type: "welcome",
            title: "Welcome",
            content: args.theme
              ? `Welcome — theme: ${args.theme}`
              : "Welcome",
            position: position++,
            duration: 5,
          });
        }

        for (const song of picked) {
          elements.push({
            id: randomUUID(),
            type: "song",
            title: song.title,
            songId: song.id,
            content: song.artist,
            position: position++,
            duration: 5,
          });
        }

        if (args.includeMessage) {
          elements.push({
            id: randomUUID(),
            type: "message",
            title: "Message",
            content: args.theme ? `Message on: ${args.theme}` : "Message",
            position: position++,
            duration: 30,
          });
        }

        const validation = await validateServicePlan(
          elements,
          songService(ctx),
        );

        return jsonResult({
          proposal: {
            name: args.name,
            date: args.date,
            notes: args.notes ?? (args.theme ? `Theme: ${args.theme}` : ""),
            elements,
          },
          reasoning: {
            searchUsed: search ?? null,
            keyFilter: args.key ?? null,
            candidatesFound: library.total,
            songsSelected: picked.map((s) => ({
              id: s.id,
              title: s.title,
              artist: s.artist,
              tags: s.tags,
            })),
            note:
              picked.length === 0
                ? "No matching songs found in the library. Ask the user for songs or broaden constraints."
                : "Songs selected from the organization's library by search/key/tag filters.",
          },
          validation,
          next: "Present the draft; save only with services.save after approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
