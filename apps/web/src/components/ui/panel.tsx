import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const panelVariants = cva('rounded-2xl border border-border/70', {
    variants: {
        padding: {
            default: 'p-5 sm:p-6',
            compact: 'p-4 sm:p-5',
            none: '',
        },
        tone: {
            default: 'bg-card',
            subtle: 'bg-background',
        },
    },
    defaultVariants: {
        padding: 'default',
        tone: 'default',
    },
});

const Panel = ({
    className,
    padding,
    tone,
    ...props
}: React.ComponentProps<'section'> &
    VariantProps<typeof panelVariants>): React.JSX.Element => {
    return (
        <section
            className={cn(panelVariants({ padding, tone, className }))}
            {...props}
        />
    );
};

export { Panel };
