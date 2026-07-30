// src/services/print.services.ts
import { Prisma } from '@prisma/client';
import ChordSheetJS from 'chordsheetjs';
import Handlebars from 'handlebars';
import type { TenantPrisma } from '../database/prisma';
import { AppError } from '../utils/errors';
import { templateRegistry, getTemplateById, PrintModelType } from '../templates/print';

export interface ServiceElement {
  id: string;
  type: 'welcome' | 'scripture' | 'message' | 'reading' | 'announcement' | 'custom' | 'song' | string;
  title: string;
  content?: string;
  position?: number;
  songId?: string;
  notes?: string;
  passage?: string;
}

export class PrintService {
  constructor(private db: TenantPrisma, private tenantId: string) {}

  // Helpers
  private parseChordPro(content: string): string {
    const parser = new ChordSheetJS.ChordProParser();
    const song = parser.parse(content);
    const formatter = new ChordSheetJS.HtmlDivFormatter();
    return formatter.format(song);
  }

  private async getSettings() {
    let settings = await this.db.settings.findUnique({ where: { tenantId: this.tenantId } });
    if (!settings) {
      settings = await this.db.settings.create({ data: { tenantId: this.tenantId } });
    }
    return settings;
  }

  async renderSong(songId: string): Promise<string> {
    const song = await this.db.song.findUnique({
      where: { id: songId, tenantId: this.tenantId }
    });
    if (!song) throw AppError.notFound('SONG_NOT_FOUND', 'Song not found');

    const settings = await this.getSettings();
    const templateDef = getTemplateById(settings.songTemplateId, 'song');
    const customConfig = (settings.songTemplateConfig as Record<string, any>) || {};
    const finalSettings = { ...templateDef.defaultSettings, ...customConfig };

    const htmlContent = this.parseChordPro(song.content);
    
    const compiled = Handlebars.compile(templateDef.templateString);
    return compiled({ song, htmlContent, settings: finalSettings });
  }

  async renderFolder(folderId: string): Promise<string> {
    const folder = await this.db.folder.findUnique({
      where: { id: folderId, tenantId: this.tenantId },
      include: { songs: true, children: true }
    });
    if (!folder) throw AppError.notFound('FOLDER_NOT_FOUND', 'Folder not found');

    const settings = await this.getSettings();
    const templateDef = getTemplateById(settings.folderTemplateId, 'folder');
    const customConfig = (settings.folderTemplateConfig as Record<string, any>) || {};
    const finalSettings = { ...templateDef.defaultSettings, ...customConfig };

    const compiled = Handlebars.compile(templateDef.templateString);
    return compiled({ folder, settings: finalSettings });
  }

  async renderService(serviceId: string): Promise<string> {
    const service = await this.db.service.findUnique({
      where: { id: serviceId, tenantId: this.tenantId }
    });
    if (!service) throw AppError.notFound('SERVICE_NOT_FOUND', 'Service not found');

    const settings = await this.getSettings();
    const templateDef = getTemplateById(settings.serviceTemplateId, 'service');
    const customConfig = (settings.serviceTemplateConfig as Record<string, any>) || {};
    const finalSettings = { ...templateDef.defaultSettings, ...customConfig };

    const elements = (service.elements as any[]) || [];
    
    // Batch lookup all songs required in this service to avoid N+1 queries
    const songIds = elements.filter(e => e.type === 'song' && e.songId).map(e => e.songId);
    const songs = await this.db.song.findMany({
      where: { id: { in: songIds }, tenantId: this.tenantId }
    });
    const songMap = new Map(songs.map(s => [s.id, s]));

    // Pre-parse the ChordPro for all songs in the service plan
    const enrichedElements = elements.map(el => {
      if (el.type === 'song' && el.songId) {
        const songData = songMap.get(el.songId);
        if (songData) {
          return {
            ...el,
            songArtist: songData.artist,
            songHtml: this.parseChordPro(songData.content)
          };
        }
      }
      return el;
    });

    const compiled = Handlebars.compile(templateDef.templateString);
    return compiled({ service, elements: enrichedElements, settings: finalSettings });
  }

  // --- TEMPLATE & SETTINGS MANAGEMENT ---

  async getTemplates() {
    const settings = await this.getSettings();
    return {
      activeSettings: {
        service: { id: settings.serviceTemplateId, config: settings.serviceTemplateConfig },
        folder: { id: settings.folderTemplateId, config: settings.folderTemplateConfig },
        song: { id: settings.songTemplateId, config: settings.songTemplateConfig },
      },
      registry: templateRegistry.map(({ templateString, ...meta }) => meta) // Omit raw HTML logic
    };
  }

  async updateSettings(model: PrintModelType, templateId: string, customSettings: any) {
    const patch: Prisma.SettingsUpdateInput = {};
    if (model === 'service') {
      patch.serviceTemplateId = templateId;
      patch.serviceTemplateConfig = customSettings;
    } else if (model === 'folder') {
      patch.folderTemplateId = templateId;
      patch.folderTemplateConfig = customSettings;
    } else if (model === 'song') {
      patch.songTemplateId = templateId;
      patch.songTemplateConfig = customSettings;
    }

    return await this.db.settings.update({
      where: { tenantId: this.tenantId },
      data: patch
    });
  }
}