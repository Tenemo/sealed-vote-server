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

const outlinedInputClassName =
    'h-12 w-full min-w-0 rounded-[var(--radius-md)] border border-input bg-background px-4 py-3 text-base text-foreground transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/55';

const Field = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => (
    <div
        className={cn('flex w-full flex-col gap-2', className)}
        data-slot="field"
        {...props}
    />
);

const FieldDescription = ({
    className,
    ...props
}: React.ComponentProps<'p'>): React.JSX.Element => (
    <p
        className={cn('field-note', className)}
        data-slot="field-description"
        {...props}
    />
);

const FieldError = ({
    className,
    ...props
}: React.ComponentProps<'div'>): React.JSX.Element => (
    <div
        className={cn('text-sm font-normal text-destructive', className)}
        data-slot="field-error"
        role="alert"
        {...props}
    />
);

const OutlinedInputField = ({
    className,
    errorText,
    helperText,
    id,
    inputClassName,
    label,
    labelClassName,
    wrapperClassName,
    ...props
}: OutlinedInputFieldProps): React.JSX.Element => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const descriptionId = `${inputId}-description`;
    const errorId = `${inputId}-error`;
    const isInvalid = isInvalidInput(props['aria-invalid']) || !!errorText;
    const describedBy = [
        props['aria-describedby'],
        errorText ? errorId : undefined,
        !errorText && helperText ? descriptionId : undefined,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Field className={cn('group w-full', wrapperClassName)}>
            <label
                className={cn(
                    'flex items-center gap-2 text-sm leading-6 font-medium select-text group-has-[input:disabled]:cursor-not-allowed group-has-[input:disabled]:opacity-70',
                    labelClassName,
                )}
                data-slot="field-label"
                htmlFor={inputId}
            >
                {label}
            </label>
            <input
                {...props}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid || undefined}
                className={cn(
                    outlinedInputClassName,
                    className,
                    inputClassName,
                )}
                data-slot="outlined-input-field"
                id={inputId}
            />
            {errorText ? (
                <FieldError id={errorId}>{errorText}</FieldError>
            ) : helperText ? (
                <FieldDescription id={descriptionId}>
                    {helperText}
                </FieldDescription>
            ) : null}
        </Field>
    );
};

export { OutlinedInputField };
