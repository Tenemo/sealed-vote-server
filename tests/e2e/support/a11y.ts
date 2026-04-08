import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const wcagTags = [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22a',
    'wcag22aa',
];

const formatTarget = (target: unknown): string =>
    Array.isArray(target)
        ? target.map((value) => String(value)).join(' ')
        : String(target);

const formatViolations = (
    violations: ReadonlyArray<{
        description: string;
        help: string;
        id: string;
        impact?: string | null;
        nodes: ReadonlyArray<{ target: unknown }>;
    }>,
): string =>
    violations
        .map((violation) => {
            const nodeTargets = violation.nodes
                .map((node) => formatTarget(node.target))
                .join(', ');

            return [
                `${violation.id}: ${violation.help}`,
                `Impact: ${violation.impact ?? 'unknown'}`,
                `Description: ${violation.description}`,
                `Targets: ${nodeTargets || 'n/a'}`,
            ].join('\n');
        })
        .join('\n\n');

export const expectNoAxeViolations = async (
    page: Page,
    pageLabel: string,
): Promise<void> => {
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    const message = results.violations.length
        ? `Axe violations on ${pageLabel}:\n\n${formatViolations(results.violations)}`
        : `Axe violations on ${pageLabel}.`;

    expect(results.violations, message).toEqual([]);
};
