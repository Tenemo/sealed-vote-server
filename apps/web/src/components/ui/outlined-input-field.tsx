import * as React from 'react';

import { cn } from '@/lib/utils';

type OutlinedInputFieldProps = Omit<React.ComponentProps<'input'>, 'size'> & {
    errorText?: React.ReactNode;
    helperText?: React.ReactNode;
    inputClassName?: string;
    label: string;
    labelClassName?: string;
    wrapperClassName?: string;
};

const isInvalidInput = (
    ariaInvalid: React.AriaAttributes['aria-invalid'],
): boolean => ariaInvalid === true || ariaInvalid === 'true';

const OutlinedInputField = ({
    className,
    errorText,
    helperText,
    id,
    inputClassName,
    label,
    labelClassName,
    onBlur,
    onFocus,
    value,
    wrapperClassName,
    ...props
}: OutlinedInputFieldProps): React.JSX.Element => {
    const [isFocused, setIsFocused] = React.useState(false);
    const hasValue =
        value !== undefined &&
        value !== null &&
        String(value).trim().length > 0;
    const isFloating = isFocused || hasValue;
    const isInvalid = isInvalidInput(props['aria-invalid']);

    return (
        <div className={cn('w-full', wrapperClassName)}>
            <div
                className={cn(
                    'relative rounded-sm border transition-colors',
                    isInvalid ? 'border-destructive' : 'border-input',
                    isFocused && !isInvalid && 'border-foreground',
                    className,
                )}
            >
                <label
                    className={cn(
                        'pointer-events-none absolute left-[14px] z-10 bg-background px-1 text-secondary transition-all duration-150',
                        isFloating
                            ? 'top-0 -translate-y-1/2 text-xs leading-none'
                            : 'top-1/2 -translate-y-1/2 text-base leading-[23px] tracking-[0.15008px]',
                        labelClassName,
                    )}
                    htmlFor={id}
                >
                    {label}
                </label>
                <input
                    className={cn(
                        'h-14 w-full min-w-0 bg-transparent px-[14px] pb-[16.5px] pt-[16.5px] text-base leading-[23px] tracking-[0.15008px] text-foreground outline-none placeholder:text-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                        inputClassName,
                    )}
                    data-slot="outlined-input-field"
                    id={id}
                    onBlur={(event) => {
                        setIsFocused(false);
                        onBlur?.(event);
                    }}
                    onFocus={(event) => {
                        setIsFocused(true);
                        onFocus?.(event);
                    }}
                    value={value}
                    {...props}
                />
            </div>
            {errorText ? (
                <p className="mt-[3px] pl-[14px] text-xs text-destructive">
                    {errorText}
                </p>
            ) : helperText ? (
                <p className="mt-[3px] pl-[14px] text-xs leading-[19.92px] tracking-[0.39996px] text-secondary">
                    {helperText}
                </p>
            ) : null}
        </div>
    );
};

export { OutlinedInputField };
