import React from 'react';

export function LoadingFallback() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading modules...</p>
      </div>
    </div>
  );
}
