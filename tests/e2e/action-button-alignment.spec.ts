import { expect, test, type Locator } from '@playwright/test';

import { gotoInteractablePage } from './support/navigation.mts';
import { createPoll, deletePolls, type CreatedPoll } from './support/poll-flow';
import { createPollName, createTestNamespace } from './support/test-data';

const desktopViewport = {
    width: 1280,
    height: 900,
};

const alignmentTolerancePx = 1;
const desktopOnlyProjectSkipReason =
    'This regression check verifies the desktop side-by-side button layout.';

const readVisibleElementBottom = async (locator: Locator): Promise<number> => {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();

    if (!box) {
        throw new Error('Expected a visible element with a bounding box.');
    }

    return box.y + box.height;
};

const expectBottomAlignment = async ({
    reference,
    target,
}: {
    reference: Locator;
    target: Locator;
}): Promise<void> => {
    const [referenceBottom, targetBottom] = await Promise.all([
        readVisibleElementBottom(reference),
        readVisibleElementBottom(target),
    ]);

    expect(Math.abs(referenceBottom - targetBottom)).toBeLessThanOrEqual(
        alignmentTolerancePx,
    );
};

test('keeps the add-new-choice button aligned when duplicate validation appears', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name === 'mobile-firefox-android',
        desktopOnlyProjectSkipReason,
    );

    await page.setViewportSize(desktopViewport);
    page = await gotoInteractablePage(page, '/');

    const choiceInput = page.getByLabel('Choice name');
    const addChoiceButton = page.getByRole('button', {
        name: 'Add new choice',
    });

    await choiceInput.fill('Apples');
    await addChoiceButton.click();
    await choiceInput.fill('Apples');
    await expect(
        page.getByText('This choice already exists', { exact: true }),
    ).toBeVisible();
    await expectBottomAlignment({
        reference: choiceInput,
        target: addChoiceButton,
    });
});

test('keeps the copy-link button aligned with the share link field', async ({
    page,
    request,
}, testInfo) => {
    test.skip(
        testInfo.project.name === 'mobile-firefox-android',
        desktopOnlyProjectSkipReason,
    );

    const createdPolls: CreatedPoll[] = [];
    const namespace = createTestNamespace(testInfo);

    try {
        await page.setViewportSize(desktopViewport);
        const pollName = createPollName('Alignment check', namespace);
        const createdPollResult = await createPoll({
            page,
            pollName,
        });
        page = createdPollResult.page;
        createdPolls.push(createdPollResult.createdPoll);

        const copyLinkButton = page.getByTestId('copy-link-button');
        const shareUrlValue = page.getByTestId('share-url-value');

        await expectBottomAlignment({
            reference: shareUrlValue,
            target: copyLinkButton,
        });

        await expect(copyLinkButton).toBeEnabled();
        await copyLinkButton.click();
        await expect(
            page.getByText(/^(Link copied\.|Copy failed\.)$/u),
        ).toBeVisible();
        await expectBottomAlignment({
            reference: shareUrlValue,
            target: copyLinkButton,
        });
    } finally {
        await deletePolls(request, createdPolls);
    }
});
