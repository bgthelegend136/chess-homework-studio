'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'sign_in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      router.push('/dashboard');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-stone-800">Chess Coach</h1>
          <p className="text-sm text-stone-500 mt-1">Coach sign in</p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex gap-2 mb-6 border-b border-stone-100 pb-4">
            <button
              onClick={() => setMode('sign_in')}
              className={`text-sm px-3 py-1.5 rounded transition-colors ${mode === 'sign_in' ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode('sign_up')}
              className={`text-sm px-3 py-1.5 rounded transition-colors ${mode === 'sign_up' ? 'bg-stone-100 text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
                className="rounded border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {loading
                ? mode === 'sign_in'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'sign_in'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>

        {mode === 'sign_up' && (
          <p className="mt-4 text-xs text-center text-stone-400">
            Sign up is for the coach only. After setup, you can disable signups
            in your Supabase project settings.
          </p>
        )}
      </div>
    </div>
  );
}
