import React from 'react';

export function LoadingFallback() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background pointer-events-none">
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center h-16 w-16">
          <div className="absolute h-full w-full border-4 border-muted rounded-full"></div>
          <div className="absolute h-full w-full border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">Initializing Systems</h3>
            <p className="text-xs text-muted-foreground max-w-[250px] animate-pulse">Loading core modules and verifying connection...</p>
        </div>
      </div>
    </div>
  );
}
