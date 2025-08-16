import React, { InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  suffix,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        <input
          className={clsx(
            `w-full px-3 py-3 bg-[var(--color-bg)] border border-gray-600 rounded-md
             text-white placeholder-gray-400 focus:border-[var(--color-primary)]
             focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-opacity-20
             transition-all duration-200`,
            icon && 'pl-10',
            suffix && 'pr-10',
            error && 'border-[var(--color-error)]',
            className
          )}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-sm text-[var(--color-error)]">{error}</p>
      )}
    </div>
  );
};