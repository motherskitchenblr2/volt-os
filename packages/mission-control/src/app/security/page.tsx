'use client';

import { Sidebar } from '@/components/sidebar';
import { Shield } from 'lucide-react';

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Security</h1>
          <p className="text-sm text-muted-foreground mt-1">Security engine and access control</p>
        </div>
        <div className="bg-card border border-border rounded-md p-8 text-center">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Security view — coming soon</p>
          <p className="text-sm text-muted-foreground mt-2">
            This section will provide visibility into security policies, access logs, and threat detection.
          </p>
        </div>
      </main>
    </div>
  );
}
