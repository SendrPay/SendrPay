import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200
    rounded-md border focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variants = {
    primary: `
      bg-[var(--color-primary)] text-white border-[var(--color-primary)]
      hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)]
      focus:ring-[var(--color-primary)]
    `,
    secondary: `
      bg-[var(--color-card)] text-white border-[var(--color-card)]
      hover:bg-opacity-80 focus:ring-[var(--color-primary)]
    `,
    outline: `
      bg-transparent text-white border-gray-600
      hover:bg-[var(--color-card)] focus:ring-[var(--color-primary)]
    `,
    ghost: `
      bg-transparent text-white border-transparent
      hover:bg-[var(--color-card)] focus:ring-[var(--color-primary)]
    `,
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm min-h-[40px]',
    md: 'px-4 py-3 text-base min-h-[48px]',
    lg: 'px-6 py-4 text-lg min-h-[56px]',
  };

  return (
    <button
      className={clsx(
        baseStyles,
        variants[variant],
        sizes[size],
        loading && 'cursor-wait',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
};