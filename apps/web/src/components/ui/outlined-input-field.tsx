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
            <div className={cn('relative rounded-xl bg-background', className)}>
                <label
                    className={cn(
                        'pointer-events-none absolute left-3 z-10 inline-block text-secondary transition-all duration-150',
                        isFloating
                            ? 'top-0 -translate-y-1/2 px-2 text-xs font-medium leading-none'
                            : 'top-1/2 -translate-y-1/2 text-base leading-[23px] tracking-[0.15008px]',
                        labelClassName,
                    )}
                    htmlFor={id}
                >
                    {label}
                </label>
                <input
                    className={cn(
                        'relative z-[1] h-14 w-full min-w-0 rounded-xl border-0 bg-transparent px-4 pb-[15px] pt-5 text-base leading-6 tracking-[0.15008px] text-foreground outline-none placeholder:text-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
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
                <fieldset
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none absolute inset-x-0 bottom-0 top-[-5px] m-0 overflow-hidden rounded-[inherit] border px-2 text-left transition-colors',
                        isInvalid ? 'border-destructive' : 'border-input',
                        isFocused && !isInvalid && 'border-foreground',
                    )}
                    style={{ minWidth: '0%' }}
                >
                    <legend
                        className="transition-[max-width] duration-150 ease-out"
                        style={{
                            float: 'unset',
                            width: 'auto',
                            overflow: 'hidden',
                            padding: 0,
                            height: '11px',
                            fontSize: '0.75em',
                            visibility: 'hidden',
                            maxWidth: isFloating ? '100%' : '0.01px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <span
                            style={{
                                paddingLeft: 5,
                                paddingRight: 5,
                                display: 'inline-block',
                                opacity: 0,
                                visibility: 'visible',
                            }}
                        >
                            {label}
                        </span>
                    </legend>
                </fieldset>
            </div>
            {errorText ? (
                <p className="mt-2 px-2 text-sm leading-6 text-destructive">
                    {errorText}
                </p>
            ) : helperText ? (
                <p className="mt-2 px-2 text-sm leading-6 text-secondary">
                    {helperText}
                </p>
            ) : null}
        </div>
    );
};

export { OutlinedInputField };
