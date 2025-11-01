import { processUnsubscribeJob } from '../processors/unsubscribe.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Playwright chromium
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => ({
        newPage: vi.fn(async () => ({
          setDefaultTimeout: vi.fn(),
          setDefaultNavigationTimeout: vi.fn(),
          goto: vi.fn(async () => {}),
          waitForTimeout: vi.fn(async () => {}),
          textContent: vi.fn(async () => 'successfully unsubscribed'),
          locator: vi.fn(() => ({
            all: vi.fn(() => []),
            first: vi.fn(() => ({ isVisible: vi.fn(async () => false) })),
            nth: vi.fn(() => ({ isVisible: vi.fn(async () => false) })),
          })),
          evaluate: vi.fn(async () => {}),
          screenshot: vi.fn(async () => {}),
          on: vi.fn(),
        }))
      }))
    }))
  }
}));

vi.mock('@email-sorter/core', () => ({ decryptToken: vi.fn(() => 'token') }));
vi.mock('@email-sorter/gmail', () => ({
  createOAuth2Client: vi.fn(() => ({ setCredentials: vi.fn() })),
  createRawMessage: vi.fn(() => 'RAW'),
  sendMessage: vi.fn(async () => {})
}));

import * as unsubModule from '../processors/unsubscribe.js';

describe('processUnsubscribeJob', () => {
  beforeEach(() => {
    unsubModule.prisma.email.findUnique = vi.fn(() => ({
      id: 'e1',
      unsubscribeMailto: 'list@example.com',
      unsubscribeUrl: null,
      from: 'user@example.com',
      account: { accessTokenEnc: 'enc', refreshTokenEnc: 'enc2' }
    }));
    unsubModule.prisma.unsubscribeAttempt.create = vi.fn(() => Promise.resolve());
  });

  it('sends mailto unsubscribe email', async () => {
    await processUnsubscribeJob({ data: { emailId: 'e1' } });
    expect(unsubModule.prisma.unsubscribeAttempt.create).toHaveBeenCalled();
    const attempt = unsubModule.prisma.unsubscribeAttempt.create.mock.calls[0][0].data;
    expect(attempt.status).toBe('success');
    expect(attempt.method).toBe('mailto');
  });

  it('handles missing email gracefully', async () => {
    unsubModule.prisma.email.findUnique = vi.fn(() => null);
    await expect(processUnsubscribeJob({ data: { emailId: 'missing' } })).rejects.toThrow();
  });
});
