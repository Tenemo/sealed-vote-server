import * as React from 'react';

import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '@/components/ui/field';
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
            <FieldLabel className={labelClassName} htmlFor={inputId}>
                {label}
            </FieldLabel>
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
