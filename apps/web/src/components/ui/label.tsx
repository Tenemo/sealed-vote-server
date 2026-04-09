import { Label as LabelPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const Label = ({
    className,
    ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.JSX.Element => {
    return (
        <LabelPrimitive.Root
            className={cn(
                'flex items-center gap-2 text-sm leading-6 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
                className,
            )}
            data-slot="label"
            {...props}
        />
    );
};

export { Label };
