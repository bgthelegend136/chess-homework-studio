'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface TopNavProps {
  email: string;
}

export function TopNav({ email }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const links = [
    { href: '/dashboard', label: 'Assignments' },
    { href: '/students', label: 'Students' },
    { href: '/groups', label: 'Groups' },
  ];

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <nav className="flex items-center gap-1">
          <Link href="/dashboard" className="mr-4 text-sm font-semibold text-stone-800">
            Chess Coach
          </Link>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-stone-100 text-stone-900 font-medium'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500">{email}</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-stone-500 hover:text-stone-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
