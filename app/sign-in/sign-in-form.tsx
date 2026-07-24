'use client';

// Magic-link sign-in form. Client component: it holds the email field state and
// calls the browser (anon) Supabase client's signInWithOtp. No server secrets
// here by construction (createBrowserClient reads only NEXT_PUBLIC_* env).
import { useState } from 'react';
import { createBrowserClient } from '@/lib/db/browser-client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function SignInForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(
    initialError ? 'That sign-in link did not work. Request a new one below.' : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setMessage(null);

    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus('error');
      setMessage('We could not send the link. Check the address and try again.');
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="state-card">
        <span className="state-badge">
          <span className="dot" />
          Link sent
        </span>
        <h2>Check your email</h2>
        <p>
          We sent a magic sign-in link to <b>{email.trim()}</b>. Open it to
          finish signing in. The link lands you back here automatically.
        </p>
        <p className="disclaimer">
          Local dev: outbound mail is captured by the local inbox (Inbucket) at
          http://127.0.0.1:56324 rather than actually delivered.
        </p>
      </div>
    );
  }

  return (
    <div className="state-card">
      <span className="eyebrow">Sign in</span>
      <h2>Get a magic link</h2>
      <p>
        Enter your email and we will send a one-time sign-in link. No password.
      </p>
      <form onSubmit={onSubmit} className="signin-form">
        <label className="signin-label" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="signin-input"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
        />
        {message ? <p className="signin-error">{message}</p> : null}
        <div className="state-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === 'sending'}
          >
            {status === 'sending' ? 'Sending...' : 'Send magic link'}
          </button>
        </div>
      </form>
      <p className="disclaimer">
        Local dev: the magic link is captured by the local mail inbox (Inbucket)
        at http://127.0.0.1:56324, not sent to a real mailbox.
      </p>
    </div>
  );
}
