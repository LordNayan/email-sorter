import { vi } from 'vitest';

export function mockPrisma(prismaOverrides = {}) {
  const base = {
    connectedAccount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    email: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    unsubscribeAttempt: {
      create: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return Object.assign(base, prismaOverrides);
}
