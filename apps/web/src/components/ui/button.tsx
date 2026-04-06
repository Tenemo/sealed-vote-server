import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent text-sm leading-[1.75] font-medium whitespace-nowrap uppercase tracking-[0.02857em] transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-white/12 disabled:text-white/30',
                outline:
                    'border-secondary bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground disabled:border-white/12 disabled:text-white/30',
                secondary:
                    'border-secondary bg-transparent text-secondary-foreground hover:bg-accent hover:text-foreground disabled:border-white/12 disabled:text-white/30',
                ghost: 'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
                destructive:
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-white/12 disabled:text-white/30',
                warning:
                    'bg-amber-600 text-white hover:bg-amber-500 focus-visible:border-amber-300 focus-visible:ring-amber-300/40 disabled:bg-white/12 disabled:text-white/30',
                link: 'text-foreground underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-9 gap-1.5 px-4 py-2',
                xs: 'h-7 gap-1 rounded-sm px-2 text-xs',
                sm: 'h-8 gap-1 rounded-sm px-3 text-sm',
                lg: 'h-[42.25px] gap-2 px-[22px] py-2 text-[0.9375rem] leading-[26.25px]',
                icon: 'size-9',
                'icon-xs': 'size-7 rounded-sm',
                'icon-sm': 'size-8 rounded-sm',
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
