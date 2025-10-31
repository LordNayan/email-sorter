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
    let browser = null;
    try {
      console.log(`Opening browser for ${email.unsubscribeUrl}`);
      browser = await chromium.launch({ 
        headless: true,
        timeout: 60000 // 60 second timeout for browser launch
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      // Set longer navigation timeout
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(45000);

      // Navigate to unsubscribe page
      try {
        await page.goto(email.unsubscribeUrl, { 
          waitUntil: 'domcontentloaded', // Changed from 'networkidle' for faster loading
          timeout: 30000 
        });
      } catch (navError) {
        // If navigation times out but page partially loaded, continue
        console.log(`Navigation warning: ${navError.message}, continuing anyway...`);
      }

      // Wait a bit for any dynamic content to load
      await page.waitForTimeout(2000);

      // Comprehensive list of unsubscribe selectors
      const unsubscribeSelectors = [
        // Buttons with text
        'button:has-text("unsubscribe")',
        'button:has-text("Unsubscribe")',
        'button:has-text("UNSUBSCRIBE")',
        'button:has-text("opt out")',
        'button:has-text("Opt Out")',
        'button:has-text("remove me")',
        'button:has-text("Remove Me")',
        
        // Links with text
        'a:has-text("unsubscribe")',
        'a:has-text("Unsubscribe")',
        'a:has-text("Click here to unsubscribe")',
        'a:has-text("opt out")',
        'a:has-text("remove from list")',
        
        // Common class/id patterns (case insensitive)
        'button[class*="unsubscribe" i]',
        'a[class*="unsubscribe" i]',
        'button[id*="unsubscribe" i]',
        'a[id*="unsubscribe" i]',
        
        // Form inputs
        'input[type="submit"][value*="unsubscribe" i]',
        'input[type="button"][value*="unsubscribe" i]',
        
        // Generic confirmation buttons
        'button:has-text("confirm")',
        'button:has-text("Confirm")',
        'button:has-text("yes")',
        'button:has-text("Yes")',
        'button:has-text("submit")',
        'input[type="submit"]',
      ];

      let clicked = false;
      let clickedElement = null;

      // Try each selector
      for (const selector of unsubscribeSelectors) {
        try {
          const elements = await page.locator(selector).all();
          
          for (const element of elements) {
            if (await element.isVisible({ timeout: 1000 })) {
              const text = await element.textContent();
              console.log(`Found element: "${selector}" with text: "${text}"`);
              
              await element.click();
              clicked = true;
              clickedElement = `${selector} (${text})`;
              
              await page.waitForTimeout(2000);
              
              // Check for confirmation button
              const confirmSelectors = ['button:has-text("confirm")', 'button:has-text("yes")', 'input[type="submit"]'];
              for (const confirmSelector of confirmSelectors) {
                try {
                  const confirmBtn = await page.locator(confirmSelector).first();
                  if (await confirmBtn.isVisible({ timeout: 1000 })) {
                    console.log(`Clicking confirmation: ${confirmSelector}`);
                    await confirmBtn.click();
                    await page.waitForTimeout(2000);
                    break;
                  }
                } catch (e) {
                  // No confirmation needed
                }
              }
              break;
            }
          }
          if (clicked) break;
        } catch (e) {
          continue;
        }
      }

      // Check for success messages if no button clicked
      if (!clicked) {
        try {
          const successPatterns = [
            'successfully unsubscribed',
            'you have been unsubscribed',
            'removed from list',
            'unsubscribe successful',
            'you will no longer receive',
          ];
          
          const pageText = await page.textContent('body');
          for (const pattern of successPatterns) {
            if (pageText.toLowerCase().includes(pattern)) {
              status = 'success';
              notes = `Auto-unsubscribed. Found: "${pattern}"`;
              clicked = true;
              break;
            }
          }
          
          if (!clicked) {
            notes = 'No unsubscribe button found';
          }
        } catch (e) {
          notes = 'Could not check for success messages';
        }
      } else {
        status = 'success';
        notes = `Clicked: ${clickedElement}`;
      }

      // Screenshot for debugging
      try {
        await page.screenshot({ path: `/tmp/unsub-${emailId}.png`, fullPage: true });
        console.log(`Screenshot saved to /tmp/unsub-${emailId}.png`);
      } catch (e) {
        console.log('Could not save screenshot:', e.message);
      }

      console.log(`Processed unsubscribe link for ${email.unsubscribeUrl}`);
    } catch (error) {
      notes = `Failed to process link: ${error.message}`;
      console.error('Link unsubscribe failed:', error);
    } finally {
      // Always close browser, even if there was an error
      if (browser) {
        try {
          await browser.close();
          console.log('Browser closed successfully');
        } catch (closeError) {
          console.error('Error closing browser:', closeError.message);
        }
      }
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
