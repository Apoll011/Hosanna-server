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
  // ==========================================
  // ---------- SONG TEMPLATES ----------------
  // ==========================================

  {
    id: 'song-pro-studio',
    model: 'song',
    name: 'Professional Studio',
    description: 'A premium, single-column layout with elegant headers, metadata tags (Key, Tempo), and perfectly aligned chords.',
    defaultSettings: { fontSize: '14px', showChords: true, columns: 1, hideParsedTitle: true, chordColor: '#2563eb' },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto+Mono:wght@500&display=swap" rel="stylesheet">
        <style>
          :root { 
            --font-size: {{settings.fontSize}}; 
            --chord-color: {{settings.chordColor}};
          }
          body { 
            font-family: 'Inter', sans-serif; 
            padding: 40px; 
            font-size: var(--font-size); 
            line-height: 1.5;
            color: #1f2937;
          }
          
          /* Header Styling */
          .header-container {
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .title-group h1 { margin: 0; font-size: 2.5em; font-weight: 700; color: #111827; letter-spacing: -0.02em; }
          .title-group h2 { margin: 5px 0 0 0; font-size: 1.2em; font-weight: 400; color: #6b7280; }
          .metadata-group { text-align: right; font-size: 0.9em; color: #4b5563; }
          .meta-badge { display: inline-block; background: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-left: 5px; font-weight: 600;}

          /* Hide injected title if requested */
          {{#if settings.hideParsedTitle}} h1.title, h2.subtitle { display: none !important; } {{/if}}
          
          /* ChordSheetJS Standard Classes */
          .chord-sheet { column-count: {{settings.columns}}; column-gap: 40px; }

         .chord { 
            font-family: 'Roboto Mono', monospace; 
            font-weight: 500; 
            color: var(--chord-color); 
            height: 1.2em; 
            display: {{#if settings.showChords}}block{{else}}none{{/if}}; 
          }
          .lyrics { display: block; height: 1.2em; }
/* --- Paragraphs & Rows --- */
          .paragraph {
            margin-bottom: 1em;
          }

          .row {
            display: flex;
            flex-wrap: wrap; /* Prevents long lines from cutting off the screen */
          }

/* --- Columns (The chord + lyric pairs) --- */
          .column {
            display: inline-flex;
            flex-direction: column; /* Stacks the chord vertically above the lyric */
            vertical-align: bottom;
          }

          /* --- Chords --- */
          .chord {
            min-height: 1.2em; /* Keeps row height uniform if a word has no chord */
            font-weight: bold;
          }

          .chord:not(:last-child) {
            padding-right: 10px;
          }

          .chord::after {
            content: '\200b'; /* Zero-width space to force height execution */
          }

          /* --- Lyrics --- */
          .lyrics {
            white-space: pre; /* Essential: Stops the browser from destroying spaces */
          }

          .lyrics::after {
            content: '\200b'; /* Zero-width space to prevent text-collapse */
          }

          /* Print Adjustments */
          @media print { 
            body { padding: 0; margin: 15mm; } 
            .header-container { border-bottom-color: #000; }
            .meta-badge { border: 1px solid #ccc; }
          }
        
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="title-group">
            <h1>{{song.title}}</h1>
            <h2>{{song.artist}}</h2>
          </div>
          <div class="metadata-group">
            {{#if song.key}}<span class="meta-badge">Key: {{song.key}}</span>{{/if}}
            {{#if song.bpm}}<span class="meta-badge">{{song.bpm}} BPM</span>{{/if}}
          </div>
        </div>
        {{{htmlContent}}}
      </body>
      </html>
    `
  },

  {
    id: 'song-compact',
    model: 'song',
    name: 'Compact Two-Column',
    description: 'Paper-saving design utilizing two columns, smaller text, and minimal spacing. Great for long songs.',
    defaultSettings: { fontSize: '11px', showChords: true, columns: 2, hideParsedTitle: true },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Helvetica+Neue:wght@400;700&display=swap" rel="stylesheet">
        <style>
          :root { --font-size: {{settings.fontSize}}; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; font-size: var(--font-size); }
          
          .compact-header { text-align: center; margin-bottom: 20px; }
          .compact-header h1 { margin: 0; font-size: 1.8em; }
          .compact-header h3 { margin: 0; color: #555; font-weight: normal; }
          hr { border: none; border-top: 1px solid #ccc; margin-bottom: 20px; }

          {{#if settings.hideParsedTitle}} h1.title, h2.subtitle { display: none !important; } {{/if}}
          
          .chord-sheet { column-count: {{settings.columns}}; column-gap: 30px; }

          /* --- Paragraphs & Rows --- */
          .paragraph {
            margin-bottom: 1em;
          }

          .row {
            display: flex;
            flex-wrap: wrap; /* Prevents long lines from cutting off the screen */
          }

/* --- Columns (The chord + lyric pairs) --- */
          .column {
            display: inline-flex;
            flex-direction: column; /* Stacks the chord vertically above the lyric */
            vertical-align: bottom;
          }

          /* --- Chords --- */
          .chord {
            min-height: 1.2em; /* Keeps row height uniform if a word has no chord */
            font-weight: bold;
          }

          .chord:not(:last-child) {
            padding-right: 10px;
          }

          .chord::after {
            content: '\200b'; /* Zero-width space to force height execution */
          }

          /* --- Lyrics --- */
          .lyrics {
            white-space: pre; /* Essential: Stops the browser from destroying spaces */
          }

          .lyrics::after {
            content: '\200b'; /* Zero-width space to prevent text-collapse */
          }


          @media print { body { padding: 0; margin: 10mm; } }
        </style>
      </head>
      <body>
        <div class="compact-header">
          <h1>{{song.title}}</h1>
          <h3>{{song.artist}}</h3>
        </div>
        <hr/>
        {{{htmlContent}}}
      </body>
      </html>
    `
  },

  {
    id: 'song-lyrics-only',
    model: 'song',
    name: 'Singer\'s Lyrics Only',
    description: 'Large, readable lyrics with chords completely hidden. Optimized for vocalists.',
    defaultSettings: { fontSize: '18px', showChords: false, columns: 1, hideParsedTitle: true },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
        <style>
          :root { --font-size: {{settings.fontSize}}; }
          body { font-family: 'Merriweather', serif; padding: 40px; font-size: var(--font-size); line-height: 1.8; }
          
          h1.main-title { font-size: 2em; text-align: center; margin-bottom: 5px; }
          h3.main-artist { text-align: center; color: #666; margin-top: 0; margin-bottom: 40px; font-style: italic; }
          
          {{#if settings.hideParsedTitle}} h1.title, h2.subtitle { display: none !important; } {{/if}}
          
          .chord-sheet { column-count: {{settings.columns}}; max-width: 800px; margin: 0 auto; }
          .chord { display: none !important; }
          .lyrics { display: block; height: auto; }
          /* --- Paragraphs & Rows --- */
          .paragraph {
            margin-bottom: 1em;
          }

          .row {
            display: flex;
            flex-wrap: wrap; /* Prevents long lines from cutting off the screen */
          }

/* --- Columns (The chord + lyric pairs) --- */
          .column {
            display: inline-flex;
            flex-direction: column; /* Stacks the chord vertically above the lyric */
            vertical-align: bottom;
          }

          /* --- Chords --- */
          .chord {
            min-height: 1.2em; /* Keeps row height uniform if a word has no chord */
            font-weight: bold;
          }

          .chord:not(:last-child) {
            padding-right: 10px;
          }

          .chord::after {
            content: '\200b'; /* Zero-width space to force height execution */
          }

          /* --- Lyrics --- */
          .lyrics {
            white-space: pre; /* Essential: Stops the browser from destroying spaces */
          }

          .lyrics::after {
            content: '\200b'; /* Zero-width space to prevent text-collapse */
          }

          @media print { body { padding: 0; margin: 20mm; } }
        </style>
      </head>
      <body>
        <h1 class="main-title">{{song.title}}</h1>
        <h3 class="main-artist">{{song.artist}}</h3>
        {{{htmlContent}}}
      </body>
      </html>
    `
  },

  // ==========================================
  // -------- SERVICE TEMPLATES ---------------
  // ==========================================

  {
    id: 'service-musician',
    model: 'service',
    name: 'Musician Master Packet',
    description: 'Generates a cover page with the order of service, followed by page-broken chord sheets for every song.',
    defaultSettings: { pageBreakSongs: true, hideParsedTitle: true, chordColor: '#b91c1c' },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Roboto+Mono:wght@500&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; color: #111827; }
          
          /* Cover Page */
          .cover-page { padding: 40px; page-break-after: always; }
          .service-header { text-align: center; border-bottom: 4px solid #111827; margin-bottom: 40px; padding-bottom: 20px; }
          .service-header h1 { font-size: 3em; margin: 0 0 10px 0; }
          .service-header p { font-size: 1.2em; color: #4b5563; margin: 0; }
          
          .run-sheet { max-width: 800px; margin: 0 auto; }
          .run-sheet-item { display: flex; border-bottom: 1px solid #e5e7eb; padding: 15px 0; align-items: center; }
          .item-num { font-weight: 700; width: 40px; color: #9ca3af; font-size: 1.2em; }
          .item-content { flex-grow: 1; }
          .item-title { font-weight: 600; font-size: 1.2em; }
          .item-notes { font-size: 0.9em; color: #6b7280; font-style: italic; margin-top: 4px; }
          .item-type-badge { background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; text-transform: uppercase; font-weight: 700;}
          
          /* Song Pages */
          .song-page { padding: 40px; {{#if settings.pageBreakSongs}}page-break-before: always;{{/if}} }
          .song-header { border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 30px; }
          .song-header h2 { margin: 0; font-size: 2.2em; }
          .song-header h4 { margin: 5px 0 0 0; color: #6b7280; font-weight: 400; font-size: 1.2em; }
          
          /* Chord styling within service */
          {{#if settings.hideParsedTitle}} h1.title { display: none !important; } {{/if}}
          .chord-sheet { column-count: 1; }
          .paragraph { margin-bottom: 1.5em; break-inside: avoid; }
          .row { display: flex; flex-direction: column; break-inside: avoid; margin-bottom: 4px; }
          .chord { font-family: 'Roboto Mono', monospace; font-weight: 500; color: {{settings.chordColor}}; height: 1.2em; display: block; }
          .lyrics { display: block; height: 1.2em; }

          .row {
              display: flex;
              flex-wrap: nowrap;
              align-items: flex-start;
          }

          .column {
              display: flex;
              flex-direction: column;
              white-space: pre;
          }
          @media print { .cover-page, .song-page { padding: 0; margin: 15mm; } }
        </style>
      </head>
      <body>
        <!-- PAGE 1: Order of Service -->
        <div class="cover-page">
          <div class="service-header">
            <h1>{{service.name}}</h1>
            <p>{{service.date}}</p>
          </div>
          
          <div class="run-sheet">
            {{#each elements}}
              <div class="run-sheet-item">
                <div class="item-num">{{this.position}}</div>
                <div class="item-content">
                  <div class="item-title">{{this.title}}</div>
                  {{#if this.notes}}<div class="item-notes">{{this.notes}}</div>{{/if}}
                </div>
                <div class="item-type-badge">{{this.type}}</div>
              </div>
            {{/each}}
          </div>
        </div>
        
        <!-- SUBSEQUENT PAGES: Songs -->
        {{#each elements}}
          {{#if (eq this.type 'song')}}
             <div class="song-page">
               <div class="song-header">
                 <h2>{{this.songTitle}}</h2>
                 <h4>{{this.songArtist}}</h4>
               </div>
               <div class="song-content">
                 {{{this.songHtml}}}
               </div>
             </div>
          {{/if}}
        {{/each}}
      </body>
      </html>
    `
  },

  {
    id: 'service-executive',
    model: 'service',
    name: 'Executive Run Sheet',
    description: 'A clean, single-page summary of the event schedule. Skips printing the chords completely. Great for A/V teams and speakers.',
    defaultSettings: { },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; padding: 40px; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 2em; text-transform: uppercase; letter-spacing: 1px; }
          .header p { margin: 0; font-weight: 500; color: #555; }
          
          table { width: 100%; border-collapse: collapse; }
          th { background: #f4f4f5; text-align: left; padding: 12px; font-size: 0.9em; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; border-bottom: 2px solid #d4d4d8;}
          td { padding: 15px 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
          
          .col-pos { width: 5%; font-weight: 700; color: #a1a1aa; }
          .col-time { width: 15%; font-family: monospace; font-size: 1.1em; }
          .col-title { width: 40%; font-weight: 600; font-size: 1.1em; }
          .col-notes { width: 40%; color: #52525b; font-size: 0.95em; }

          .type-song .col-title { color: #2563eb; }
          
          @media print { body { padding: 0; margin: 15mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>{{service.name}}</h1>
          <p>{{service.date}}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th class="col-pos">#</th>
              <th class="col-time">Time/Dur</th>
              <th class="col-title">Element</th>
              <th class="col-notes">Notes / Details</th>
            </tr>
          </thead>
          <tbody>
            {{#each elements}}
            <tr class="type-{{this.type}}">
              <td class="col-pos">{{this.position}}</td>
              <td class="col-time">{{#if this.duration}}{{this.duration}}{{else}}--:--{{/if}}</td>
              <td class="col-title">
                {{this.title}}
                {{#if (eq this.type 'song')}}<br><span style="font-size:0.8em; font-weight:normal; color:#6b7280;">{{this.songArtist}}</span>{{/if}}
              </td>
              <td class="col-notes">{{this.notes}}</td>
            </tr>
            {{/each}}
          </tbody>
        </table>
      </body>
      </html>
    `
  },

  // ==========================================
  // -------- FOLDER TEMPLATES ----------------
  // ==========================================

  {
    id: 'folder-catalog',
    model: 'folder',
    name: 'Professional Catalog (Table)',
    description: 'A deeply styled, alternating-row table summarizing all songs in a folder.',
    defaultSettings: { showTags: true, showKey: true },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1f2937; }
          .folder-header { margin-bottom: 40px; }
          .folder-header h1 { font-size: 2.5em; margin: 0 0 5px 0; color: #111827; }
          .folder-header p { margin: 0; color: #6b7280; font-size: 1.1em; }
          
          table { width: 100%; border-collapse: collapse; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }
          thead { background-color: #f9fafb; }
          th { padding: 12px 16px; text-align: left; font-size: 0.85em; font-weight: 600; text-transform: uppercase; color: #374151; letter-spacing: 0.05em; border-bottom: 2px solid #e5e7eb; }
          td { padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
          tr:nth-child(even) { background-color: #fdfdfd; }
          
          .song-title { font-weight: 600; color: #111827; font-size: 1.1em; }
          .song-artist { color: #6b7280; font-size: 0.9em; margin-top: 4px; }
          .tag-badge { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 9999px; font-size: 0.75em; font-weight: 600; margin-right: 4px; margin-bottom: 4px; }
          
          @media print { body { padding: 0; margin: 15mm; } table { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="folder-header">
          <h1>{{folder.name}}</h1>
          <p>Song Catalog &bull; {{folder.songs.length}} Tracks</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Song</th>
              {{#if settings.showKey}}<th>Key/BPM</th>{{/if}}
              {{#if settings.showTags}}<th>Tags</th>{{/if}}
            </tr>
          </thead>
          <tbody>
            {{#each folder.songs}}
            <tr>
              <td>
                <div class="song-title">{{this.title}}</div>
                <div class="song-artist">{{this.artist}}</div>
              </td>
              {{#if ../settings.showKey}}
              <td style="color: #4b5563; font-size: 0.9em;">
                {{#if this.key}}<strong>{{this.key}}</strong>{{else}}-{{/if}} 
                {{#if this.bpm}}<br>{{this.bpm}} bpm{{/if}}
              </td>
              {{/if}}
              {{#if ../settings.showTags}}
              <td>
                {{#each this.tags}}
                  <span class="tag-badge">{{this}}</span>
                {{/each}}
              </td>
              {{/if}}
            </tr>
            {{/each}}
          </tbody>
        </table>
      </body>
      </html>
    `
  },

  {
    id: 'folder-cards',
    model: 'folder',
    name: 'Grid Cards',
    description: 'Displays folder contents in a beautiful, grid-based card layout. Ideal for digital PDF browsing.',
    defaultSettings: { },
    templateString: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; padding: 40px; background: #f3f4f6; color: #1f2937; }
          h1.title-header { font-size: 2.5em; text-align: center; margin-bottom: 40px; }
          
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
          .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-top: 4px solid #3b82f6; break-inside: avoid; page-break-inside: avoid; }
          
          .card-title { font-size: 1.25em; font-weight: 700; margin-bottom: 5px; }
          .card-artist { color: #6b7280; font-size: 0.95em; margin-bottom: 15px; }
          .card-meta { font-size: 0.85em; color: #4b5563; display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 10px; }
          
          @media print { 
            body { padding: 0; margin: 10mm; background: #fff; } 
            .card { border: 1px solid #ccc; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <h1 class="title-header">{{folder.name}}</h1>
        
        <div class="grid">
          {{#each folder.songs}}
          <div class="card">
            <div class="card-title">{{this.title}}</div>
            <div class="card-artist">{{this.artist}}</div>
            <div class="card-meta">
              <span>{{#if this.key}}Key: <strong>{{this.key}}</strong>{{else}}--{{/if}}</span>
              <span>{{#if this.bpm}}{{this.bpm}} BPM{{/if}}</span>
            </div>
          </div>
          {{/each}}
        </div>
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