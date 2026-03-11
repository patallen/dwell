import { test, expect } from '@playwright/test';

test.describe('Dwell Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Handle the SoftLanding screen if it's there
    const landingSkip = page.getByText("esc to skip");
    try {
      await landingSkip.waitFor({ state: 'visible', timeout: 5000 });
      await page.keyboard.press('Escape');
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

  test('capture task submits and closes overlay', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10000 });

    // Open capture overlay
    await page.keyboard.press('Control+i');
    const overlayInput = page.getByPlaceholder("what's on your mind?");
    await expect(overlayInput).toBeVisible();

    // Type and submit
    await overlayInput.fill(`Smoke Test Task ${Date.now()}`);
    await page.keyboard.press('Enter');

    // Overlay should close after capture
    await expect(overlayInput).toBeHidden({ timeout: 5000 });

    // Workspace should still be visible (no crash)
    await expect(main).toBeVisible();
  });

  test('suggestion pick handles NoteToSelf prompt', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10000 });

    // Wait for suggestions to load
    const upNext = page.getByText("Up next");
    const whatShouldWeWork = page.getByText("What should we work on?");
    await expect(upNext.or(whatShouldWeWork)).toBeVisible({ timeout: 10000 });

    const hasFocus = await page.getByText("Working on").isVisible();

    // Click the first suggestion
    const firstSuggestion = page.locator('button').filter({ has: page.locator('.flex.items-center.gap-3') }).first();
    await expect(firstSuggestion).toBeVisible();
    await firstSuggestion.click();

    if (hasFocus) {
      // NoteToSelf prompt should appear when switching away from focused task
      const notePrompt = page.getByPlaceholder("note for when you come back?");
      await expect(notePrompt).toBeVisible({ timeout: 5000 });
      // Skip it
      await page.keyboard.press('Escape');
    }

    // After picking, the app should still be functional (either workspace or note view)
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test('keyboard shortcuts open overlays', async ({ page }) => {
    const main = page.locator('main');
    await expect(main).toBeVisible({ timeout: 10000 });

    // Find overlay (Cmd/)
    await page.keyboard.press('Control+/');
    await expect(page.getByPlaceholder("search...")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    // Stack overlay (CmdJ)
    await page.keyboard.press('Control+j');
    await expect(page.getByText("Context Stack")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    // Notes overlay (CmdP)
    await page.keyboard.press('Control+p');
    await expect(page.getByText("Notes").first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');

    // Help overlay (Cmd.)
    await page.keyboard.press('Control+.');
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('footer shows expected elements', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 10000 });
    await expect(footer.getByText("⌘I capture")).toBeVisible();
    await expect(footer.getByText("⌘/ find")).toBeVisible();
    await expect(footer.getByText("⌘J stack")).toBeVisible();
    await expect(footer.getByText("⌘P notes")).toBeVisible();
  });
});
