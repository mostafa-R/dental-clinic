import { forwardRef } from 'react';

export const buttonVariants = {
  primary:
    'bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-dark active:bg-brand-dark dark:bg-brand dark:hover:bg-brand-dark',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-brand/5 hover:border-brand/30 hover:text-brand-dark dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  outline:
    'border border-slate-300 text-slate-600 hover:border-brand/40 hover:bg-brand/5 hover:text-brand-dark dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800',
  ghost:
    'text-slate-600 hover:bg-brand/5 hover:text-brand-dark dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400',
  'danger-soft': 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15',
  'success-soft': 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/15',
};

export const buttonSizes = {
  xs: 'gap-1 rounded-lg px-2 py-1 text-xs',
  sm: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
  md: 'gap-1.5 rounded-xl px-3.5 py-2.5 text-sm',
};

const base =
  'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]';

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${base} ${buttonVariants[variant]} ${buttonSizes[size]} ${className ?? ''}`}
      {...props}
    />
  );
});

export default Button;