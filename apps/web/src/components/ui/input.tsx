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
                'h-12 w-full min-w-0 rounded-xl border border-input bg-background/40 px-4 py-3 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
                className,
            )}
            data-slot="input"
            type={type}
            {...props}
        />
    );
};

export { Input };
