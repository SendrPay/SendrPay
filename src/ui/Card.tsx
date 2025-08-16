import React, { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  shadow = true,
  onClick,
}) => {
  const baseStyles = `
    bg-[var(--color-card)] rounded-lg border border-gray-800
    ${onClick ? 'cursor-pointer hover:bg-opacity-80 transition-all duration-200' : ''}
    ${shadow ? 'shadow-card' : ''}
  `;

  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={clsx(baseStyles, paddingStyles[padding], className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
};