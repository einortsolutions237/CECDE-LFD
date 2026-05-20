import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <label className="text-sm font-semibold text-foreground">{label}</label>}
        <input
          className={cn(
            'w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-foreground shadow-sm placeholder:text-muted-foreground',
            error && 'border-destructive focus:ring-destructive/30',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <span className="text-xs font-medium text-destructive">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
