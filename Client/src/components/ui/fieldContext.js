import { createContext, useContext } from 'react';

/**
 * Label/hint/error wiring shared by `Field` and every control that can sit
 * inside it.
 *
 * This lives in its own module so `Field.jsx` and `PasswordInput.jsx` can both
 * consume it without either file having to export a non-component — exporting
 * one would defeat React Fast Refresh for that file.
 */
export const FieldContext = createContext(null);

/**
 * Merge a control's own props with whatever `Field` provides, so a control
 * inside a `Field` is named, described and flagged invalid without every call
 * site repeating `aria-describedby` / `aria-invalid` by hand.
 */
export function useFieldA11y(props) {
  const ctx = useContext(FieldContext);
  if (!ctx) return props;
  const { fieldId, describedById, hasError, isRequired } = ctx;
  return {
    ...props,
    id: props.id ?? fieldId,
    'aria-invalid': hasError ? true : props['aria-invalid'],
    'aria-describedby': props['aria-describedby'] ?? describedById,
    'aria-required': isRequired || props['aria-required'],
  };
}