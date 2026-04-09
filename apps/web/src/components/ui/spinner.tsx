import { Loader2Icon } from 'lucide-react';
import type { ComponentPropsWithoutRef, JSX } from 'react';

import { cn } from '@/lib/utils';

type SpinnerProps = ComponentPropsWithoutRef<'span'> & {
    label?: string | null;
};

const Spinner = ({
    className,
    label = 'Loading',
    ...props
}: SpinnerProps): JSX.Element => {
    if (label === null || props['aria-hidden']) {
        return (
            <span {...props} aria-hidden="true">
                <Loader2Icon className={cn('size-4 animate-spin', className)} />
            </span>
        );
    }

    return (
        <span {...props} aria-label={label} role="status">
            <Loader2Icon className={cn('size-4 animate-spin', className)} />
        </span>
    );
};

export { Spinner };
