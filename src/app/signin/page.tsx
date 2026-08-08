'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setState('error');
      setMessage('This deployment has no database configured, so accounts are off. Everything else still works.');
      return;
    }
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <h1 className="text-[24px] font-semibold tracking-tight">Keep your receipts</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-600">
        Auditing works without an account and always will. Signing in adds one thing: your audits are kept, so you can
        see whether a given rule is getting worse over time.
      </p>

      {state === 'sent' ? (
        <div className="mt-7 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-[13px] text-emerald-900">
          Check <strong>{email}</strong>. The link signs you in and expires shortly.
        </div>
      ) : (
        <form onSubmit={send} className="mt-7 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border hairline bg-white px-3 py-2.5 font-mono text-[13px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={state === 'sending'}
            className="w-full rounded-md bg-ink px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-ink-soft disabled:opacity-50 transition-colors"
          >
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {state === 'error' && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{message}</p>
          )}
        </form>
      )}

      <p className="mt-8 font-mono text-[10.5px] leading-relaxed text-neutral-400">
        No password. We store your email, your rulesets, your receipts and what each audit cost us to run. Row-level
        security means no other account can read your rows. Delete an audit and it is gone, including its rule results.
      </p>
    </main>
  );
}
