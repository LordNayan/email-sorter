import { Queue } from 'bullmq';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const syncQueue = new Queue('email-sync', {
  connection: redisConnection,
});

export const unsubscribeQueue = new Queue('unsubscribe', {
  connection: redisConnection,
});

/**
 * Add sync job for an account
 */
export async function enqueueSyncJob(accountId, options = {}) {
  return syncQueue.add(
    'sync-account',
    { accountId, ...options },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    }
  );
}

/**
 * Add unsubscribe job for an email
 */
export async function enqueueUnsubscribeJob(emailId) {
  return unsubscribeQueue.add(
    'unsubscribe-email',
    { emailId },
    {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );
}
