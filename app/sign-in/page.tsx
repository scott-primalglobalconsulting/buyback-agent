import Link from 'next/link';
import { SignInForm } from './sign-in-form';

// Public sign-in surface (NOT under the /app gate). Server component so it can
// await searchParams (Next 16: searchParams is a Promise) and hand any
// callback error down to the client form, avoiding a useSearchParams CSR
// bailout. The form itself is a client component that owns the submit.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="page">
      <header className="site-head">
        <Link className="brand" href="/">
          Buyback Agent
        </Link>
        <nav>
          <Link className="nav-link" href="/demo">
            Try the demo
          </Link>
        </nav>
      </header>
      <main className="wrap">
        <SignInForm initialError={error} />
      </main>
    </div>
  );
}
