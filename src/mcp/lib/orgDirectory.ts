import { randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma.js";
import { RESPONSIBILITIES } from "../../locales/responsabilities.js";
import type { McpContext } from "../context.js";

export type OrgAssignee = {
  id: string;
  name: string;
  memberId?: string;
  avatarUrl?: string;
};

export type OrgResponsibility = {
  id: string;
  categoryId: string;
  assignees: OrgAssignee[];
};

type OrgMeta = {
  locale?: string;
  shortName?: string;
  settings?: {
    general?: { locale?: string; timezone?: string };
    agenda?: {
      responsibilityCategories?: Array<{
        id: string;
        label: string;
        icon?: string;
        color?: string;
      }>;
    };
  };
};

function parseOrgMeta(metadata: unknown): OrgMeta {
  try {
    const meta =
      typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    return (meta && typeof meta === "object" ? meta : {}) as OrgMeta;
  } catch {
    return {};
  }
}

function localeKey(locale: string): keyof typeof RESPONSIBILITIES {
  if (locale.startsWith("pt")) return "pt-PT";
  if (locale.startsWith("es")) return "es";
  return "en";
}

/** Current user + org membership for "who am I?" */
export async function getMe(ctx: McpContext) {
  const [member, org] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId: ctx.orgId, userId: ctx.user.id },
      select: {
        id: true,
        role: true,
        userId: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    }),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { id: true, name: true, slug: true, logo: true, metadata: true },
    }),
  ]);

  if (!member || !org) {
    throw new Error("Membership or organization not found for this session");
  }

  const meta = parseOrgMeta(org.metadata);
  return {
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
    },
    member: {
      id: member.id,
      role: member.role,
      userId: member.userId,
    },
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      locale: meta.settings?.general?.locale ?? meta.locale ?? ctx.locale,
      timezone: meta.settings?.general?.timezone ?? "Europe/Lisbon",
    },
    entitled: ctx.entitled,
  };
}

export async function listMembers(
  ctx: McpContext,
  args?: { search?: string; role?: string; limit?: number },
) {
  const limit = Math.min(args?.limit ?? 100, 200);
  const search = args?.search?.trim();
  const role = args?.role?.trim();

  const members = await prisma.member.findMany({
    where: {
      organizationId: ctx.orgId,
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      role: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return {
    members: members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      createdAt: m.createdAt.toISOString(),
    })),
    count: members.length,
  };
}

export async function getMember(
  ctx: McpContext,
  args: { memberId?: string; userId?: string; name?: string },
) {
  if (!args.memberId && !args.userId && !args.name?.trim()) {
    throw new Error("Provide memberId, userId, or name");
  }

  const name = args.name?.trim();
  const member = await prisma.member.findFirst({
    where: {
      organizationId: ctx.orgId,
      ...(args.memberId ? { id: args.memberId } : {}),
      ...(args.userId ? { userId: args.userId } : {}),
      ...(name
        ? {
            user: { name: { contains: name, mode: "insensitive" } },
          }
        : {}),
    },
    select: {
      id: true,
      role: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  if (!member) throw new Error("Member not found in this organization");

  return {
    member: {
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
      createdAt: member.createdAt.toISOString(),
    },
  };
}

export async function getOrganization(ctx: McpContext) {
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      metadata: true,
      createdAt: true,
    },
  });
  if (!org) throw new Error("Organization not found");

  const meta = parseOrgMeta(org.metadata);
  const locale = meta.settings?.general?.locale ?? meta.locale ?? ctx.locale;
  const builtIn = RESPONSIBILITIES[localeKey(locale)];
  const categories = meta.settings?.agenda?.responsibilityCategories?.length
    ? meta.settings.agenda.responsibilityCategories
    : builtIn.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        color: c.color,
      }));

  const memberCount = await prisma.member.count({
    where: { organizationId: ctx.orgId },
  });

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      shortName: meta.shortName ?? null,
      locale,
      timezone: meta.settings?.general?.timezone ?? "Europe/Lisbon",
      responsibilityCategories: categories,
      memberCount,
      createdAt: org.createdAt.toISOString(),
    },
  };
}

/** Normalize responsibilities for agenda create/update. */
export function normalizeResponsibilities(
  input: unknown,
): OrgResponsibility[] {
  if (!Array.isArray(input)) return [];
  const out: OrgResponsibility[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const categoryId =
      typeof r.categoryId === "string" ? r.categoryId.trim() : "";
    if (!categoryId) continue;
    const assigneesRaw = Array.isArray(r.assignees) ? r.assignees : [];
    const assignees: OrgAssignee[] = [];
    for (const a of assigneesRaw) {
      if (!a || typeof a !== "object") continue;
      const asg = a as Record<string, unknown>;
      const name = typeof asg.name === "string" ? asg.name.trim() : "";
      if (!name) continue;
      const id =
        typeof asg.id === "string" && asg.id.trim()
          ? asg.id.trim()
          : randomUUID();
      const memberId =
        typeof asg.memberId === "string" && asg.memberId.trim()
          ? asg.memberId.trim()
          : undefined;
      const avatarUrl =
        typeof asg.avatarUrl === "string" ? asg.avatarUrl : undefined;
      assignees.push({ id, name, memberId, avatarUrl });
    }
    out.push({
      id:
        typeof r.id === "string" && r.id.trim() ? r.id.trim() : randomUUID(),
      categoryId,
      assignees,
    });
  }
  return out;
}
