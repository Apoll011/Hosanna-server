// src/templates/print.ts
import Handlebars from 'handlebars';

export type PrintModelType = 'service' | 'folder' | 'song';

export interface PrintTemplate {
  id: string;
  model: PrintModelType;
  name: string;
  description: string;
  defaultSettings: Record<string, any>;
  templateString: string;
}

Handlebars.registerHelper('eq', (a, b) => a === b);

export const templateRegistry: PrintTemplate[] = [
  // --- SONG TEMPLATES ---
  {
    id: 'song-default',
    model: 'song',
    name: 'Default Clean',
    description: 'A clean, standard chord sheet with a customizable header.',
    defaultSettings: { fontSize: '14px', showChords: true, columns: 1 },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          :root { --font-size: {{settings.fontSize}}; }
          body { font-family: sans-serif; padding: 20px; font-size: var(--font-size); }
          .song-title { margin-bottom: 5px; }
          .song-artist { color: #555; margin-bottom: 20px; }
          
          /* ChordSheetJS Standard Classes */
          .chord-sheet { display: block; column-count: {{settings.columns}}; }
          .paragraph { margin-bottom: 1em; break-inside: avoid; }
          .row { display: flex; flex-direction: column; break-inside: avoid; }
          .chord { font-weight: bold; color: #0056b3; height: 1em; display: {{#if settings.showChords}}block{{else}}none{{/if}}; }
          .lyrics { display: block; height: 1em; }
          
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1 class="song-title">{{song.title}}</h1>
        <h3 class="song-artist">{{song.artist}}</h3>
        {{{htmlContent}}}
      </body>
      </html>
    `
  },
  
  // --- SERVICE TEMPLATES ---
  {
    id: 'service-default',
    model: 'service',
    name: 'Standard Order of Service',
    description: 'Generates a multi-page PDF combining service elements and chord sheets.',
    defaultSettings: { pageBreakSongs: true },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: sans-serif; padding: 20px; }
          .service-header { border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
          .element { margin-bottom: 15px; }
          .element-title { font-size: 1.2em; font-weight: bold; }
          .song-block { margin-top: 20px; {{#if settings.pageBreakSongs}}page-break-before: always;{{/if}} }
          
          /* ChordSheetJS Standard Classes for Songs inline */
          .chord { font-weight: bold; color: #0056b3; }
        </style>
      </head>
      <body>
        <div class="service-header">
          <h1>{{service.name}}</h1>
          <p>Date: {{service.date}}</p>
        </div>
        
        <h2>Order of Service</h2>
        {{#each elements}}
          <div class="element">
            <span class="element-title">{{this.position}}. {{this.title}}</span>
            {{#if this.notes}}<p><em>{{this.notes}}</em></p>{{/if}}
            
            {{#if (eq this.type 'song')}}
               <div class="song-block">
                 <h2>Song: {{this.songArtist}} - {{this.title}}</h2>
                 {{{this.songHtml}}}
               </div>
            {{/if}}
          </div>
        {{/each}}
      </body>
      </html>
    `
  },

  // --- FOLDER TEMPLATES ---
  {
    id: 'folder-default',
    model: 'folder',
    name: 'Folder Table of Contents',
    description: 'Structured table layout for folders and their contents.',
    defaultSettings: { showTags: true },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
          th { background: #f9f9f9; }
        </style>
      </head>
      <body>
        <h1>Folder: {{folder.name}}</h1>
        <table>
          <thead>
            <tr><th>Title</th><th>Artist</th>{{#if settings.showTags}}<th>Tags</th>{{/if}}</tr>
          </thead>
          <tbody>
            {{#each folder.songs}}
            <tr>
              <td>{{this.title}}</td>
              <td>{{this.artist}}</td>
              {{#if ../settings.showTags}}<td>{{this.tags}}</td>{{/if}}
            </tr>
            {{/each}}
          </tbody>
        </table>
      </body>
      </html>
    `
  }
];

export function getTemplateById(id: string, model: PrintModelType): PrintTemplate {
  const tpl = templateRegistry.find(t => t.id === id && t.model === model);
  if (!tpl) {
    // Fallback to the first available template for the model
    return templateRegistry.find(t => t.model === model)!;
  }
  return tpl;
}