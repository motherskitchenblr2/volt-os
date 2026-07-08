'use client';

import { Sidebar } from '@/components/sidebar';
import { Database } from 'lucide-react';

export default function MemoryPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">Memory engine and state management</p>
        </div>
        <div className="bg-card border border-border rounded-md p-8 text-center">
          <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Memory view — coming soon</p>
          <p className="text-sm text-muted-foreground mt-2">
            This section will provide visibility into agent memory, context windows, and state management.
          </p>
        </div>
      </main>
    </div>
  );
}
