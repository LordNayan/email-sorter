import { Worker } from 'bullmq';
import { PrismaClient } from '@email-sorter/db';
import { chromium } from 'playwright';
import { createOAuth2Client, createRawMessage, sendMessage } from '@email-sorter/gmail';
import { decryptToken } from '@email-sorter/core';

const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

/**
 * Process unsubscribe job
 */
async function processUnsubscribeJob(job) {
  const { emailId } = job.data;

  console.log(`Processing unsubscribe for email ${emailId}`);

  // Get email with account
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: {
      account: true,
    },
  });

  if (!email) {
    throw new Error(`Email ${emailId} not found`);
  }

  let method = null;
  let status = 'failed';
  let notes = '';

  // Try mailto first
  if (email.unsubscribeMailto) {
    method = 'mailto';
    try {
      const accessToken = await decryptToken(email.account.accessTokenEnc, ENCRYPTION_KEY);
      const oauth2Client = createOAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_OAUTH_REDIRECT_URI
      );
      oauth2Client.setCredentials({ access_token: accessToken });

      const rawMessage = createRawMessage(
        email.unsubscribeMailto,
        'Unsubscribe',
        'Please unsubscribe me from this mailing list.'
      );

      await sendMessage(oauth2Client, rawMessage);
      status = 'success';
      notes = 'Unsubscribe email sent';
      console.log(`Sent unsubscribe email to ${email.unsubscribeMailto}`);
    } catch (error) {
      notes = `Failed to send email: ${error.message}`;
      console.error('Mailto unsubscribe failed:', error);
    }
  }
  // Try URL if mailto failed or not available
  else if (email.unsubscribeUrl) {
    method = 'link';
    try {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      // Navigate to unsubscribe page
      await page.goto(email.unsubscribeUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Look for common unsubscribe buttons/links
      const selectors = [
        'button:has-text("unsubscribe")',
        'a:has-text("unsubscribe")',
        'button:has-text("opt-out")',
        'a:has-text("opt-out")',
        'button:has-text("confirm")',
        'button:has-text("submit")',
        'input[type="submit"]',
      ];

      let clicked = false;
      for (const selector of selectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            await element.click();
            clicked = true;
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (clicked) {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        status = 'success';
        notes = 'Clicked unsubscribe link';
      } else {
        notes = 'No unsubscribe button found';
      }

      await browser.close();
      console.log(`Processed unsubscribe link for ${email.unsubscribeUrl}`);
    } catch (error) {
      notes = `Failed to process link: ${error.message}`;
      console.error('Link unsubscribe failed:', error);
    }
  } else {
    notes = 'No unsubscribe method available';
  }

  // Record attempt
  await prisma.unsubscribeAttempt.create({
    data: {
      emailId,
      method: method || 'none',
      status,
      notes,
    },
  });

  console.log(`Unsubscribe completed for email ${emailId}: ${status}`);
}

export const unsubscribeWorker = new Worker('unsubscribe', processUnsubscribeJob, {
  connection: redisConnection,
  concurrency: 1,
});

unsubscribeWorker.on('completed', (job) => {
  console.log(`Unsubscribe job ${job.id} completed`);
});

unsubscribeWorker.on('failed', (job, err) => {
  console.error(`Unsubscribe job ${job?.id} failed:`, err);
});
