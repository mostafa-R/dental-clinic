import { createContext, forwardRef, useContext, useId } from 'react';

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand dark:focus:ring-brand/20';

const FieldContext = createContext(null);

function useFieldA11y(props) {
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

export function Field({ label, htmlFor, hint, error, required, children, className }) {
  const autoId = useId();
  const fieldId = htmlFor || autoId;
  const hasError = Boolean(error);
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedById = hasError ? errorId : hint ? hintId : undefined;

  return (
    <FieldContext.Provider value={{ fieldId, describedById, hasError, isRequired: Boolean(required) }}>
      <div className={className ?? ''}>
        {label && (
          <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
            {required && <span aria-hidden="true" className="text-red-500"> *</span>}
          </label>
        )}
        {children}
        {!hasError && hint && <p id={hintId} className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
        {hasError && <p id={errorId} className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}

export const TextInput = forwardRef(function TextInput({ className, ...props }, ref) {
  const a11y = useFieldA11y(props);
  return <input ref={ref} className={`${inputCls} ${className ?? ''}`} {...a11y} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  const a11y = useFieldA11y(props);
  return <textarea ref={ref} className={`${inputCls} ${className ?? ''}`} {...a11y} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  const a11y = useFieldA11y(props);
  return (
    <select ref={ref} className={`${inputCls} ${className ?? ''}`} {...a11y}>
      {children}
    </select>
  );
});