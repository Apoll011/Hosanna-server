import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import {
  ServiceNoteRepository,
  ServiceNoteWithAuthor,
} from "../repositories/serviceNote.repository.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { AppError } from "../utils/errors.js";

/** True when `elementId` is the id of an item in a service's elements array. */
export function serviceHasElement(
  elements: unknown,
  elementId: string,
): boolean {
  if (!Array.isArray(elements)) return false;
  return elements.some(
    (element) =>
      !!element &&
      typeof element === "object" &&
      "id" in element &&
      (element as { id: unknown }).id === elementId,
  );
}

function serialize(note: ServiceNoteWithAuthor) {
  return {
    id: note.id,
    serviceId: note.serviceId,
    elementId: note.elementId,
    body: note.body,
    private: note.private,
    author: note.author
      ? {
          id: note.author.id,
          name: note.author.name,
          image: note.author.image,
        }
      : null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export class ServiceNoteService {
  private readonly notes: ServiceNoteRepository;
  private readonly services: ServiceRepository;

  constructor(
    db: OrgScopedPrisma,
    private readonly userId: string,
    private readonly locale: string = DEFAULT_LOCALE,
  ) {
    this.notes = new ServiceNoteRepository(db);
    this.services = new ServiceRepository(db);
  }

  async list(serviceId: string, elementId?: string | null) {
    await this.assertService(serviceId);
    const rows = await this.notes.list({
      serviceId,
      userId: this.userId,
      elementId,
    });
    return rows.map(serialize);
  }

  async create(
    serviceId: string,
    input: { body: string; elementId?: string | null; private: boolean },
  ) {
    const service = await this.assertService(serviceId);
    const elementId = input.elementId ?? null;
    if (elementId && !serviceHasElement(service.elements, elementId)) {
      throw AppError.notFound(
        "ELEMENT_NOT_FOUND",
        t(this.locale, "note.element_not_found"),
      );
    }

    const created = await this.notes.create({
      id: uuid(),
      serviceId,
      elementId,
      body: input.body,
      private: input.private,
      authorId: this.userId,
    });
    return serialize(created);
  }

  async update(
    serviceId: string,
    noteId: string,
    patch: { body?: string; private?: boolean },
  ) {
    await this.loadOwnNote(serviceId, noteId);
    const updated = await this.notes.update(noteId, patch);
    return serialize(updated);
  }

  async delete(serviceId: string, noteId: string) {
    await this.loadOwnNote(serviceId, noteId);
    await this.notes.delete(noteId);
  }

  private async assertService(serviceId: string) {
    const service = await this.services.findById(serviceId);
    if (!service || service.deleted) {
      throw AppError.notFound(
        "SERVICE_NOT_FOUND",
        t(this.locale, "service.not_found"),
      );
    }
    return service;
  }

  /**
   * Loads a note the caller is allowed to change.
   * Someone else's private note is reported as missing so its existence
   * stays hidden. A shared note can be read by the org, but only its author
   * can change or remove it.
   */
  private async loadOwnNote(serviceId: string, noteId: string) {
    await this.assertService(serviceId);
    const note = await this.notes.findInService(serviceId, noteId);
    if (!note || (note.private && note.authorId !== this.userId)) {
      throw AppError.notFound(
        "NOTE_NOT_FOUND",
        t(this.locale, "note.not_found"),
      );
    }
    if (note.authorId !== this.userId) {
      throw AppError.forbidden(t(this.locale, "note.forbidden"));
    }
    return note;
  }
}
