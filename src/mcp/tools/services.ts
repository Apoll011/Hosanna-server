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
import { durationSecondsFromChordPro } from "../lib/chordproGate.js";
import { withClientRequestId } from "../lib/idempotency.js";
import { validateServicePlan } from "../lib/serviceElements.js";
import {
  serviceElementSchema,
  serviceElementsSchema,
} from "../lib/serviceElements.js";

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .describe("Calendar date YYYY-MM-DD");

export function registerServiceTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "services_search",
    {
      title: "Search services",
      description:
        "List/search services (metadata only: id, name, date YYYY-MM-DD, notes, elementCount, hasSongs, archived, updatedAt). Use services_get for elements. archived=true → archived only; includeArchived=true → active+archived; default active only.",
      inputSchema: z.object({
        archived: z.boolean().optional().default(false),
        includeArchived: z.boolean().optional().default(false),
        search: z.string().optional(),
      }),
    },
    async ({ archived, includeArchived, search }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        let list = await serviceService(ctx).list({
          archived,
          includeArchived,
          metadataOnly: true,
        });
        if (search?.trim()) {
          const q = search.toLowerCase();
          list = list.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.notes ?? "").toLowerCase().includes(q),
          );
        }
        return jsonResult({
          services: list,
          total: list.length,
          tip: "Metadata only — call services_get for elements.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_get",
    {
      title: "Get service",
      description:
        "Retrieve a service plan including elements. Set expandSongs=true to attach song metadata (and optional content) for each song element in one call.",
      inputSchema: z.object({
        serviceId: z.string().uuid(),
        expandSongs: z.boolean().optional().default(false),
        includeSongContent: z.boolean().optional().default(false),
      }),
    },
    async ({ serviceId, expandSongs, includeSongContent }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        const service = await serviceService(ctx).getByIdForMcp(serviceId);
        const validation = await validateServicePlan(
          service.elements,
          songService(ctx),
        );
        let expandedSongs: unknown[] | undefined;
        if (expandSongs) {
          const rawElements = Array.isArray(service.elements)
            ? service.elements
            : [];
          const ids = [
            ...new Set(
              rawElements
                .map((el) =>
                  el && typeof el === "object" && "songId" in el
                    ? String((el as { songId?: unknown }).songId ?? "")
                    : "",
                )
                .filter((id) => id.length > 0),
            ),
          ].slice(0, 40);
          expandedSongs = [];
          for (const id of ids) {
            try {
              const song = await songService(ctx).getById(id);
              expandedSongs.push({
                id: song.id,
                title: song.title,
                artist: song.artist,
                updatedAt: song.updatedAt.toISOString(),
                tags: song.tags,
                ...(includeSongContent
                  ? { content: song.content.slice(0, 8_000), truncated: song.content.length > 8_000, contentLength: song.content.length }
                  : { contentPreview: song.content.slice(0, 200) }),
              });
            } catch {
              expandedSongs.push({ id, missing: true });
            }
          }
        }
        const missingFromExpand = (expandedSongs ?? [])
          .filter(
            (s): s is { id: string; missing: true } =>
              Boolean(s) &&
              typeof s === "object" &&
              (s as { missing?: boolean }).missing === true,
          )
          .map((s) => s.id);
        const missingSongIds = [
          ...new Set([...validation.missingSongIds, ...missingFromExpand]),
        ];
        return jsonResult({
          service,
          validation: {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
            missingSongIds,
            durationUnit: validation.durationUnit,
          },
          expandedSongs,
          missingSongIds,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_create_draft",
    {
      title: "Create service draft",
      description:
        "Build and validate a service plan proposal without saving.",
      inputSchema: z.object({
        name: z.string().min(1),
        date: dateOnlySchema,
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
          next: "Call services_save with mode=create after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_propose_edit",
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
          next: "Call services_save with mode=update after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_validate",
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
    "services_save",
    {
      title: "Save service",
      description:
        "Persist a validated service create or update after user approval.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        serviceId: z.string().uuid().optional(),
        updatedAt: z.string().optional(),
        name: z.string().min(1),
        date: dateOnlySchema,
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional(),
        archived: z.boolean().optional(),
        allowInvalid: z.boolean().optional().default(false),
        clientRequestId: z
          .string()
          .min(1)
          .optional()
          .describe("Idempotency key — retries return the same result"),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        return await withClientRequestId(
          ctx.orgId,
          args.clientRequestId,
          async () => {
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
            date: new Date(`${args.date}T12:00:00.000Z`),
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
            date: new Date(`${args.date}T12:00:00.000Z`),
            notes: args.notes,
            elements,
            archived: args.archived,
          },
        );
        return jsonResult({ saved: true, service: updated, validation });
          },
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_delete",
    {
      title: "Delete service",
      description:
        "Soft-delete a service plan. Requires explicit user confirmation before calling.",
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
    "services_restore",
    {
      title: "Restore service",
      description: "Restore a soft-deleted service from trash.",
      inputSchema: z.object({ serviceId: z.string().uuid() }),
    },
    async ({ serviceId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.update");
        requireWriteEntitlement(ctx);
        const service = await serviceService(ctx).restore(serviceId);
        return jsonResult({ restored: true, service });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "services_plan_suggest",
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
            duration: 60,
          });
        }

        for (const song of picked) {
          const fromDirective = durationSecondsFromChordPro(song.content);
          elements.push({
            id: randomUUID(),
            type: "song",
            title: song.title,
            songId: song.id,
            // Prefer notes for artist — content is user-authored text.
            notes: song.artist || undefined,
            position: position++,
            duration: fromDirective ?? 210,
          });
        }

        if (args.includeMessage) {
          elements.push({
            id: randomUUID(),
            type: "message",
            title: "Message",
            content: args.theme ? `Message on: ${args.theme}` : "Message",
            position: position++,
            duration: 1500,
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
          next: "Present the draft; save only with services_save after approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
