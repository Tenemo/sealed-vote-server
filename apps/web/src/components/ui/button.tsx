import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:ring-2 focus-visible:ring-foreground/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-primary/60 disabled:text-primary-foreground/80 disabled:opacity-100',
                outline:
                    'border-border bg-background text-foreground hover:bg-accent hover:text-foreground disabled:border-border/90 disabled:bg-card disabled:text-muted-foreground disabled:opacity-100',
                secondary:
                    'border-border/70 bg-card text-foreground hover:bg-accent hover:text-foreground disabled:border-border/70 disabled:bg-card/80 disabled:text-muted-foreground disabled:opacity-100',
                ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-foreground',
            },
            size: {
                default: 'h-10 gap-2 px-4 py-2 text-sm',
                lg: 'h-12 gap-2.5 px-5 py-2.5 text-base',
                'icon-sm': 'size-9 rounded-md',
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
