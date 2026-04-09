'use client';

import { type ComponentProps, type JSX, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const Field = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
    return (
        <div
            className={cn('flex w-full flex-col gap-2', className)}
            data-slot="field"
            {...props}
        />
    );
};

const FieldContent = ({
    className,
    ...props
}: ComponentProps<'div'>): JSX.Element => {
    return (
        <div
            className={cn('flex flex-1 flex-col gap-2', className)}
            data-slot="field-content"
            {...props}
        />
    );
};

const FieldLabel = ({
    className,
    ...props
}: ComponentProps<typeof Label>): JSX.Element => {
    return (
        <Label
            className={cn('text-sm font-medium leading-snug', className)}
            data-slot="field-label"
            {...props}
        />
    );
};

const FieldDescription = ({
    className,
    ...props
}: ComponentProps<'p'>): JSX.Element => {
    return (
        <p
            className={cn('field-note', className)}
            data-slot="field-description"
            {...props}
        />
    );
};

const getFieldErrorContent = (
    children: ReactNode,
    errors?: Array<{ message?: string } | undefined>,
): ReactNode => {
    if (children) {
        return children;
    }

    if (!errors?.length) {
        return null;
    }

    const uniqueErrors = [
        ...new Map(
            errors.map((error) => [error?.message, error] as const),
        ).values(),
    ];

    if (uniqueErrors.length === 1) {
        return uniqueErrors[0]?.message ?? null;
    }

    return (
        <ul className="ml-4 flex list-disc flex-col gap-1">
            {uniqueErrors.map(
                (error, index) =>
                    error?.message && <li key={index}>{error.message}</li>,
            )}
        </ul>
    );
};

const FieldError = ({
    className,
    children,
    errors,
    ...props
}: ComponentProps<'div'> & {
    errors?: Array<{ message?: string } | undefined>;
}): JSX.Element | null => {
    const content = getFieldErrorContent(children, errors);

    if (!content) {
        return null;
    }

    return (
        <div
            className={cn('text-sm font-normal text-destructive', className)}
            data-slot="field-error"
            role="alert"
            {...props}
        >
            {content}
        </div>
    );
};

export { Field, FieldLabel, FieldDescription, FieldError, FieldContent };
