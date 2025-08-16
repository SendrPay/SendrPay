import React from 'react';
import { clsx } from 'clsx';

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const Segmented: React.FC<SegmentedProps> = ({
  options,
  value,
  onChange,
  className,
}) => {
  return (
    <div className={clsx(
      'inline-flex bg-[var(--color-bg)] p-1 rounded-lg border border-gray-700',
      className
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
            value === option.value
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-[var(--color-card)]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};