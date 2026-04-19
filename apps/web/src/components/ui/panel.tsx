import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const panelVariants = cva('border border-border/70 bg-card', {
    variants: {
        padding: {
            default: 'p-5 sm:p-6',
            row: 'px-4 py-3',
        },
        tone: {
            default: '',
        },
        radius: {
            default: 'rounded-[var(--radius-lg)]',
            compact: 'rounded-[var(--radius-md)]',
        },
        borderStyle: {
            solid: '',
        },
    },
    defaultVariants: {
        padding: 'default',
        tone: 'default',
        radius: 'default',
        borderStyle: 'solid',
    },
});

const Panel = ({
    asChild = false,
    className,
    borderStyle,
    padding,
    radius,
    tone,
    ...props
}: React.ComponentProps<'div'> &
    VariantProps<typeof panelVariants> & {
        asChild?: boolean;
    }): React.JSX.Element => {
    const Comp = asChild ? Slot.Root : 'div';

    return (
        <Comp
            className={cn(
                panelVariants({
                    borderStyle,
                    padding,
                    radius,
                    tone,
                    className,
                }),
            )}
            {...props}
        />
    );
};

export { Panel };
