import { useState, useCallback, useEffect } from 'react';

interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: unknown) => boolean;
  message: string;
}

interface ValidationRules {
  [key: string]: ValidationRule[];
}

interface FormErrors {
  [key: string]: string;
}

interface UseFormValidationProps<T> {
  initialValues: T;
  rules: ValidationRules;
  onSubmit: (values: T) => void | Promise<void>;
}

export function useFormValidation<T extends Record<string, unknown>>({
  initialValues,
  rules,
  onSubmit,
}: UseFormValidationProps<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (name: string, value: unknown): string => {
      const fieldRules = rules[name];
      if (!fieldRules) return '';

      for (const rule of fieldRules) {
        if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
          return rule.message;
        }

        if (typeof value === 'string') {
          if (rule.minLength && value.length < rule.minLength) {
            return rule.message;
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            return rule.message;
          }
          if (rule.pattern && !rule.pattern.test(value)) {
            return rule.message;
          }
        }

        if (rule.custom && !rule.custom(value)) {
          return rule.message;
        }
      }

      return '';
    },
    [rules]
  );

  const validateAll = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    Object.keys(rules).forEach((key) => {
      const error = validateField(key, values[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [rules, values, validateField]);

  const handleChange = useCallback(
    (name: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [name]: value }));

      if (touched[name]) {
        const error = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    },
    [touched, validateField]
  );

  const handleBlur = useCallback(
    (name: string) => {
      setTouched((prev) => ({ ...prev, [name]: true }));
      const error = validateField(name, values[name]);
      setErrors((prev) => ({ ...prev, [name]: error }));
    },
    [values, validateField]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!validateAll()) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [validateAll, onSubmit, values]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setValues,
  };
}
