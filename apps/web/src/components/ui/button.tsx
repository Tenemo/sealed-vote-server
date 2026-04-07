import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-accent disabled:text-muted-foreground',
                outline:
                    'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground disabled:border-border disabled:bg-background disabled:text-muted-foreground',
                secondary:
                    'border-border/70 bg-card text-foreground hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-card disabled:text-muted-foreground',
                ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
                destructive:
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-accent disabled:text-muted-foreground',
                warning:
                    'bg-amber-600 text-white hover:bg-amber-500 focus-visible:border-amber-300 focus-visible:ring-amber-300/40 disabled:bg-accent disabled:text-muted-foreground',
                link: 'text-foreground underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 gap-2 px-4 py-2 text-sm',
                xs: 'h-8 gap-1 rounded-lg px-3 text-xs',
                sm: 'h-9 gap-1.5 rounded-lg px-3.5 text-sm',
                lg: 'h-12 gap-2.5 px-5 py-2.5 text-base',
                icon: 'size-9',
                'icon-xs': 'size-8 rounded-lg',
                'icon-sm': 'size-9 rounded-lg',
                'icon-lg': 'size-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

const Button = ({
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }): React.JSX.Element => {
    const Comp = asChild ? Slot.Root : 'button';

    return (
        <Comp
            className={cn(buttonVariants({ variant, size, className }))}
            data-size={size}
            data-slot="button"
            data-variant={variant}
            {...props}
        />
    );
};

export { Button, buttonVariants };
