import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createApp, attachErrorHandlers } from './app';
import { config } from './config';
import request from 'supertest';

describe('Song Operations', () => {
  let app: any;
  const token = config.syncApiToken;

  beforeAll(async () => {
    app = createApp();
    attachErrorHandlers(app);
    await fs.mkdir(config.songsDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(path.join(config.songsDir, 'test-ops'), { recursive: true, force: true }).catch(() => {});
  });

  it('should create an empty song with metadata', async () => {
    const res = await request(app)
      .post('/api/create_empty')
      .set('Authorization', `Bearer ${token}`)
      .send({ path: 'test-ops/new-song.pro', title: 'My New Song' });

    expect(res.status).toBe(200);
    const content = await fs.readFile(path.join(config.songsDir, 'test-ops/new-song.pro'), 'utf-8');
    expect(content).toContain('{title: My New Song}');
  });

  it('should list songs with metadata', async () => {
    const res = await request(app)
      .get('/api/songs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const song = res.body.files.find((f: any) => f.path === 'test-ops/new-song.pro');
    expect(song).toBeDefined();
    expect(song.metadata.title).toBe('My New Song');
  });

  it('should return a library tree', async () => {
    const res = await request(app)
      .get('/api/tree')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tree).toBeDefined();
    const opsFolder = res.body.tree.find((n: any) => n.name === 'test-ops');
    expect(opsFolder.type).toBe('folder');
    expect(opsFolder.children.some((c: any) => c.name === 'new-song.pro')).toBe(true);
  });

  it('should search songs by title', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ title: 'New Song' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].metadata.title).toBe('My New Song');
  });

  it('should search songs by query (lyrics/content)', async () => {
    await fs.writeFile(path.join(config.songsDir, 'test-ops/searchable.pro'), '{title: Searchable}\nAmazing Grace');
    const res = await request(app)
      .get('/api/search')
      .query({ query: 'Grace' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.path === 'test-ops/searchable.pro')).toBe(true);
  });

  it('should download a song', async () => {
    const res = await request(app)
      .get('/api/download')
      .query({ path: 'test-ops/new-song.pro' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('{title: My New Song}');
    expect(res.header['content-disposition']).toContain('new-song.pro');
  });

  it('should upload a song', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', 'test-ops/uploads')
      .attach('files', Buffer.from('{title: Uploaded}'), 'uploaded.pro');

    expect(res.status).toBe(200);
    const content = await fs.readFile(path.join(config.songsDir, 'test-ops/uploads/uploaded.pro'), 'utf-8');
    expect(content).toBe('{title: Uploaded}');
  });
});
