import { processSyncJob } from '../processors/sync.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock external modules
vi.mock('@email-sorter/gmail', () => ({
  createOAuth2Client: vi.fn(() => ({ setCredentials: vi.fn() })),
  listMessages: vi.fn(() => ({ messages: [{ id: 'm1' }] })),
  getMessage: vi.fn(() => ({ raw: 'RAW', payload: {} })),
  parseMessage: vi.fn(() => ({
    subject: 'Test Subject',
    from: 'sender@example.com',
    text: 'Body text',
    html: '<p>Body</p>',
    snippet: 'Snippet',
    threadId: 't1',
    date: new Date().toISOString(),
  })),
  extractUnsubscribeInfo: vi.fn(() => ({ url: 'http://unsubscribe', mailto: null })),
  archiveMessage: vi.fn(() => Promise.resolve()),
  listHistory: vi.fn(() => ({ history: [], historyId: null, needsFullSync: false })),
}));

vi.mock('@email-sorter/ai', () => ({
  classifyEmail: vi.fn(() => ({ categoryName: 'General' })),
  analyzeEmail: vi.fn(() => ({ summary: 'Summary', unsubscribeUrl: null, unsubscribeMailto: null })),
}));

vi.mock('@email-sorter/core', () => ({
  decryptToken: vi.fn(() => 'decrypted-token'),
}));

// Mock PrismaClient inside processor file scope
const mockAccount = {
  id: 'acc1',
  userId: 'user1',
  accessTokenEnc: 'enc1',
  refreshTokenEnc: 'enc2',
  historyId: null,
  user: { categories: [{ id: 'cat1', name: 'General' }] },
};

// Patch global prisma used inside processor
import * as syncModule from '../processors/sync.js';

describe('processSyncJob', () => {
  beforeEach(() => {
    // Override prisma instance methods
    syncModule.prisma.connectedAccount.findUnique = vi.fn(() => mockAccount);
    syncModule.prisma.email.findUnique = vi.fn(() => null);
    syncModule.prisma.email.create = vi.fn(() => Promise.resolve());
    syncModule.prisma.connectedAccount.update = vi.fn(() => Promise.resolve());
  });

  it('processes a sync job and stores email', async () => {
    await processSyncJob({ data: { accountId: 'acc1', fullSync: true } });
    expect(syncModule.prisma.email.create).toHaveBeenCalled();
  });

  it('skips already processed messages', async () => {
    syncModule.prisma.email.findUnique = vi.fn(() => ({ id: 'existing' }));
    await processSyncJob({ data: { accountId: 'acc1', fullSync: true } });
    expect(syncModule.prisma.email.create).not.toHaveBeenCalled();
  });
});
