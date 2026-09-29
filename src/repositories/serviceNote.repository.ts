import { Prisma } from "@prisma/client";
import type { OrgScopedPrisma } from "../database/prisma.js";

const authorSelect = {
  id: true,
  name: true,
  image: true,
} as const;

export type ServiceNoteWithAuthor = Prisma.ServiceNoteGetPayload<{
  include: { author: { select: typeof authorSelect } };
}>;

export type NoteListFilter = {
  serviceId: string;
  userId: string;
  /**
   * undefined — every note on the service (service-level and every element).
   * null — only notes whose elementId is null (the service itself).
   * string — only notes linked to that element.
   */
  elementId?: string | null;
};

/**
 * Notes the caller is allowed to see: every shared note, plus their own
 * private notes. Other people's private notes are excluded entirely.
 */
export function visibleNotesWhere(
  filter: NoteListFilter,
): Prisma.ServiceNoteWhereInput {
  const where: Prisma.ServiceNoteWhereInput = {
    serviceId: filter.serviceId,
    OR: [{ private: false }, { authorId: filter.userId }],
  };
  if (filter.elementId !== undefined) {
    where.elementId = filter.elementId;
  }
  return where;
}

export class ServiceNoteRepository {
  constructor(private readonly db: OrgScopedPrisma) {}

  list(filter: NoteListFilter) {
    return this.db.serviceNote.findMany({
      where: visibleNotesWhere(filter),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { author: { select: authorSelect } },
    });
  }

  findInService(serviceId: string, noteId: string) {
    return this.db.serviceNote.findFirst({
      where: { id: noteId, serviceId },
      include: { author: { select: authorSelect } },
    });
  }

  create(
    data: Omit<Prisma.ServiceNoteUncheckedCreateInput, "orgId">,
  ) {
    // orgId is injected by the org-scoped Prisma client.
    return this.db.serviceNote.create({
      data: data as Prisma.ServiceNoteUncheckedCreateInput,
      include: { author: { select: authorSelect } },
    });
  }

  update(id: string, data: { body?: string; private?: boolean }) {
    return this.db.serviceNote.update({
      where: { id },
      data,
      include: { author: { select: authorSelect } },
    });
  }

  delete(id: string) {
    return this.db.serviceNote.delete({ where: { id } });
  }
}
