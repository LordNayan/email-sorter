import 'dotenv/config';
import { PrismaClient } from '@email-sorter/db';
import { syncWorker } from './processors/sync.js';
import { unsubscribeWorker } from './processors/unsubscribe.js';
import { enqueueSyncJob } from './queues.js';

const prisma = new PrismaClient();

console.log('Worker started');

// Schedule periodic sync (every 2 minutes)
async function scheduleSyncs() {
  const accounts = await prisma.connectedAccount.findMany();
  
  for (const account of accounts) {
    try {
      await enqueueSyncJob(account.id);
      console.log(`Scheduled sync for account ${account.email}`);
    } catch (error) {
      console.error(`Error scheduling sync for ${account.email}:`, error);
    }
  }
}

// Initial sync
scheduleSyncs();

// Schedule every 2 minutes
setInterval(scheduleSyncs, 2 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down workers...');
  await syncWorker.close();
  await unsubscribeWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await syncWorker.close();
  await unsubscribeWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
