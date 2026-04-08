import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const panelVariants = cva('border border-border/70', {
    variants: {
        padding: {
            default: 'p-5 sm:p-6',
            compact: 'p-4 sm:p-5',
            row: 'px-4 py-3',
            none: '',
        },
        tone: {
            default: 'bg-card',
            surface: 'bg-background',
            subtle: 'bg-accent',
        },
        radius: {
            default: 'rounded-2xl',
            compact: 'rounded-xl',
        },
        borderStyle: {
            solid: '',
            dashed: 'border-dashed',
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
}: React.ComponentProps<'section'> &
    VariantProps<typeof panelVariants> & {
        asChild?: boolean;
    }): React.JSX.Element => {
    const Comp = asChild ? Slot.Root : 'section';

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
