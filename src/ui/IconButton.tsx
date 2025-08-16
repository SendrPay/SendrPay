import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center rounded-full border
    transition-all duration-200 focus:outline-none focus:ring-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  const variants = {
    primary: `
      bg-[var(--color-primary)] text-white border-[var(--color-primary)]
      hover:bg-[var(--color-primary-hover)] focus:ring-[var(--color-primary)]
    `,
    secondary: `
      bg-[var(--color-card)] text-white border-[var(--color-card)]
      hover:bg-opacity-80 focus:ring-[var(--color-primary)]
    `,
    ghost: `
      bg-transparent text-gray-400 border-transparent
      hover:bg-[var(--color-card)] hover:text-white focus:ring-[var(--color-primary)]
    `,
  };

  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  return (
    <button
      className={clsx(
        baseStyles,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
};