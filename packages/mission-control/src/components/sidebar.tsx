'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GitBranch,
  Bot,
  Activity,
  Database,
  Shield,
  Cpu,
  ScrollText,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/events', label: 'Events', icon: Activity },
  { href: '/memory', label: 'Memory', icon: Database, stub: true },
  { href: '/security', label: 'Security', icon: Shield, stub: true },
  { href: '/models', label: 'Models', icon: Cpu, stub: true },
  { href: '/logs', label: 'Logs', icon: ScrollText, stub: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-card border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-primary font-mono">VOLT OS</h1>
        <p className="text-xs text-muted-foreground mt-1">Mission Control v0</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.stub && (
                <span className="ml-auto text-[10px] text-muted-foreground">soon</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground font-mono">v0.1.0 — internal</p>
      </div>
    </aside>
  );
}
