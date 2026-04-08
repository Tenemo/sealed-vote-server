import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './support/a11y';
import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './support/monitoring';

test('rejects legacy uuid vote routes in the browser', async ({ page }) => {
    const tracker = createUnexpectedErrorTracker();
    attachErrorTracking(page, 'legacy-route', tracker);

    await page.goto('/votes/11111111-1111-4111-8111-111111111111');

    await expect(
        page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    await expectNoAxeViolations(page, 'legacy route not found page');
    expectNoUnexpectedErrors(tracker);
});
