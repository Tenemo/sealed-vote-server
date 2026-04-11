import * as React from 'react';

import { Input } from '@/components/ui/input';
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
        <Field className={cn('w-full', wrapperClassName)}>
            <label
                className={cn(
                    'flex items-center gap-2 text-sm leading-6 font-medium select-text',
                    labelClassName,
                )}
                data-slot="field-label"
                htmlFor={inputId}
            >
                {label}
            </label>
            <Input
                {...props}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid || undefined}
                className={cn(className, inputClassName)}
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
