'use client';

import { Tooltip as TooltipPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const TooltipProvider = ({
    delayDuration = 0,
    ...props
}: React.ComponentProps<
    typeof TooltipPrimitive.Provider
>): React.JSX.Element => {
    return (
        <TooltipPrimitive.Provider
            data-slot="tooltip-provider"
            delayDuration={delayDuration}
            {...props}
        />
    );
};

const Tooltip = ({
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>): React.JSX.Element => {
    return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
};

const TooltipTrigger = ({
    ...props
}: React.ComponentProps<
    typeof TooltipPrimitive.Trigger
>): React.JSX.Element => {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
};

const TooltipContent = ({
    className,
    sideOffset = 0,
    children,
    ...props
}: React.ComponentProps<
    typeof TooltipPrimitive.Content
>): React.JSX.Element => {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                className={cn(
                    'z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-sm bg-black/90 px-3 py-1.5 text-xs text-foreground has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
                    className,
                )}
                data-slot="tooltip-content"
                sideOffset={sideOffset}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-black/90 fill-black/90" />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    );
};

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
