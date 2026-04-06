'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useMemo } from 'react';

import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const FieldSet = ({
    className,
    ...props
}: React.ComponentProps<'fieldset'>): React.JSX.Element => {
    return (
        <fieldset
            className={cn('flex flex-col gap-4', className)}
            data-slot="field-set"
            {...props}
        />
    );
};

const FieldLegend = ({
    className,
    variant = 'legend',
    ...props
}: React.ComponentProps<'legend'> & {
    variant?: 'legend' | 'label';
}): React.JSX.Element => {
    return (
        <legend
            className={cn(
                'mb-1 text-sm font-medium data-[variant=legend]:text-base',
                className,
            )}
            data-slot="field-legend"
            data-variant={variant}
            {...props}
        />
    );
};

const FieldGroup = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn(
                'group/field-group flex w-full flex-col gap-4',
                className,
            )}
            data-slot="field-group"
            {...props}
        />
    );
};

const fieldVariants = cva(
    'group/field flex w-full gap-2 data-[invalid=true]:text-destructive',
    {
        variants: {
            orientation: {
                vertical: 'flex-col',
                horizontal: 'flex-row items-start',
                responsive:
                    'flex-col @md/field-group:flex-row @md/field-group:items-start',
            },
        },
        defaultVariants: {
            orientation: 'vertical',
        },
    },
);

const Field = ({
    className,
    orientation = 'vertical',
    ...props
}: React.ComponentProps<'div'> &
    VariantProps<typeof fieldVariants>): React.JSX.Element => {
    return (
        <div
            className={cn(fieldVariants({ orientation }), className)}
            data-orientation={orientation}
            data-slot="field"
            role="group"
            {...props}
        />
    );
};

const FieldContent = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn(
                'group/field-content flex flex-1 flex-col gap-1',
                className,
            )}
            data-slot="field-content"
            {...props}
        />
    );
};

const FieldLabel = ({
    className,
    ...props
}: React.ComponentProps<typeof Label>): React.JSX.Element => {
    return (
        <Label
            className={cn(
                'group/field-label text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50',
                className,
            )}
            data-slot="field-label"
            {...props}
        />
    );
};

const FieldTitle = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn(
                'text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50',
                className,
            )}
            data-slot="field-label"
            {...props}
        />
    );
};

const FieldDescription = ({
    className,
    ...props
}: React.ComponentProps<'p'>): React.JSX.Element => {
    return (
        <p
            className={cn(
                'text-sm leading-normal font-normal text-muted-foreground',
                className,
            )}
            data-slot="field-description"
            {...props}
        />
    );
};

const FieldSeparator = ({
    children,
    className,
    ...props
}: React.ComponentProps<'div'> & {
    children?: React.ReactNode;
}): React.JSX.Element => {
    return (
        <div
            className={cn('relative -my-2 h-5 text-sm', className)}
            data-content={!!children}
            data-slot="field-separator"
            {...props}
        >
            <Separator className="absolute inset-0 top-1/2" />
            {children && (
                <span
                    className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
                    data-slot="field-separator-content"
                >
                    {children}
                </span>
            )}
        </div>
    );
};

const FieldError = ({
    className,
    children,
    errors,
    ...props
}: React.ComponentProps<'div'> & {
    errors?: Array<{ message?: string } | undefined>;
}): React.JSX.Element | null => {
    const content = useMemo(() => {
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
            return uniqueErrors[0]?.message;
        }

        return (
            <ul className="ml-4 flex list-disc flex-col gap-1">
                {uniqueErrors.map(
                    (error, index) =>
                        error?.message && <li key={index}>{error.message}</li>,
                )}
            </ul>
        );
    }, [children, errors]);

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

export {
    Field,
    FieldLabel,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLegend,
    FieldSeparator,
    FieldSet,
    FieldContent,
    FieldTitle,
};
