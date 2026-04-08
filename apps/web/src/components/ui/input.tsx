import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = ({
    className,
    type,
    ...props
}: React.ComponentProps<'input'>): React.JSX.Element => {
    return (
        <input
            className={cn(
                'h-12 w-full min-w-0 rounded-md border border-border bg-background px-4 py-3 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/55 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25',
                className,
            )}
            data-slot="input"
            type={type}
            {...props}
        />
    );
};

export { Input };
