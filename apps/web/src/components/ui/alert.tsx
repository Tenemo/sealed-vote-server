import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
    'relative grid gap-1 rounded-sm border px-4 py-2 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default: 'border-border bg-accent text-foreground',
                info: 'border-border bg-accent text-foreground',
                destructive:
                    'border-destructive/60 bg-destructive/10 text-foreground',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

const Alert = ({
    className,
    variant,
    ...props
}: React.ComponentProps<'div'> &
    VariantProps<typeof alertVariants>): React.JSX.Element => {
    return (
        <div
            className={cn(alertVariants({ variant }), className)}
            data-slot="alert"
            data-variant={variant}
            role="alert"
            {...props}
        />
    );
};

const AlertTitle = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn('font-medium', className)}
            data-slot="alert-title"
            {...props}
        />
    );
};

const AlertDescription = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn('text-sm text-current', className)}
            data-slot="alert-description"
            {...props}
        />
    );
};

const AlertAction = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => {
    return (
        <div
            className={cn('absolute right-2 top-2', className)}
            data-slot="alert-action"
            {...props}
        />
    );
};

export { Alert, AlertTitle, AlertDescription, AlertAction };
