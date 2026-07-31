# Auth email — sender, template, and the rate limit that will bite you

Last updated: 2026-07-31 14:01 -0500

Sign-in is a magic link. Supabase Auth sends that email, so how it looks and who
it appears to come from are configured in Supabase, not in this codebase. The
template is version-controlled here anyway (`supabase/templates/magic-link.html`)
so it cannot drift from what is pasted into the dashboard.

## The part that actually matters

**The built-in Supabase mailer is rate limited to a handful of messages per hour
for the entire project, and Supabase states plainly it is not for production.**

That is not a cosmetic problem. If you test sign-in a few times and then send the
link to someone you want to impress, their magic link can silently fail to
arrive. They see a page that says "check your email" and nothing lands. Custom
SMTP raises the limit to whatever your provider allows and is the only way to
change the sender.

You also cannot change the built-in sender. `Supabase Auth
<noreply@mail.app.supabase.io>` is fixed until custom SMTP is configured.

## 1. Custom SMTP (changes the sender, removes the cap)

Any SMTP provider works. Resend and Postmark are the least friction for a single
transactional stream; both have a free tier adequate for a demo.

1. Create the account and **verify a domain you control**. Verifying a domain,
   not just an address, is what lets you send as `auth@yourdomain.com` and what
   keeps the message out of spam.
2. Add the DNS records the provider gives you — SPF, DKIM, and ideally DMARC.
   Wait for the provider to show the domain as verified before continuing.
   Unverified domains fail silently or land in junk.
3. Create an API key scoped to sending only.
4. In the Supabase dashboard: **Project Settings → Authentication → SMTP
   Settings**, enable custom SMTP and fill in:

   | Field | Value |
   |---|---|
   | Host | your provider's SMTP host (e.g. `smtp.resend.com`) |
   | Port | `587` |
   | Username | usually `resend` or `apikey` — provider-specific |
   | Password | the API key |
   | Sender email | `auth@yourdomain.com` (on the verified domain) |
   | Sender name | `Buyback Agent` |

   Paste the API key directly into that dashboard field. Do not put it in this
   repo, in `.env`, or in a chat window — Supabase stores it, and nothing in this
   codebase needs to read it.

5. Raise the rate limit under **Authentication → Rate Limits** once SMTP is live;
   the default stays low until you do.

For local development only, the equivalent lives in `supabase/config.toml` under
the commented `[auth.email.smtp]` block, reading the key from an env var. Hosted
Supabase ignores that file.

## 2. The email template

**Authentication → Email Templates → Magic Link.**

- Subject: `Your sign-in link for Buyback Agent`
- Body: paste the contents of `supabase/templates/magic-link.html`.

Keep `{{ .ConfirmationURL }}` exactly as written; Supabase substitutes it. If you
edit the template in the dashboard, mirror the change back into this repo or the
two silently diverge.

The template is deliberately old-fashioned HTML — tables and inline styles, a
light ground, and the link printed as visible text beneath the button. Outlook
ignores modern CSS, email dark mode inverts backgrounds without reliably
inverting text, and corporate scanners rewrite anchors. The 2×2 mark is drawn
with nested tables rather than an image because most clients block images by
default.

## 3. Redirect URLs

**Authentication → URL Configuration.** The link lands on `/auth/callback`
(`app/auth/callback/route.ts`), which exchanges the code for a session.

- Site URL: `https://buyback-agent.vercel.app`
- Redirect URLs: add `https://buyback-agent.vercel.app/**`, plus
  `http://localhost:3000/**` for local work.

A Vercel preview deployment has a different hostname on every push, so magic
links from a preview will not redirect unless that exact hostname is allowed.
Test auth on production or on a stable alias.

## Verifying it worked

Send yourself a link and confirm all four:

1. The sender reads `Buyback Agent <auth@yourdomain.com>`, not `supabase.io`.
2. The subject is the one above.
3. The message renders with the mark and the button, and the visible fallback URL
   appears beneath it.
4. Clicking lands on `/app` signed in, not on an error.

Then send one to a second address on a different provider (Gmail and Outlook
behave differently) and check it is not in spam.
