import { useId } from 'react';

import { FieldContext, useFieldA11y } from './fieldContext';

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand dark:focus:ring-brand/20';

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

export const TextInput = ({ className, ...props }) => {
  const a11y = useFieldA11y(props);
  return <input className={`${inputCls} ${className ?? ''}`} {...a11y} />;
};

export const Textarea = ({ className, ...props }) => {
  const a11y = useFieldA11y(props);
  return <textarea className={`${inputCls} ${className ?? ''}`} {...a11y} />;
};

export const Select = ({ className, children, ...props }) => {
  const a11y = useFieldA11y(props);
  return (
    <select className={`${inputCls} ${className ?? ''}`} {...a11y}>
      {children}
    </select>
  );
};