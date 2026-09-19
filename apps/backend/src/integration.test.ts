import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { INestApplication } from '@nestjs/common';
import RedisMock from 'ioredis-mock';
import Redis from 'ioredis';
import request from 'supertest';
import JSZip from 'jszip';
import { randomBytes } from 'node:crypto';
import { AppModule, configureApp } from './app';
import { Security } from './security';
import { Database } from './database';
import { getConfig } from './config';
// Runs only against an explicitly supplied isolated test database; never clears existing data.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'HTTP integration: PostgreSQL + in-memory Redis substitute',
  () => {
    let app: INestApplication;
    let db: Database;
    let owner: ReturnType<typeof request.agent>;
    let outsider: ReturnType<typeof request.agent>;
    let teammate: ReturnType<typeof request.agent>;
    let candidateId: number;
    let vacancyId: number;
    let applicationId: number;
    let companyId: number;
    let foreignCandidateId: number;
    let inviteToken: string;
    const suffix = randomBytes(6).toString('hex');
    const testPassword = randomBytes(20).toString('hex');
    const header = { 'X-Requested-With': 'recruiter-web' };
    const vacancy = {
      title: 'Backend engineer',
      description: 'Build secure APIs for customers.',
      requirements: [{ name: 'NestJS', required: true }],
    };
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.JWT_SECRET = randomBytes(48).toString('hex');
      process.env.REDIS_URL = 'redis://127.0.0.1:6379';
      process.env.NODE_ENV = 'test';
      process.env.GEMINI_API_KEY = '';
      const config = getConfig();
      const security = Object.create(Security.prototype) as Security;
      const redis = process.env.TEST_REDIS_URL
        ? new Redis(process.env.TEST_REDIS_URL, {
            keyPrefix: `integration:${suffix}:`,
            maxRetriesPerRequest: 1,
          })
        : new RedisMock();
      Object.assign(security, {
        config,
        redis,
        jwt: new JwtService({
          secret: config.JWT_SECRET,
          signOptions: { expiresIn: '8h', issuer: 'recruiter', audience: 'recruiter-web' },
        }),
      });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(Security)
        .useValue(security)
        .compile();
      app = configureApp(module.createNestApplication(new ExpressAdapter(), { bodyParser: false }));
      await app.init();
      db = app.get(Database);
      owner = request.agent(app.getHttpServer());
      outsider = request.agent(app.getHttpServer());
      teammate = request.agent(app.getHttpServer());
    }, 30000);
    afterAll(async () => {
      if (app) await app.close();
    });
    it('returns an anonymous session while keeping protected endpoints private', async () => {
      const anonymous = await request(app.getHttpServer()).get('/api/auth/session');
      expect(anonymous.status).toBe(200);
      expect(anonymous.body).toEqual({ user: null });
      const expired = await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Cookie', 'session=invalid');
      expect(expired.status).toBe(200);
      expect(expired.body).toEqual({ user: null });
      expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
    });
    it('does not create a company when Redis sessions are unavailable', async () => {
      const security = app.get(Security);
      const before = await db.company.count();
      const failure = vi
        .spyOn(security.redis, 'eval')
        .mockRejectedValueOnce(new Error('Redis disconnected'));
      try {
        const res = await request(app.getHttpServer())
          .post('/api/auth/register')
          .set(header)
          .send({
            companyName: 'Unavailable',
            fullName: 'Test',
            email: `outage-${suffix}@example.com`,
            password: testPassword,
          });
        expect(res.status).toBe(503);
        expect(res.body.message).toContain('Redis');
        expect(await db.company.count()).toBe(before);
      } finally {
        failure.mockRestore();
      }
    });
    it('registers company administrator with a secure cookie and no password response', async () => {
      const res = await owner
        .post('/api/auth/register')
        .set(header)
        .send({
          companyName: `Test ${suffix}`,
          fullName: 'Test Owner',
          email: `owner-${suffix}@example.com`,
          password: testPassword,
        });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe('ADMIN');
      expect(res.body.password).toBeUndefined();
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
      companyId = res.body.companyId;
      const session = await owner.get('/api/auth/session');
      expect(session.status).toBe(200);
      expect(session.body.user.companyId).toBe(companyId);
      expect(session.body.user.password).toBeUndefined();
      const other = await outsider
        .post('/api/auth/register')
        .set(header)
        .send({
          companyName: `Other ${suffix}`,
          fullName: 'Other Owner',
          email: `other-${suffix}@example.com`,
          password: testPassword,
        });
      expect(other.status).toBe(201);
    });
    it('blocks unauthenticated access, missing CSRF headers, and hostile origins', async () => {
      expect((await request(app.getHttpServer()).get('/api/candidates')).status).toBe(401);
      expect((await owner.post('/api/candidates').send({ fullName: 'A' })).status).toBe(403);
      expect(
        (
          await owner
            .post('/api/candidates')
            .set(header)
            .set('Origin', 'https://hostile.example')
            .send({ fullName: 'A' })
        ).status,
      ).toBe(403);
    });
    it('creates and updates a tenant-owned vacancy and candidate', async () => {
      const v = await owner.post('/api/vacancies').set(header).send(vacancy);
      expect(v.status).toBe(201);
      vacancyId = v.body.id;
      expect(v.body.requirements).toHaveLength(1);
      const c = await owner
        .post('/api/candidates')
        .set(header)
        .send({ fullName: 'Ada Test', email: 'ada@example.com' });
      expect(c.status).toBe(201);
      candidateId = c.body.id;
      const foreign = await outsider
        .post('/api/candidates')
        .set(header)
        .send({ fullName: 'Foreign Test' });
      foreignCandidateId = foreign.body.id;
      const edit = await owner
        .put(`/api/candidates/${candidateId}`)
        .set(header)
        .send({ fullName: 'Ada Test Updated', email: 'ada@example.com' });
      expect(edit.status).toBe(200);
      const list = await owner.get('/api/candidates');
      expect(list.body.items.map((x: { id: number }) => x.id)).toContain(candidateId);
      expect(list.body.items.map((x: { id: number }) => x.id)).not.toContain(foreignCandidateId);
    });
    it('rejects cross-tenant reads, edits, deletes, and application links', async () => {
      for (const route of [
        `/api/candidates/${candidateId}`,
        `/api/vacancies/${vacancyId}`,
        `/api/candidates/${candidateId}/resume`,
      ])
        expect((await outsider.get(route)).status).toBe(404);
      expect(
        (
          await outsider
            .put(`/api/candidates/${candidateId}`)
            .set(header)
            .send({ fullName: 'Stolen' })
        ).status,
      ).toBe(404);
      expect((await outsider.delete(`/api/vacancies/${vacancyId}`).set(header)).status).toBe(404);
      expect(
        (
          await owner
            .post('/api/applications')
            .set(header)
            .send({ vacancyId, candidateId: foreignCandidateId })
        ).status,
      ).toBe(404);
      await expect(
        db.application.create({ data: { companyId, vacancyId, candidateId: foreignCandidateId } }),
      ).rejects.toThrow();
    });
    it('rejects tenant injection and malformed data', async () => {
      expect(
        (
          await owner
            .post('/api/candidates')
            .set(header)
            .set('Content-Type', 'application/json')
            .send('{bad json')
        ).status,
      ).toBe(400);
      expect(
        (
          await owner
            .post('/api/candidates')
            .set(header)
            .send({ fullName: 'A'.repeat(140000) })
        ).status,
      ).toBe(413);
      expect(
        (
          await owner
            .post('/api/candidates')
            .set(header)
            .send({ fullName: 'Wrong', companyId: 999 })
        ).status,
      ).toBe(400);
      expect((await owner.get('/api/candidates?page=-1')).status).toBe(400);
      expect((await owner.post('/api/vacancies').set(header).send({ title: '' })).status).toBe(400);
    });
    it('uploads DOCX, extracts text, and serves protected downloads', async () => {
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ada built REST APIs using NestJS and PostgreSQL for three years.</w:t></w:r></w:p></w:body></w:document>',
      );
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const res = await owner
        .post(`/api/candidates/${candidateId}/resume`)
        .set(header)
        .attach('file', buffer, 'resume.docx');
      expect(res.status).toBe(201);
      expect(res.body.resumeText).toContain('NestJS');
      expect(res.body.resumeData).toBeUndefined();
      const download = await owner.get(`/api/candidates/${candidateId}/resume`);
      expect(download.status).toBe(200);
      expect(download.headers['content-disposition']).toContain('attachment');
      expect(
        (
          await outsider
            .post(`/api/candidates/${candidateId}/resume`)
            .set(header)
            .attach('file', buffer, 'resume.docx')
        ).status,
      ).toBe(404);
    });
    it('rejects spoofed and oversized uploads', async () => {
      expect(
        (
          await owner
            .post(`/api/candidates/${candidateId}/resume`)
            .set(header)
            .attach('file', Buffer.from('not really a PDF'), 'resume.pdf')
        ).status,
      ).toBe(400);
      expect(
        (
          await owner
            .post(`/api/candidates/${candidateId}/resume`)
            .set(header)
            .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'resume.pdf')
        ).status,
      ).toBe(413);
    });
    it('creates applications without automatic decisions and prevents duplicates', async () => {
      const res = await owner
        .post('/api/applications')
        .set(header)
        .send({ candidateId, vacancyId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('NEW');
      applicationId = res.body.id;
      const detail = await owner.get(`/api/applications/${applicationId}`);
      expect(detail.body.stageHistory).toHaveLength(1);
      expect(detail.body.stageHistory[0]).toMatchObject({ fromStatus: null, toStatus: 'NEW' });
      expect(
        (await owner.post('/api/applications').set(header).send({ candidateId, vacancyId })).status,
      ).toBe(409);
      expect((await outsider.get(`/api/applications/${applicationId}`)).status).toBe(404);
      expect(
        (
          await outsider
            .put(`/api/applications/${applicationId}/status`)
            .set(header)
            .send({ status: 'HIRED' })
        ).status,
      ).toBe(404);
    });
    it('requires AI consent and reports missing key without changing the pipeline', async () => {
      expect(
        (await owner.post(`/api/candidates/${candidateId}/parse`).set(header).send({})).status,
      ).toBe(400);
      for (const route of [
        `/api/candidates/${candidateId}/parse`,
        `/api/applications/${applicationId}/analyze`,
        `/api/applications/${applicationId}/questions`,
      ]) {
        const result = await owner.post(route).set(header).send({ consent: true });
        expect(result.status).toBe(503);
        expect(result.body.message).toContain('GEMINI_API_KEY');
      }
      expect((await owner.get(`/api/applications/${applicationId}`)).body.status).toBe('NEW');
    });
    it('allows all six human-controlled pipeline stages', async () => {
      for (const status of ['REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'NEW']) {
        const res = await owner
          .put(`/api/applications/${applicationId}/status`)
          .set(header)
          .send({ status });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }
    });
    it('protects and validates vacancy generation without saving a vacancy', async () => {
      const route = '/api/vacancies/generate-description';
      const brief = { brief: 'Middle NestJS developer kerak', language: 'uz' };
      const before = await db.vacancy.count({ where: { companyId } });
      expect((await request(app.getHttpServer()).post(route).set(header).send(brief)).status).toBe(
        401,
      );
      for (const invalid of [
        { brief: ' ' },
        { ...brief, language: 'invalid' },
        { ...brief, companyId: 99 },
        { brief: 'x'.repeat(3001) },
      ])
        expect((await owner.post(route).set(header).send(invalid)).status).toBe(400);
      const result = await owner.post(route).set(header).send(brief);
      expect(result.status).toBe(503);
      expect(result.body.message).toContain('GEMINI_API_KEY');
      expect(await db.vacancy.count({ where: { companyId } })).toBe(before);
    });
    it('clears stale analysis when a vacancy changes', async () => {
      await db.application.update({
        where: { id: applicationId },
        data: { analysis: { requirements: [] }, interviewQuestions: { questions: [] } },
      });
      expect(
        (
          await owner
            .put(`/api/vacancies/${vacancyId}`)
            .set(header)
            .send({ ...vacancy, title: 'Updated engineer' })
        ).status,
      ).toBe(200);
      const res = await owner.get(`/api/applications/${applicationId}`);
      expect(res.body.analysis).toBeNull();
      expect(res.body.interviewQuestions).toBeNull();
    });
    it('records stage history and rejects stale or duplicate transitions', async () => {
      const route = `/api/applications/${applicationId}/status`;
      const before = (await owner.get(`/api/applications/${applicationId}`)).body;
      const results = await Promise.all(
        ['REVIEWING', 'INTERVIEW'].map((status) =>
          owner.put(route).set(header).send({ status, expectedStatus: 'NEW' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const detail = (await owner.get(`/api/applications/${applicationId}`)).body;
      expect(detail.stageHistory).toHaveLength(before.stageHistory.length + 1);
      expect(detail.stageHistory[0]).toMatchObject({ fromStatus: 'NEW', toStatus: detail.status });
      expect(detail.stageHistory[0].actorName).toBeTruthy();
      expect((await owner.put(route).set(header).send({ status: detail.status })).status).toBe(200);
      expect(
        (await owner.get(`/api/applications/${applicationId}`)).body.stageHistory,
      ).toHaveLength(detail.stageHistory.length);
    });
    it('saves interview answers with revision protection and tenant isolation', async () => {
      const route = `/api/applications/${applicationId}/interview-review`;
      const draft = {
        revision: 0,
        notes: 'Follow up on API testing.',
        answers: [
          {
            question: 'Describe your API.',
            answer: 'Used NestJS.',
            notes: 'Ask about validation.',
          },
        ],
      };
      expect((await outsider.put(route).set(header).send(draft)).status).toBe(404);
      expect(
        (
          await owner
            .put(route)
            .set(header)
            .send({ ...draft, updatedBy: 'Forged' })
        ).status,
      ).toBe(400);
      const saved = await owner.put(route).set(header).send(draft);
      expect(saved.status).toBe(200);
      expect(saved.body.reviewRevision).toBe(1);
      expect(saved.body.interviewReview.answers).toEqual(draft.answers);
      expect(saved.body.interviewReview.updatedBy).toBeTruthy();
      expect(
        (
          await owner
            .put(route)
            .set(header)
            .send({ ...draft, notes: 'Stale overwrite' })
        ).status,
      ).toBe(409);
      await owner
        .put(`/api/vacancies/${vacancyId}`)
        .set(header)
        .send({ ...vacancy, title: 'Updated again' });
      const detail = (await owner.get(`/api/applications/${applicationId}`)).body;
      expect(detail.interviewReview.notes).toBe(draft.notes);
      expect(detail.interviewReview.answers).toEqual(draft.answers);
    });
    it('creates one-time invitation and grants only its designated company and role', async () => {
      const invite = await owner
        .post('/api/auth/invitations')
        .set(header)
        .send({ email: `hr-${suffix}@example.com`, role: 'HR' });
      expect(invite.status).toBe(201);
      inviteToken = new URL(invite.body.inviteUrl).searchParams.get('invite')!;
      const accept = await teammate
        .post('/api/auth/accept-invitation')
        .set(header)
        .send({ token: inviteToken, fullName: 'HR Teammate', password: testPassword });
      expect(accept.status).toBe(201);
      expect(accept.body.companyId).toBe(companyId);
      expect(accept.body.role).toBe('HR');
      expect(
        (
          await teammate
            .post('/api/auth/invitations')
            .set(header)
            .send({ email: 'x@example.com', role: 'HR' })
        ).status,
      ).toBe(403);
      expect((await teammate.get('/api/auth/team')).status).toBe(403);
      expect(
        (
          await teammate
            .post('/api/auth/accept-invitation')
            .set(header)
            .send({ token: inviteToken, fullName: 'Duplicate', password: testPassword })
        ).status,
      ).toBe(401);
    });
    it('revokes sessions on logout and supports logging back in', async () => {
      const logged = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set(header)
        .send({ email: `owner-${suffix}@example.com`, password: testPassword });
      expect(logged.status).toBe(201);
      const cookie = logged.headers['set-cookie'][0].split(';')[0];
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/auth/logout')
            .set(header)
            .set('Cookie', cookie)
            .send({})
        ).status,
      ).toBe(201);
      expect(
        (await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie)).status,
      ).toBe(401);
    });
    it('returns healthy service state and accurate dashboard counts', async () => {
      expect((await owner.get('/api/health')).status).toBe(200);
      const res = await owner.get('/api/dashboard');
      expect(res.body.candidates).toBe(1);
      expect(res.body.applications).toBe(1);
    });
    it('deletes only owned records and cascades their applications', async () => {
      expect((await owner.delete(`/api/candidates/${candidateId}`).set(header)).status).toBe(200);
      expect((await owner.get(`/api/applications/${applicationId}`)).status).toBe(404);
      expect((await outsider.get(`/api/candidates/${foreignCandidateId}`)).status).toBe(200);
      expect((await owner.delete(`/api/vacancies/${vacancyId}`).set(header)).status).toBe(200);
    });
  },
);
