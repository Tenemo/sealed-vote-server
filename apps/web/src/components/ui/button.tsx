import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border-border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/90',
        ghost:
          'border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        warning:
          'bg-amber-500 text-black hover:bg-amber-400 focus-visible:border-amber-200 focus-visible:ring-amber-200/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 gap-1.5 px-4 py-2',
        xs: 'h-7 gap-1 rounded-md px-2 text-xs',
        sm: 'h-8 gap-1 rounded-md px-3 text-sm',
        lg: 'h-11 gap-2 px-8 text-base',
        icon: 'size-9',
        'icon-xs': 'size-7 rounded-md',
        'icon-sm': 'size-8 rounded-md',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = ({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }): React.JSX.Element => {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  );
};

export { Button, buttonVariants };
