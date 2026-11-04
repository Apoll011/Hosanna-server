import fs from 'fs';
import { stringify } from 'yaml';


const schemas = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {},
        },
      },
    },
  },
  Checkpoint: {
    type: 'object',
    nullable: true,
    properties: {
      updatedAt: { type: 'number', description: 'Unix epoch ms' },
      id: { type: 'string' },
    },
  },
  Song: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      orgId: { type: 'string' },
      title: { type: 'string' },
      artist: { type: 'string' },
      content: { type: 'string' },
      folderId: { type: 'string', format: 'uuid', nullable: true },
      path: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      song_number: { type: 'integer', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      deleted: { type: 'boolean' },
      purgeAt: { type: 'string', format: 'date-time', nullable: true },
      collectionIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      isDeleted: { type: 'boolean' },
    },
  },
  Folder: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      orgId: { type: 'string' },
      name: { type: 'string' },
      color: { type: 'string' },
      icon: { type: 'string' },
      parentId: { type: 'string', format: 'uuid', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      deleted: { type: 'boolean' },
      purgeAt: { type: 'string', format: 'date-time', nullable: true },
      songCount: { type: 'integer' },
      folderCount: { type: 'integer' },
      isDeleted: { type: 'boolean' },
    },
  },
  ServiceElement: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string', enum: ['welcome', 'scripture', 'message', 'announcement', 'custom', 'song'] },
      title: { type: 'string' },
      content: { type: 'string', nullable: true },
      position: { type: 'integer', nullable: true },
      songId: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      passage: { type: 'string', nullable: true },
      duration: { type: 'integer', nullable: true },
    },
  },
  Service: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      date: { type: 'string', format: 'date-time' },
      notes: { type: 'string', nullable: true },
      elements: { type: 'array', items: { $ref: '#/components/schemas/ServiceElement' } },
      archived: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      isDeleted: { type: 'boolean' },
      purgeAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  ServiceNote: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      serviceId: { type: 'string', format: 'uuid' },
      elementId: { type: 'string', nullable: true },
      body: { type: 'string' },
      private: { type: 'boolean' },
      author: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          image: { type: 'string', nullable: true },
        },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Collection: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      color: { type: 'string' },
      icon: { type: 'string' },
      image: { type: 'string', nullable: true },
      songIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      songCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      isDeleted: { type: 'boolean' },
      purgeAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  AgendaEvent: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      date: { type: 'string' },
      title: { type: 'string' },
      type: { type: 'string' },
      time: { type: 'string' },
      durationMinutes: { type: 'integer' },
      location: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      reminder: {},
      linkedServiceId: { type: 'string', format: 'uuid', nullable: true },
      responsibilities: {},
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      isDeleted: { type: 'boolean' },
      purgeAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  PlanPricing: {
    type: 'object',
    properties: {
      plan: { type: 'string', enum: ['cloud'] },
      currency: { type: 'string' },
      monthly: {
        type: 'object',
        properties: {
          amount: { type: 'string' },
          amountCents: { type: 'integer' },
          period: { type: 'string' },
        },
      },
      annual: {
        type: 'object',
        properties: {
          amount: { type: 'string' },
          amountCents: { type: 'integer' },
          period: { type: 'string' },
        },
      },
    },
  },
  BackupDocument: {
    type: 'object',
    required: ['version', 'folders', 'songs', 'services'],
    properties: {
      version: { type: 'string', example: '2.2' },
      exportedAt: { type: 'string', format: 'date-time' },
      folders: { type: 'array', items: { $ref: '#/components/schemas/Folder' } },
      songs: { type: 'array', items: { $ref: '#/components/schemas/Song' } },
      services: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
      collections: { type: 'array', items: { $ref: '#/components/schemas/Collection' } },
      agendaEvents: { type: 'array', items: { $ref: '#/components/schemas/AgendaEvent' } },
    },
  },
  ReplicationCollection: {
    type: 'string',
    enum: ['songs', 'folders', 'collections', 'services', 'agendaEvents'],
  },
  PullRequest: {
    type: 'object',
    properties: {
      checkpoint: { $ref: '#/components/schemas/Checkpoint' },
      limit: { type: 'integer', minimum: 1, maximum: 2000, default: 100 },
    },
  },
  PullResponse: {
    type: 'object',
    properties: {
      documents: { type: 'array', items: { type: 'object', additionalProperties: true } },
      checkpoint: { $ref: '#/components/schemas/Checkpoint' },
    },
  },
  ChangeRow: {
    type: 'object',
    required: ['newDocumentState'],
    properties: {
      newDocumentState: { type: 'object', additionalProperties: true },
      assumedMasterState: { type: 'object', additionalProperties: true, nullable: true },
    },
  },
  AnnotationGetResponse: {
    type: 'object',
    properties: {
      canvasDataBase64: { type: 'string' },
      updatedAt: { type: 'string', format: 'date-time' },
      updatedById: { type: 'string', nullable: true },
      revision: { type: 'integer' },
    },
  },
};

