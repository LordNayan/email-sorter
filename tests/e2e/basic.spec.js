import { test, expect } from '@playwright/test';

test.describe('Email Sorter E2E', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('http://localhost:5173/login');
    
    await expect(page.locator('h1')).toContainText('Email Sorter');
    await expect(page.locator('button')).toContainText('Sign in with Google');
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('http://localhost:5173/dashboard');
    
    // Should redirect to login
    await page.waitForURL('**/login');
    await expect(page.locator('h1')).toContainText('Email Sorter');
  });
});
