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
                'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch',
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
