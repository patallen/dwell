import { test, expect } from '@playwright/test';

test.describe('Dwell Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Handle the SoftLanding screen if it's there
    const landingSkip = page.getByText("esc to skip");
    try {
      // Wait up to 5s for landing screen to appear
      await landingSkip.waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
      // Wait for it to disappear
      await landingSkip.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {
      // Not visible or timed out, move on
    }
  });

  test('has title and opens capture overlay', async ({ page }) => {
    await expect(page).toHaveTitle(/frontend/);
    await page.keyboard.press('Control+i');
    const overlayInput = page.getByPlaceholder("what's on your mind?");
    await expect(overlayInput).toBeVisible({ timeout: 10000 });
    await expect(overlayInput).toBeFocused();
  });

  test('workspace renders and allows basic interaction', async ({ page }) => {
    // 1. Verify workspace renders
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10000 });

    // 2. Interaction test: Capture a new task
    const testTaskTitle = `Smoke Test Task ${Date.now()}`;
    await page.keyboard.press('Control+i');
    const overlayInput = page.getByPlaceholder("what's on your mind?");
    await expect(overlayInput).toBeVisible();
    await overlayInput.fill(testTaskTitle);
    await page.keyboard.press('Enter');

    // 3. Verify it shows up somewhere (Working on or Up next)
    await expect(page.getByText(testTaskTitle).first()).toBeVisible({ timeout: 10000 });

    // 4. Determine state and interact
    const workingOnHeader = page.getByText("Working on");
    
    // If it's not the active task, pick it from suggestions
    if (!(await workingOnHeader.isVisible())) {
      const suggestionButton = page.getByRole('button').filter({ hasText: testTaskTitle });
      await expect(suggestionButton).toBeVisible();
      await suggestionButton.click();
    }

    // 5. Verify it is now the active task
    await expect(page.getByText("Working on")).toBeVisible({ timeout: 10000 });
    const activeTaskHeader = page.locator('h1', { hasText: testTaskTitle });
    await expect(activeTaskHeader).toBeVisible();

    // 6. Complete the task
    const card = page.locator('div').filter({ has: activeTaskHeader }).filter({ hasText: "Done" });
    const doneButton = card.getByRole('button', { name: "Done" });
    await expect(doneButton).toBeVisible();
    await doneButton.click();
    
    // 7. Verify the task is no longer in the active "Working on" section
    await expect(activeTaskHeader).toBeHidden({ timeout: 10000 });
    // And verify "Working on" header is gone if it was the only task
    // (Or at least the specific task is gone from the whole page)
    await expect(page.getByText(testTaskTitle)).toBeHidden({ timeout: 10000 });
  });
});
