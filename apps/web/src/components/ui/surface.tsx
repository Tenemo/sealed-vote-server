import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const surfaceVariants = cva(
    'rounded-[var(--radius-md)] border border-border/70 bg-background',
    {
        variants: {
            padding: {
                default: 'px-4 py-4',
                compact: 'px-3 py-3',
                row: 'px-4 py-3',
            },
        },
        defaultVariants: {
            padding: 'default',
        },
    },
);

type SurfaceElement = 'div' | 'li';

type SurfaceProps = React.HTMLAttributes<HTMLElement> &
    VariantProps<typeof surfaceVariants> & {
        as?: SurfaceElement;
    };

const Surface = ({
    as = 'div',
    className,
    padding,
    ...props
}: SurfaceProps): React.JSX.Element => {
    const Component = as;

    return (
        <Component
            className={cn(surfaceVariants({ padding }), className)}
            {...props}
        />
    );
};

export { Surface };
