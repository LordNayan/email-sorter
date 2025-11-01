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
      try {
        await page.waitForTimeout(2000);
      } catch (timeoutError) {
        // Page might have closed (redirect to success page, etc)
        console.log(`Page closed during wait, might have auto-unsubscribed`);
        status = 'success';
        notes = 'Page closed/redirected (likely auto-unsubscribed)';
        return; // Exit early, browser will be closed in finally block
      }

      // Check if page already shows unsubscribed status (one-click unsubscribe)
      try {
        const pageText = await page.textContent('body');
        const alreadyUnsubscribedPatterns = [
          'unsubscribed',
          'you\'ve unsubscribed',
          'you have been unsubscribed',
          'you\'ve been unsubscribed',
          'you are unsubscribed',
          'successfully unsubscribed',
          'unsubscribed successfully',
          'unsubscribe successful',
          'you will no longer receive',
          'removed from list',
          'removed from mailing list',
          'you have opted out',
          'you\'ve opted out',
          'subscription removed',
        ];
        
        const lowerPageText = pageText.toLowerCase();
        for (const pattern of alreadyUnsubscribedPatterns) {
          if (lowerPageText.includes(pattern)) {
            console.log(`Page already shows unsubscribed: "${pattern}"`);
            status = 'success';
            notes = `One-click unsubscribe successful. Found: "${pattern}"`;
            return; // Exit early - already unsubscribed
          }
        }
      } catch (e) {
        console.log('Could not check page text for unsubscribe confirmation');
      }

      // Check for CAPTCHA
      const captchaPatterns = [
        'div[class*="captcha" i]',
        'div[id*="captcha" i]',
        'iframe[src*="recaptcha"]',
        'div[class*="recaptcha"]',
        '.g-recaptcha',
        '#recaptcha',
      ];
      
      for (const pattern of captchaPatterns) {
        try {
          const captcha = await page.locator(pattern).first();
          if (await captcha.isVisible({ timeout: 500 })) {
            console.log('CAPTCHA detected - cannot auto-unsubscribe');
            status = 'failed';
            notes = 'CAPTCHA detected - manual intervention required';
            return;
          }
        } catch (e) {
          // No CAPTCHA with this pattern
        }
      }

      // Check for login requirement
      const loginPatterns = [
        'input[type="password"]',
        'button:has-text("log in")',
        'button:has-text("sign in")',
        'a:has-text("log in")',
      ];
      
      for (const pattern of loginPatterns) {
        try {
          const loginElement = await page.locator(pattern).first();
          if (await loginElement.isVisible({ timeout: 500 })) {
            console.log('Login required - cannot auto-unsubscribe');
            status = 'failed';
            notes = 'Login/authentication required - manual intervention needed';
            return;
          }
        } catch (e) {
          // No login required
        }
      }

      // Scroll to bottom to reveal hidden content
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log('Could not scroll page');
      }

      // Step 1: Handle tabs/navigation to preferences section
      try {
        const preferenceTabs = [
          'a:has-text("Email Preferences")',
          'button:has-text("Email Preferences")',
          'a:has-text("Preferences")',
          'a:has-text("Subscription Settings")',
          'button:has-text("Manage Preferences")',
        ];
        
        for (const tabSelector of preferenceTabs) {
          try {
            const tab = await page.locator(tabSelector).first();
            if (await tab.isVisible({ timeout: 500 })) {
              console.log(`Clicking preferences tab: ${tabSelector}`);
              await tab.click();
              await page.waitForTimeout(1000);
              break;
            }
          } catch (e) {
            // Tab not found
          }
        }
      } catch (e) {
        console.log('No preference tabs found');
      }

      // Step 2: Fill any required forms (email address, reason dropdowns, etc)
      try {
        // Look for email input fields that might be required
        const emailInputs = await page.locator('input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="email" i]').all();
        for (const input of emailInputs) {
          if (await input.isVisible({ timeout: 500 })) {
            const inputValue = await input.inputValue();
            if (!inputValue || inputValue.trim() === '') {
              console.log('Filling email field with user email');
              await input.fill(email.from || 'user@example.com');
            }
          }
        }

        // Handle "reason for unsubscribing" dropdowns/selects
        const reasonSelects = await page.locator('select[name*="reason" i], select[id*="reason" i], select[name*="why" i]').all();
        for (const select of reasonSelects) {
          if (await select.isVisible({ timeout: 500 })) {
            const options = await select.locator('option').all();
            if (options.length > 1) {
              console.log('Selecting reason dropdown (first non-empty option)');
              await select.selectOption({ index: 1 }); // Select first real option (skip placeholder)
            }
          }
        }

        // Handle radio buttons (choose "unsubscribe from all" option)
        const radioGroups = await page.locator('input[type="radio"]').all();
        const radioGroupNames = new Set();
        
        for (const radio of radioGroups) {
          try {
            const name = await radio.getAttribute('name');
            const label = await page.locator(`label[for="${await radio.getAttribute('id')}"]`).textContent().catch(() => '');
            const value = await radio.getAttribute('value');
            
            if (name && !radioGroupNames.has(name)) {
              // Check if this is an "unsubscribe all" or similar option
              const unsubscribePatterns = ['unsubscribe all', 'unsubscribe from all', 'stop all', 'no email', 'opt out'];
              const shouldSelect = unsubscribePatterns.some(pattern => 
                label.toLowerCase().includes(pattern) || 
                (value && value.toLowerCase().includes(pattern))
              );
              
              if (shouldSelect && await radio.isVisible({ timeout: 500 })) {
                console.log(`Selecting radio: ${label || value}`);
                await radio.check();
                radioGroupNames.add(name);
              }
            }
          } catch (e) {
            // Skip this radio
          }
        }

        // Handle checkboxes that need to be UNCHECKED (subscription preferences)
        const subscriptionCheckboxes = await page.locator('input[type="checkbox"][name*="subscribe" i], input[type="checkbox"][name*="newsletter" i], input[type="checkbox"][name*="notification" i]').all();
        for (const checkbox of subscriptionCheckboxes) {
          if (await checkbox.isVisible({ timeout: 500 })) {
            const isChecked = await checkbox.isChecked();
            if (isChecked) {
              console.log('Unchecking subscription checkbox');
              await checkbox.uncheck();
            }
          }
        }

        // Handle checkboxes that need to be CHECKED (confirmation)
        const confirmCheckboxes = await page.locator('input[type="checkbox"][name*="confirm" i], input[type="checkbox"][id*="confirm" i]').all();
        for (const checkbox of confirmCheckboxes) {
          if (await checkbox.isVisible({ timeout: 500 })) {
            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
              console.log('Checking confirmation checkbox');
              await checkbox.check();
            }
          }
        }

        // Handle toggle switches (modern UI)
        const toggles = await page.locator('input[type="checkbox"][role="switch"], .toggle, .switch, [role="switch"]').all();
        for (const toggle of toggles) {
          if (await toggle.isVisible({ timeout: 500 })) {
            try {
              const isChecked = await toggle.isChecked().catch(() => false);
              const ariaChecked = await toggle.getAttribute('aria-checked').catch(() => null);
              const isOn = isChecked || ariaChecked === 'true';
              
              if (isOn) {
                console.log('Turning off toggle switch');
                await toggle.click();
              }
            } catch (e) {
              // Some toggles might not be standard checkboxes
            }
          }
        }
      } catch (formError) {
        console.log('Form filling error (non-critical):', formError.message);
      }

      // Step 2: Find and click unsubscribe button/link
      const unsubscribeSelectors = [
        // Primary unsubscribe buttons/links (most specific first)
        'button:has-text("Unsubscribe all")',
        'button:has-text("Unsubscribe from all")',
        'a:has-text("Unsubscribe from all")',
        'button:has-text("unsubscribe")',
        'button:has-text("Unsubscribe")',
        'button:has-text("UNSUBSCRIBE")',
        'a:has-text("unsubscribe")',
        'a:has-text("Unsubscribe")',
        'a:has-text("Click here to unsubscribe")',
        
        // Opt-out variations
        'button:has-text("opt out")',
        'button:has-text("Opt Out")',
        'a:has-text("opt out")',
        'a:has-text("Opt-Out")',
        'button:has-text("remove me")',
        'a:has-text("remove from list")',
        
        // Class/ID patterns
        'button[class*="unsubscribe" i]',
        'a[class*="unsubscribe" i]',
        'button[id*="unsubscribe" i]',
        'a[id*="unsubscribe" i]',
        
        // Form submit buttons
        'input[type="submit"][value*="unsubscribe" i]',
        'button[type="submit"]:has-text("Unsubscribe")',
        'input[type="button"][value*="unsubscribe" i]',
        
        // Generic submit (last resort)
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
              
              // Wait after click, but handle if page closes
              try {
                await page.waitForTimeout(1000);
                
                // Check for modal/dialog confirmation
                const modalSelectors = [
                  'div[role="dialog"]',
                  'div[role="alertdialog"]',
                  '.modal',
                  '.dialog',
                  '[class*="modal" i]:visible',
                ];
                
                for (const modalSelector of modalSelectors) {
                  try {
                    const modal = await page.locator(modalSelector).first();
                    if (await modal.isVisible({ timeout: 500 })) {
                      console.log('Modal detected, looking for confirmation button');
                      
                      // Look for confirmation in modal
                      const modalConfirmSelectors = [
                        'button:has-text("yes")',
                        'button:has-text("confirm")',
                        'button:has-text("unsubscribe")',
                        'button:has-text("continue")',
                        'button:has-text("ok")',
                      ];
                      
                      for (const confirmSelector of modalConfirmSelectors) {
                        try {
                          const confirmBtn = await modal.locator(confirmSelector).first();
                          if (await confirmBtn.isVisible({ timeout: 500 })) {
                            console.log(`Clicking modal confirmation: ${confirmSelector}`);
                            await confirmBtn.click();
                            await page.waitForTimeout(1000);
                            break;
                          }
                        } catch (e) {
                          // Try next selector
                        }
                      }
                      break;
                    }
                  } catch (e) {
                    // No modal
                  }
                }
                
                await page.waitForTimeout(1000);
              } catch (waitError) {
                console.log(`Page closed after click, likely successful redirect`);
                status = 'success';
                notes = `Clicked: ${clickedElement}, page closed (likely success)`;
                return; // Exit early
              }
              
              // Step 3: Handle post-click interactions (confirmations, additional forms)
              
              // Check if there's another form that appeared
              try {
                const postClickForms = await page.locator('form').all();
                for (const form of postClickForms) {
                  if (await form.isVisible({ timeout: 500 })) {
                    // Fill any new email fields
                    const newEmailInputs = await form.locator('input[type="email"]').all();
                    for (const input of newEmailInputs) {
                      const inputValue = await input.inputValue();
                      if (!inputValue || inputValue.trim() === '') {
                        await input.fill(email.from || 'user@example.com');
                      }
                    }
                    
                    // Check any new checkboxes
                    const newCheckboxes = await form.locator('input[type="checkbox"]').all();
                    for (const checkbox of newCheckboxes) {
                      const isChecked = await checkbox.isChecked();
                      if (!isChecked) {
                        await checkbox.check();
                      }
                    }
                  }
                }
              } catch (e) {
                // No additional forms
              }
              
              // Check for confirmation button
              const confirmSelectors = [
                'button:has-text("confirm")',
                'button:has-text("Confirm")',
                'button:has-text("yes")',
                'button:has-text("Yes")',
                'button:has-text("continue")',
                'button:has-text("proceed")',
                'button[type="submit"]',
                'input[type="submit"]',
              ];
              
              for (const confirmSelector of confirmSelectors) {
                try {
                  const confirmBtn = await page.locator(confirmSelector).first();
                  if (await confirmBtn.isVisible({ timeout: 1000 })) {
                    console.log(`Clicking confirmation: ${confirmSelector}`);
                    await confirmBtn.click();
                    
                    try {
                      await page.waitForTimeout(2000);
                    } catch (waitError) {
                      console.log(`Page closed after confirmation click`);
                      status = 'success';
                      notes = `Clicked: ${clickedElement} + confirmation, page closed (likely success)`;
                      return;
                    }
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
          // Check if it's a "page closed" error
          if (e.message && e.message.includes('Target page, context or browser has been closed')) {
            console.log(`Page closed while looking for elements (might be auto-unsubscribe)`);
            status = 'success';
            notes = 'Page closed during interaction (likely auto-unsubscribed)';
            return;
          }
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
