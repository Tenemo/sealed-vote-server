import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
    'relative grid w-full gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default: 'border-border bg-accent text-foreground',
                info: 'border-border bg-accent text-foreground',
                success: 'border-border bg-accent text-foreground',
                destructive:
                    'border-destructive/60 bg-destructive/10 text-foreground',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

type AlertAnnouncement = 'assertive' | 'off' | 'polite';

const Alert = ({
    announcement = 'off',
    className,
    variant,
    role,
    ...props
}: React.ComponentProps<'div'> &
    VariantProps<typeof alertVariants> & {
        announcement?: AlertAnnouncement;
    }): React.JSX.Element => {
    const accessibilityProps =
        announcement === 'assertive'
            ? {
                  'aria-atomic': 'true' as const,
                  'aria-live': 'assertive' as const,
                  role: role ?? ('alert' as const),
              }
            : announcement === 'polite'
              ? {
                    'aria-atomic': 'true' as const,
                    'aria-live': 'polite' as const,
                    role: role ?? ('status' as const),
                }
              : {
                    role:
                        role ??
                        (variant === 'destructive'
                            ? ('alert' as const)
                            : undefined),
                };

    return (
        <div
            {...accessibilityProps}
            className={cn(alertVariants({ variant }), className)}
            data-slot="alert"
            data-variant={variant}
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
            className={cn(
                'text-sm text-current [&_p]:leading-relaxed',
                className,
            )}
            data-slot="alert-description"
            {...props}
        />
    );
};

export { Alert, AlertDescription };
