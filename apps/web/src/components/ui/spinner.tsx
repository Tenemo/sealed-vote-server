import { Loader2Icon } from 'lucide-react';
import type { ComponentProps, JSX } from 'react';

import { cn } from '@/lib/utils';

const Spinner = ({
    className,
    ...props
}: ComponentProps<'svg'>): JSX.Element => {
    return (
        <Loader2Icon
            aria-label="Loading"
            className={cn('size-4 animate-spin', className)}
            role="status"
            {...props}
        />
    );
};

export { Spinner };