const session = [{ cookieAuth: [] }, { bearerAuth: [] }];
const cron = [{ cronSecret: [] }];

function op(summary, opts = {}) {
  const o = {
    summary,
    responses: opts.responses || {
      '200': { description: 'OK' },
      '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  };
  if (opts.tags) o.tags = opts.tags;
  if (opts.security) o.security = opts.security;
  if (opts.operationId) o.operationId = opts.operationId;
  if (opts.parameters) o.parameters = opts.parameters;
  if (opts.requestBody) o.requestBody = opts.requestBody;
  if (opts.description) o.description = opts.description;
  return o;
}

function jsonBody(schema, required = true) {
  return {
    required,
    content: { 'application/json': { schema } },
  };
}

function jsonResp(status, schema, description = 'OK') {
  return {
    [String(status)]: {
      description,
      content: { 'application/json': { schema } },
    },
  };
}

const paths = {};

function add(path, method, operation) {
  if (!paths[path]) paths[path] = {};
  paths[path][method] = operation;
}

// Health
add('/health', 'get', op('Health check', {
  tags: ['Health'], operationId: 'getHealth', security: [],
  responses: jsonResp(200, { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string' } } }),
}));

// Billing
add('/billing/pricing', 'get', op('Public plan display prices', {
  tags: ['Billing'], operationId: 'getBillingPricing', security: [],
  responses: jsonResp(200, { $ref: '#/components/schemas/PlanPricing' }),
}));
add('/billing/entitlement', 'get', op('Org subscription entitlement', {
  tags: ['Billing'], operationId: 'getBillingEntitlement', security: session,
  responses: jsonResp(200, { type: 'object', properties: { entitled: { type: 'boolean' } } }),
}));

// Cron
for (const name of ['agenda-reminders', 'purge-trash']) {
  for (const method of ['get', 'post']) {
    add(`/cron/${name}`, method, op(`Cron: ${name}`, {
      tags: ['Cron'], operationId: `${method}Cron${name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
      security: cron,
      responses: jsonResp(200, { type: 'object', additionalProperties: true }),
    }));
  }
}

// Songs
add('/songs', 'get', op('List songs', {
  tags: ['Songs'], operationId: 'listSongs', security: session,
  parameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
    { name: 'search', in: 'query', schema: { type: 'string' } },
    { name: 'folder', in: 'query', schema: { type: 'string' }, description: 'UUID or "root"' },
    { name: 'tag', in: 'query', schema: { type: 'string' } },
    { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['title', 'artist', 'createdAt', 'updatedAt'] } },
    { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
  ],
  responses: jsonResp(200, {
    type: 'object',
    properties: {
      songs: { type: 'array', items: { $ref: '#/components/schemas/Song' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      limit: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  }),
}));
add('/songs', 'post', op('Create song', {
  tags: ['Songs'], operationId: 'createSong', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string' },
      artist: { type: 'string' },
      content: { type: 'string' },
      folderId: { type: 'string', format: 'uuid', nullable: true },
      song_number: { type: 'integer', nullable: true },
      path: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  }),
  responses: { ...jsonResp(201, { $ref: '#/components/schemas/Song' }), '401': { description: 'Unauthorized' } },
}));
add('/songs/batch', 'post', op('Create songs batch', {
  tags: ['Songs'], operationId: 'createSongsBatch', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['songs'],
    properties: { songs: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: true } } },
  }),
  responses: jsonResp(201, { type: 'array', items: { $ref: '#/components/schemas/Song' } }),
}));
add('/songs/batch-tags', 'put', op('Batch update song tags', {
  tags: ['Songs'], operationId: 'batchUpdateSongTags', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['songIds', 'tags'],
    properties: {
      songIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
      tags: { type: 'array', items: { type: 'string' } },
      mode: { type: 'string', enum: ['append', 'replace', 'remove'], default: 'append' },
    },
  }),
  responses: jsonResp(200, { type: 'object', properties: { success: { type: 'boolean' }, count: { type: 'integer' } } }),
}));
add('/songs/{id}', 'get', op('Get song', {
  tags: ['Songs'], operationId: 'getSong', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: jsonResp(200, { $ref: '#/components/schemas/Song' }),
}));
add('/songs/{id}/download', 'get', op('Download song ChordPro', {
  tags: ['Songs'], operationId: 'downloadSong', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: {
    '200': { description: 'ChordPro file', content: { 'text/vnd.chordpro': { schema: { type: 'string' } } } },
  },
}));
add('/songs/{id}', 'put', op('Update song', {
  tags: ['Songs'], operationId: 'updateSong', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['updatedAt'],
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      title: { type: 'string' },
      artist: { type: 'string' },
      content: { type: 'string' },
      folderId: { type: 'string', format: 'uuid', nullable: true },
      song_number: { type: 'integer', nullable: true },
      path: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  }),
  responses: { ...jsonResp(200, { $ref: '#/components/schemas/Song' }), '409': { description: 'Conflict' } },
}));
add('/songs/{id}', 'delete', op('Delete song', {
  tags: ['Songs'], operationId: 'deleteSong', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { '204': { description: 'Deleted' } },
}));
add('/songs/{id}/move', 'put', op('Move song', {
  tags: ['Songs'], operationId: 'moveSong', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['updatedAt', 'folderId'],
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      folderId: { type: 'string', format: 'uuid', nullable: true },
      newPath: { type: 'string' },
    },
  }),
  responses: jsonResp(200, { $ref: '#/components/schemas/Song' }),
}));

// Folders
add('/folders', 'get', op('List folders', {
  tags: ['Folders'], operationId: 'listFolders', security: session,
  responses: jsonResp(200, { type: 'array', items: { $ref: '#/components/schemas/Folder' } }),
}));
add('/folders/flat', 'get', op('List folders flat', {
  tags: ['Folders'], operationId: 'listFoldersFlat', security: session,
  responses: jsonResp(200, { type: 'array', items: { $ref: '#/components/schemas/Folder' } }),
}));
add('/folders', 'post', op('Create folder', {
  tags: ['Folders'], operationId: 'createFolder', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      parentId: { type: 'string', format: 'uuid', nullable: true },
      color: { type: 'string' },
      icon: { type: 'string' },
    },
  }),
  responses: jsonResp(201, { $ref: '#/components/schemas/Folder' }),
}));
add('/folders/{id}', 'put', op('Update folder', {
  tags: ['Folders'], operationId: 'updateFolder', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['updatedAt'],
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      name: { type: 'string' },
      parentId: { type: 'string', format: 'uuid', nullable: true },
      color: { type: 'string' },
      icon: { type: 'string' },
    },
  }),
  responses: jsonResp(200, { $ref: '#/components/schemas/Folder' }),
}));
add('/folders/{id}', 'delete', op('Delete folder', {
  tags: ['Folders'], operationId: 'deleteFolder', security: session,
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'action', in: 'query', schema: { type: 'string', enum: ['move_to_root', 'delete_songs'], default: 'move_to_root' } },
  ],
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/folders/{id}/move-content-to-root', 'delete', op('Delete folder moving content to root', {
  tags: ['Folders'], operationId: 'deleteFolderMoveContentToRoot', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: jsonResp(200, { type: 'object', properties: { movedSongs: { type: 'integer' }, movedFolders: { type: 'integer' } } }),
}));
add('/folders/{id}/with-content', 'delete', op('Delete folder with content', {
  tags: ['Folders'], operationId: 'deleteFolderWithContent', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));

// Services
add('/services', 'get', op('List services', {
  tags: ['Services'], operationId: 'listServices', security: session,
  parameters: [{ name: 'archived', in: 'query', schema: { type: 'boolean', default: false } }],
  responses: jsonResp(200, { type: 'array', items: { $ref: '#/components/schemas/Service' } }),
}));
add('/services', 'post', op('Create service', {
  tags: ['Services'], operationId: 'createService', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['name', 'date'],
    properties: {
      name: { type: 'string' },
      date: { type: 'string' },
      notes: { type: 'string' },
      elements: { type: 'array', items: { $ref: '#/components/schemas/ServiceElement' } },
    },
  }),
  responses: jsonResp(201, { $ref: '#/components/schemas/Service' }),
}));
add('/services/{id}', 'get', op('Get service', {
  tags: ['Services'], operationId: 'getService', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: jsonResp(200, { $ref: '#/components/schemas/Service' }),
}));
add('/services/{id}', 'put', op('Update service', {
  tags: ['Services'], operationId: 'updateService', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['updatedAt'],
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      name: { type: 'string' },
      date: { type: 'string' },
      notes: { type: 'string' },
      archived: { type: 'boolean' },
      elements: { type: 'array', items: { $ref: '#/components/schemas/ServiceElement' } },
    },
  }),
  responses: jsonResp(200, { $ref: '#/components/schemas/Service' }),
}));
add('/services/{id}', 'delete', op('Delete service', {
  tags: ['Services'], operationId: 'deleteService', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  responses: { '204': { description: 'Deleted' } },
}));
add('/services/{id}/elements', 'put', op('Replace service elements', {
  tags: ['Services'], operationId: 'updateServiceElements', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['updatedAt', 'elements'],
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      elements: { type: 'array', items: { $ref: '#/components/schemas/ServiceElement' } },
    },
  }),
  responses: jsonResp(200, { $ref: '#/components/schemas/Service' }),
}));

// Notes
add('/services/{id}/notes', 'get', op('List service notes', {
  tags: ['ServiceNotes'], operationId: 'listServiceNotes', security: session,
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'elementId', in: 'query', schema: { type: 'string', format: 'uuid' } },
    { name: 'scope', in: 'query', schema: { type: 'string', enum: ['all', 'service'], default: 'all' } },
  ],
  responses: jsonResp(200, { type: 'array', items: { $ref: '#/components/schemas/ServiceNote' } }),
}));
add('/services/{id}/notes', 'post', op('Create service note', {
  tags: ['ServiceNotes'], operationId: 'createServiceNote', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['body'],
    properties: {
      body: { type: 'string', minLength: 1, maxLength: 10000 },
      elementId: { type: 'string', format: 'uuid', nullable: true },
      private: { type: 'boolean', default: false },
    },
  }),
  responses: jsonResp(201, { $ref: '#/components/schemas/ServiceNote' }),
}));
add('/services/{id}/notes/{noteId}', 'put', op('Update service note', {
  tags: ['ServiceNotes'], operationId: 'updateServiceNote', security: session,
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'noteId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  requestBody: jsonBody({
    type: 'object',
    properties: { body: { type: 'string' }, private: { type: 'boolean' } },
  }),
  responses: jsonResp(200, { $ref: '#/components/schemas/ServiceNote' }),
}));
add('/services/{id}/notes/{noteId}', 'delete', op('Delete service note', {
  tags: ['ServiceNotes'], operationId: 'deleteServiceNote', security: session,
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'noteId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: { '204': { description: 'Deleted' } },
}));

// Annotation
add('/annotation/services/{serviceId}/songs/{songId}/annotation', 'get', op('Get song annotation', {
  tags: ['Annotations'], operationId: 'getAnnotation', security: session,
  parameters: [
    { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
    { name: 'songId', in: 'path', required: true, schema: { type: 'string' } },
  ],
  responses: { ...jsonResp(200, { $ref: '#/components/schemas/AnnotationGetResponse' }), '404': { description: 'Not found' } },
}));
add('/annotation/services/{serviceId}/songs/{songId}/annotation', 'put', op('Put song annotation', {
  tags: ['Annotations'], operationId: 'putAnnotation', security: session,
  parameters: [
    { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
    { name: 'songId', in: 'path', required: true, schema: { type: 'string' } },
  ],
  requestBody: jsonBody({
    type: 'object',
    required: ['canvasDataBase64'],
    properties: { canvasDataBase64: { type: 'string' } },
  }),
  responses: jsonResp(200, {
    type: 'object',
    properties: {
      updatedAt: { type: 'string', format: 'date-time' },
      updatedById: { type: 'string', nullable: true },
      revision: { type: 'integer' },
    },
  }),
}));

// Replication
add('/replication/{collection}/pull', 'post', op('Pull one collection', {
  tags: ['Replication'], operationId: 'pullCollection', security: session,
  parameters: [{ name: 'collection', in: 'path', required: true, schema: { $ref: '#/components/schemas/ReplicationCollection' } }],
  requestBody: jsonBody({ $ref: '#/components/schemas/PullRequest' }),
  responses: jsonResp(200, { $ref: '#/components/schemas/PullResponse' }),
}));
add('/replication/pull', 'post', op('Pull multiple collections', {
  tags: ['Replication'], operationId: 'pullAllCollections', security: session,
  requestBody: jsonBody({
    type: 'object',
    properties: {
      checkpoints: { type: 'object', additionalProperties: { $ref: '#/components/schemas/Checkpoint' } },
      limit: { type: 'integer', minimum: 1, maximum: 2000 },
    },
  }),
  responses: jsonResp(200, {
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/PullResponse' },
  }),
}));
add('/replication/{collection}/push', 'post', op('Push one collection', {
  tags: ['Replication'], operationId: 'pushCollection', security: session,
  parameters: [{ name: 'collection', in: 'path', required: true, schema: { $ref: '#/components/schemas/ReplicationCollection' } }],
  requestBody: jsonBody({
    type: 'object',
    required: ['changeRows'],
    properties: {
      changeRows: { type: 'array', minItems: 1, maxItems: 2000, items: { $ref: '#/components/schemas/ChangeRow' } },
    },
  }),
  responses: jsonResp(200, {
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Conflict documents (empty if all accepted)',
  }),
}));

// Trash
add('/trash', 'get', op('List trash', {
  tags: ['Trash'], operationId: 'listTrash', security: session,
  responses: jsonResp(200, {
    type: 'object',
    properties: {
      songs: { type: 'array', items: { $ref: '#/components/schemas/Song' } },
      folders: { type: 'array', items: { $ref: '#/components/schemas/Folder' } },
      services: { type: 'array', items: { $ref: '#/components/schemas/Service' } },
    },
  }),
}));
for (const entity of ['songs', 'folders', 'services']) {
  const cap = entity[0].toUpperCase() + entity.slice(1, -1);
  add(`/trash/${entity}/{id}/restore`, 'post', op(`Restore trashed ${entity.slice(0, -1)}`, {
    tags: ['Trash'], operationId: `restoreTrash${cap}`, security: session,
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
    responses: jsonResp(200, { type: 'object', additionalProperties: true }),
  }));
}

// Backup
add('/backup', 'get', op('Export backup', {
  tags: ['Backup'], operationId: 'exportBackup', security: session,
  responses: jsonResp(200, { $ref: '#/components/schemas/BackupDocument' }),
}));
add('/backup/restore', 'post', op('Restore backup', {
  tags: ['Backup'], operationId: 'restoreBackup', security: session,
  requestBody: jsonBody({ $ref: '#/components/schemas/BackupDocument' }),
  responses: jsonResp(200, {
    type: 'object',
    properties: {
      message: { type: 'string' },
      counts: {
        type: 'object',
        properties: {
          folders: { type: 'integer' },
          songs: { type: 'integer' },
          services: { type: 'integer' },
          collections: { type: 'integer' },
          agendaEvents: { type: 'integer' },
        },
      },
    },
  }),
}));

// AI
add('/ai/settings', 'get', op('Get AI settings', {
  tags: ['AI'], operationId: 'getAiSettings', security: session,
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/settings', 'put', op('Update AI settings', {
  tags: ['AI'], operationId: 'updateAiSettings', security: session,
  requestBody: jsonBody({ type: 'object', additionalProperties: true }),
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/settings/key', 'delete', op('Clear AI API key', {
  tags: ['AI'], operationId: 'deleteAiSettingsKey', security: session,
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/billing', 'get', op('AI provider billing/balance', {
  tags: ['AI'], operationId: 'getAiBilling', security: session,
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/memory', 'get', op('List AI memory', {
  tags: ['AI'], operationId: 'listAiMemory', security: session,
  responses: jsonResp(200, {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            source: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }),
}));
add('/ai/memory', 'post', op('Add AI memory', {
  tags: ['AI'], operationId: 'createAiMemory', security: session,
  requestBody: jsonBody({ type: 'object', required: ['content'], properties: { content: { type: 'string' } } }),
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/memory', 'delete', op('Clear all AI memory', {
  tags: ['AI'], operationId: 'clearAiMemory', security: session,
  responses: jsonResp(200, { type: 'object', properties: { cleared: { type: 'integer' } } }),
}));
add('/ai/memory/{id}', 'delete', op('Delete AI memory item', {
  tags: ['AI'], operationId: 'deleteAiMemory', security: session,
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: { '204': { description: 'Deleted' } },
}));
add('/ai/confirm', 'post', op('Confirm staged AI destructive action', {
  tags: ['AI'], operationId: 'confirmAiAction', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['action', 'id'],
    properties: {
      action: { type: 'string', enum: ['delete_song', 'delete_service', 'delete_folder', 'delete_collection', 'delete_agenda'] },
      id: { type: 'string' },
      folderAction: { type: 'string', enum: ['move_to_root', 'delete_songs'] },
    },
  }),
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/ai/chat', 'post', op('AI chat stream (UI message stream)', {
  tags: ['AI'], operationId: 'aiChat', security: session,
  description: 'Returns an AI SDK UI message stream (not a single JSON body).',
  requestBody: jsonBody({
    type: 'object',
    required: ['messages'],
    properties: {
      messages: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: true } },
      context: { type: 'object', additionalProperties: true },
      locale: { type: 'string', enum: ['pt', 'en', 'es'] },
    },
  }),
  responses: {
    '200': { description: 'UI message stream', content: { 'text/plain': { schema: { type: 'string' } } } },
  },
}));

// YouTube / Cifra
add('/youtube/duration', 'get', op('YouTube duration', {
  tags: ['Integrations'], operationId: 'getYoutubeDuration', security: session,
  parameters: [{ name: 'url', in: 'query', required: true, schema: { type: 'string', minLength: 1 } }],
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));
add('/cifra', 'get', op('Import from Cifra Club / Ultimate Guitar', {
  tags: ['Integrations'], operationId: 'importCifra', security: session,
  parameters: [{ name: 'url', in: 'query', required: true, schema: { type: 'string', format: 'uri' } }],
  responses: jsonResp(200, { type: 'object', additionalProperties: true }),
}));

// Notifications
add('/notifications', 'post', op('Send notification', {
  tags: ['Notifications'], operationId: 'sendNotification', security: session,
  requestBody: jsonBody({
    type: 'object',
    required: ['type', 'title'],
    properties: {
      userId: { type: 'string' },
      organizationId: { type: 'string' },
      roles: { type: 'array', items: { type: 'string' } },
      type: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      href: { type: 'string' },
      channel: { type: 'string', enum: ['inbox', 'push', 'both'], default: 'inbox' },
      fcm: { type: 'object', additionalProperties: true },
    },
  }),
  responses: jsonResp(201, { type: 'object', additionalProperties: true }),
}));

const doc = {
  openapi: '3.1.0',
  info: {
    title: 'Hosanna API',
    version: '2.22.2',
    description:
      'Production REST API for Hosanna Studio and the Flutter musician app. ' +
      'Authentication is Better Auth (session cookie or Bearer). ' +
      '`/api/auth/*` is owned by Better Auth and is not expanded here. ' +
      'MCP lives at `/mcp` (outside this document).',
    license: { name: 'Apache-2.0' },
  },
  servers: [
    { url: 'https://api.hosanna.live/api', description: 'Production' },
    { url: 'http://localhost:3000/api', description: 'Local' },
  ],
  tags: [
    { name: 'Health' }, { name: 'Billing' }, { name: 'Cron' },
    { name: 'Songs' }, { name: 'Folders' }, { name: 'Services' },
    { name: 'ServiceNotes' }, { name: 'Annotations' }, { name: 'Replication' },
    { name: 'Trash' }, { name: 'Backup' }, { name: 'AI' },
    { name: 'Integrations' }, { name: 'Notifications' },
  ],
  paths,
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'hosanna.session_token',
        description: 'Better Auth session cookie (actual cookie name may vary by Better Auth version/prefix).',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Better Auth session token (Authorization: Bearer).',
      },
      cronSecret: {
        type: 'http',
        scheme: 'bearer',
        description: 'CRON_SECRET for /api/cron/*',
      },
    },
    schemas,
  },
};

fs.writeFileSync('openapi/openapi.yaml', stringify(doc, { lineWidth: 0 }));
console.log('Wrote openapi/openapi.yaml paths=', Object.keys(paths).length);
