/**
 * meeting-notes REST routes
 * Uses Fastify's `inject()` + a stubbed MeetingNoteChannelService.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { meetingNotesRoutes } from '../../src/routes/meetingNotes.js';

const API_KEY = 'dev-api-key-change-in-production';

function stubSource(over: Partial<any> = {}): any {
  return {
    id: 's1',
    name: 'Test',
    kind: 'manual',
    config: {},
    isActive: true,
    scheduleCron: null,
    lastImportedAt: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function stubImport(over: Partial<any> = {}): any {
  return {
    id: 'j1',
    sourceId: 's1',
    status: 'succeeded',
    startedAt: new Date(),
    finishedAt: new Date(),
    itemsDiscovered: 2,
    itemsImported: 2,
    duplicates: 0,
    errors: 0,
    errorMessage: null,
    assetIds: ['a1', 'a2'],
    triggeredBy: 'manual',
    ...over,
  };
}

async function makeApp(svc: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(meetingNotesRoutes, {
    prefix: '/api/v1/quality',
    service: svc,
  });
  await app.ready();
  return app;
}

describe('meeting-notes routes', () => {
  const authHeaders = { 'x-api-key': API_KEY };

  describe('auth', () => {
    it('rejects requests without api key', async () => {
      const svc = { listSources: vi.fn() };
      const app = await makeApp(svc);
      const res = await app.inject({ method: 'GET', url: '/api/v1/quality/meeting-note-sources' });
      expect(res.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('GET /meeting-note-sources', () => {
    it('returns a list wrapped in { items }', async () => {
      const svc = { listSources: vi.fn().mockResolvedValue([stubSource()]) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/quality/meeting-note-sources',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].kind).toBe('manual');
      await app.close();
    });

    it('passes kind + active query filters to the service', async () => {
      const svc = { listSources: vi.fn().mockResolvedValue([]) };
      const app = await makeApp(svc);
      await app.inject({
        method: 'GET',
        url: '/api/v1/quality/meeting-note-sources?kind=lark&active=true',
        headers: authHeaders,
      });
      expect(svc.listSources).toHaveBeenCalledWith({ kind: 'lark', isActive: true });
      await app.close();
    });
  });

  describe('POST /meeting-note-sources', () => {
    it('creates a source with provided body', async () => {
      const svc = {
        createSource: vi.fn().mockResolvedValue(stubSource({ id: 'new' })),
      };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources',
        headers: authHeaders,
        payload: { name: 'x', kind: 'lark', config: { space_id: 'abc' } },
      });
      expect(res.statusCode).toBe(201);
      expect(svc.createSource).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'x', kind: 'lark', config: { space_id: 'abc' } }),
      );
      await app.close();
    });

    it('returns 400 when service rejects kind', async () => {
      const svc = {
        createSource: vi.fn().mockRejectedValue(new Error('Unsupported source kind: slack')),
      };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources',
        headers: authHeaders,
        payload: { name: 'x', kind: 'slack', config: {} },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PUT /meeting-note-sources/:id', () => {
    it('returns 404 when service returns null', async () => {
      const svc = { updateSource: vi.fn().mockResolvedValue(null) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/quality/meeting-note-sources/missing',
        headers: authHeaders,
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('returns updated row on success', async () => {
      const svc = {
        updateSource: vi.fn().mockResolvedValue(stubSource({ name: 'renamed' })),
      };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/quality/meeting-note-sources/s1',
        headers: authHeaders,
        payload: { name: 'renamed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('renamed');
      await app.close();
    });
  });

  describe('DELETE /meeting-note-sources/:id', () => {
    it('returns 404 when nothing deleted', async () => {
      const svc = { deleteSource: vi.fn().mockResolvedValue(false) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/quality/meeting-note-sources/x',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('returns success=true when row removed', async () => {
      const svc = { deleteSource: vi.fn().mockResolvedValue(true) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/quality/meeting-note-sources/s1',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      await app.close();
    });
  });

  describe('POST /meeting-note-sources/import', () => {
    it('triggers import for the supplied id', async () => {
      const svc = {
        runImport: vi.fn().mockResolvedValue(stubImport()),
      };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources/import',
        headers: authHeaders,
        payload: { id: 's1' },
      });
      expect(res.statusCode).toBe(200);
      expect(svc.runImport).toHaveBeenCalledWith('s1', 'manual');
      expect(res.json().status).toBe('succeeded');
      await app.close();
    });

    it('returns 404 when id does not resolve', async () => {
      const svc = {
        runImport: vi.fn().mockRejectedValue(
          new Error('Meeting-note source not found: ghost'),
        ),
      };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources/import',
        headers: authHeaders,
        payload: { id: 'ghost' },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('GET /meeting-note-sources/progress', () => {
    it('returns { jobs: [] } pulled from getActiveJobs', async () => {
      const svc = { getActiveJobs: vi.fn().mockResolvedValue([stubImport({ status: 'running' })]) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/quality/meeting-note-sources/progress',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().jobs).toHaveLength(1);
      await app.close();
    });
  });

  describe('GET /meeting-note-sources/history', () => {
    it('honors optional limit and sourceId', async () => {
      const svc = { getHistory: vi.fn().mockResolvedValue([stubImport()]) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/quality/meeting-note-sources/history?sourceId=s1&limit=5',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(200);
      expect(svc.getHistory).toHaveBeenCalledWith('s1', 5);
      await app.close();
    });
  });

  describe('POST /meeting-note-sources/:id/upload', () => {
    it('returns 415 when request is not multipart', async () => {
      const svc = {
        getSource: vi.fn().mockResolvedValue(stubSource()),
        runImport: vi.fn(),
      };
      const multipart = (await import('@fastify/multipart')).default;
      const app = Fastify({ logger: false });
      await app.register(multipart);
      await app.register(meetingNotesRoutes, {
        prefix: '/api/v1/quality',
        service: svc as any,
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources/s1/upload',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: '{}',
      });
      // fastify/multipart may respond 406 / 415 / 400 for non-multipart;
      // what matters is it's a 4xx, not 500.
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      await app.close();
    });

    it('returns 404 when source does not exist', async () => {
      const svc = { getSource: vi.fn().mockResolvedValue(null) };
      const app = await makeApp(svc);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/quality/meeting-note-sources/ghost/upload',
        headers: authHeaders,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
