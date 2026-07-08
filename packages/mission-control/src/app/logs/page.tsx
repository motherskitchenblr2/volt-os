'use client';

import { Sidebar } from '@/components/sidebar';
import { ScrollText } from 'lucide-react';

export default function LogsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">System logs and diagnostics</p>
        </div>
        <div className="bg-card border border-border rounded-md p-8 text-center">
          <ScrollText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Logs view — coming soon</p>
          <p className="text-sm text-muted-foreground mt-2">
            This section will provide access to system logs, error traces, and diagnostic information.
          </p>
        </div>
      </main>
    </div>
  );
}
