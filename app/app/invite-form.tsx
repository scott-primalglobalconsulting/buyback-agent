'use client';

// Minimal "invite a teammate by email" form. The only reach into the backend is
// the inviteByEmail server action — no Supabase/Anthropic on the client. The
// action does the owner check + email resolution + enumeration-safe messaging;
// this component only renders the outcome message it returns.
import { useState, useTransition } from 'react';
import { inviteByEmail } from './actions';

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (value === '') return;
    startTransition(async () => {
      const res = await inviteByEmail(workspaceId, value);
      setResult(res);
      if (res.ok) setEmail('');
    });
  }

  return (
    <form onSubmit={onSubmit} className="signin-form invite-form">
      <label className="signin-label" htmlFor="invite-email">
        Teammate email
      </label>
      <div className="invite-row">
        <input
          id="invite-email"
          className="signin-input"
          type="email"
          autoComplete="off"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Inviting.' : 'Send invite'}
        </button>
      </div>
      {result ? (
        <p className={result.ok ? 'invite-ok' : 'signin-error'} role="status">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
