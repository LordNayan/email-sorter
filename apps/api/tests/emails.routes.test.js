import request from 'supertest';
import { vi, describe, it, beforeEach, expect, beforeAll } from 'vitest';
import express from 'express';

// Mocks first (Prisma & BullMQ)
const prismaMock = { email: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() } };
vi.mock('@email-sorter/db', () => ({ PrismaClient: vi.fn(() => prismaMock) }));
const mockQueueAdd = vi.fn(async () => ({ id: 'job1' }));
vi.mock('bullmq', () => ({ Queue: vi.fn(() => ({ add: mockQueueAdd })) }));

let app;
beforeAll(async () => {
  // Build lightweight app for isolated testing
  app = express();
  app.use(express.json());
  // Fake session object
  app.use((req, _res, next) => { req.session = { userId: 'user-test' }; next(); });
  const { createEmailsRouter } = await import('../routes/emails.js');
  app.use('/emails', createEmailsRouter({ prisma: prismaMock, queue: { add: mockQueueAdd } }));
});

// Helper (not used now but kept)
function authSession(agent) { agent.set('Cookie', 'connect.sid=faketest'); }

const sampleEmails = [
  {
    id: 'e1', subject: 'Subj1', from: 'a@b.com', receivedAt: new Date(), snippet: 's', aiSummary: 'summary',
    unsubscribeUrl: 'http://u', unsubscribeMailto: null, categoryId: null, gmailId: 'g1', accountId: 'acc1'
  },
  {
    id: 'e2', subject: 'Subj2', from: 'c@d.com', receivedAt: new Date(), snippet: 's2', aiSummary: 'summary2',
    unsubscribeUrl: null, unsubscribeMailto: 'list@example.com', categoryId: null, gmailId: 'g2', accountId: 'acc1'
  }
];

describe('Emails API', () => {
  beforeEach(() => {
    prismaMock.email.findMany.mockReset();
    prismaMock.email.findFirst = vi.fn();
    prismaMock.email.deleteMany.mockReset();
  });

  it('lists emails', async () => {
    prismaMock.email.findMany.mockResolvedValue(sampleEmails);
    const res = await request(app).get('/emails');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('bulk deletes emails', async () => {
    prismaMock.email.deleteMany.mockResolvedValue({ count: 2 });
    const res = await request(app)
      .post('/emails/bulk/delete')
      .send({ ids: ['e1', 'e2'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.email.deleteMany).toHaveBeenCalled();
  });

  it('bulk unsubscribe queues jobs', async () => {
    prismaMock.email.findMany.mockResolvedValue(sampleEmails);
    const res = await request(app)
      .post('/emails/bulk/unsubscribe')
      .send({ ids: ['e1', 'e2'] });
    expect(res.status).toBe(200);
    expect(res.body.queued).toBe(2);
  });

  it('returns 400 for invalid delete ids', async () => {
    const res = await request(app)
      .post('/emails/bulk/delete')
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });
});
