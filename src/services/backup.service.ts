import type { OrgScopedPrisma } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import { AppError } from "../utils/errors.js";
import { notifyOrg } from "../utils/notify.js";
import { isLiveRow, sortFoldersParentsFirst } from "./backup.helpers.js";

const BACKUP_VERSION = "2.2";

export { isLiveRow, sortFoldersParentsFirst } from "./backup.helpers.js";

export class BackupService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly orgId: string,
    private readonly locale: string = DEFAULT_LOCALE,
  ) {}

  async export() {
    const [folders, songs, services, collections, agendaEvents] =
      await Promise.all([
        this.db.folder.findMany({ where: { deleted: false } }),
        this.db.song.findMany({
          where: { deleted: false },
          include: { collections: { select: { id: true } } },
        }),
        this.db.service.findMany({ where: { deleted: false } }),
        this.db.collection.findMany({
          where: { deleted: false },
          include: { songs: { select: { id: true } } },
        }),
        this.db.agendaEvent.findMany({ where: { deleted: false } }),
      ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders,
      songs: songs.map(({ collections: cols, ...song }) => ({
        ...song,
        collectionIds: cols.map((c) => c.id),
      })),
      services,
      collections: collections.map(({ songs: songLinks, ...collection }) => ({
        ...collection,
        songIds: songLinks.map((s) => s.id),
      })),
      agendaEvents,
    };
  }

  /**
   * Fully replaces the tenant library with the supplied backup, inside a
   * single transaction (all-or-nothing). Soft-deleted rows in the payload are
   * skipped. Collections and agenda events are included (v2.2+).
   */
  async restore(backup: any) {
    if (!backup || typeof backup !== "object") {
      throw new AppError(
        400,
        "INVALID_BACKUP_FILE",
        t(this.locale, "backup.invalid_file"),
      );
    }

    const foldersIn = Array.isArray(backup.folders) ? backup.folders : null;
    const songsIn = Array.isArray(backup.songs) ? backup.songs : null;
    const servicesIn = Array.isArray(backup.services) ? backup.services : null;
    // Older backups (v2.1) omit these — treat as empty arrays.
    const collectionsIn = Array.isArray(backup.collections)
      ? backup.collections
      : [];
    const agendaIn = Array.isArray(backup.agendaEvents)
      ? backup.agendaEvents
      : [];

    if (!foldersIn || !songsIn || !servicesIn) {
      throw new AppError(
        400,
        "INVALID_BACKUP_FILE",
        t(this.locale, "backup.missing_arrays"),
      );
    }

    const folders = sortFoldersParentsFirst(foldersIn.filter(isLiveRow));
    const songs = songsIn.filter(isLiveRow);
    const services = servicesIn.filter(isLiveRow);
    const collections = collectionsIn.filter(isLiveRow);
    const agendaEvents = agendaIn.filter(isLiveRow);

    await this.db.$transaction(async (tx) => {
      // FK-safe wipe: agenda → services (cascades notes/annotations) →
      // songs → collections → folders.
      await tx.agendaEvent.deleteMany();
      await tx.service.deleteMany();
      await tx.song.deleteMany();
      await tx.collection.deleteMany();
      await tx.folder.deleteMany();

      // OrgScopedPrisma injects orgId at runtime; cast like the repositories
      // so Exact<> create inputs typecheck without repeating orgId/org.
      if (folders.length > 0) {
        await tx.folder.createMany({
          data: folders.map((f: any) => ({
            id: f.id,
            name: f.name,
            color: f.color ?? "default",
            icon: f.icon ?? "default",
            parentId: f.parentId ?? null,
            createdAt: f.createdAt ? new Date(f.createdAt) : undefined,
            updatedAt: f.updatedAt ? new Date(f.updatedAt) : undefined,
            deleted: false,
            purgeAt: null,
          })) as any,
        });
      }

      if (collections.length > 0) {
        await tx.collection.createMany({
          data: collections.map((c: any) => ({
            id: c.id,
            name: c.name,
            description: c.description ?? null,
            color: c.color ?? "default",
            icon: c.icon ?? "default",
            image: c.image ?? null,
            createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
            deleted: false,
            purgeAt: null,
          })) as any,
        });
      }

      for (const s of songs) {
        const collectionIds: string[] = Array.isArray(s.collectionIds)
          ? s.collectionIds
          : [];
        await tx.song.create({
          data: {
            id: s.id,
            title: s.title,
            artist: s.artist ?? "Unknown Artist",
            content: s.content,
            folderId: s.folderId ?? null,
            path: s.path,
            tags: s.tags ?? [],
            song_number: s.song_number ?? s.songNumber ?? null,
            createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : undefined,
            deleted: false,
            purgeAt: null,
            ...(collectionIds.length > 0
              ? {
                  collections: {
                    connect: collectionIds.map((id: string) => ({ id })),
                  },
                }
              : {}),
          } as any,
        });
      }

      // Re-apply collection→song links from collection.songIds when present
      // (covers backups that only store songIds on the collection side).
      for (const c of collections) {
        const songIds: string[] = Array.isArray(c.songIds) ? c.songIds : [];
        if (songIds.length === 0) continue;
        await tx.collection.update({
          where: { id: c.id },
          data: {
            songs: { set: songIds.map((id: string) => ({ id })) },
          },
        });
      }

      if (services.length > 0) {
        await tx.service.createMany({
          data: services.map((svc: any) => ({
            id: svc.id,
            name: svc.name,
            date: svc.date ? new Date(svc.date) : undefined,
            notes: svc.notes ?? "",
            elements: svc.elements ?? [],
            archived: svc.archived ?? false,
            createdAt: svc.createdAt ? new Date(svc.createdAt) : undefined,
            updatedAt: svc.updatedAt ? new Date(svc.updatedAt) : undefined,
            deleted: false,
            purgeAt: null,
          })) as any,
        });
      }

      if (agendaEvents.length > 0) {
        await tx.agendaEvent.createMany({
          data: agendaEvents.map((ev: any) => ({
            id: ev.id,
            date: ev.date,
            title: ev.title,
            type: ev.type,
            time: ev.time,
            durationMinutes: ev.durationMinutes ?? 0,
            location: ev.location ?? null,
            notes: ev.notes ?? null,
            reminder: ev.reminder ?? { enabled: false, label: "" },
            linkedServiceId: ev.linkedServiceId ?? null,
            responsibilities: ev.responsibilities ?? [],
            createdAt: ev.createdAt ? new Date(ev.createdAt) : undefined,
            updatedAt: ev.updatedAt ? new Date(ev.updatedAt) : undefined,
            deleted: false,
            purgeAt: null,
          })) as any,
        });
      }
    });

    void notifyOrg({
      organizationId: this.orgId,
      roles: ["owner", "admin"],
      type: "backup.restored",
      title: t(this.locale, "notification.backup_restored_title"),
      description: t(this.locale, "notification.backup_restored_description", {
        folders: folders.length,
        songs: songs.length,
        services: services.length,
      }),
      href: "/organization",
    });

    return {
      counts: {
        folders: folders.length,
        songs: songs.length,
        services: services.length,
        collections: collections.length,
        agendaEvents: agendaEvents.length,
      },
    };
  }
}
