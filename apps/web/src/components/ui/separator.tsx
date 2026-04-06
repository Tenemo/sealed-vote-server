import { Separator as SeparatorPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Separator = ({
    className,
    orientation = 'horizontal',
    decorative = true,
    ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>): React.JSX.Element => {
    return (
        <SeparatorPrimitive.Root
            className={cn(
                'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
                className,
            )}
            data-slot="separator"
            decorative={decorative}
            orientation={orientation}
            {...props}
        />
    );
};

export { Separator };
