import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const inputVariants = cva(
    'w-full min-w-0 rounded-[var(--radius-md)] border text-base text-foreground transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25',
    {
        variants: {
            variant: {
                outlined:
                    'h-12 border-input bg-background px-4 py-3 focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/55',
                filled: 'h-12 border-border bg-filled px-4 py-3 hover:bg-filled-hover focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/55',
            },
        },
        defaultVariants: {
            variant: 'outlined',
        },
    },
);

type InputProps = React.ComponentProps<'input'> &
    VariantProps<typeof inputVariants>;

const Input = ({
    className,
    type,
    variant,
    ...props
}: InputProps): React.JSX.Element => {
    return (
        <input
            className={cn(inputVariants({ className, variant }))}
            data-slot="input"
            type={type}
            {...props}
        />
    );
};

export { Input };
