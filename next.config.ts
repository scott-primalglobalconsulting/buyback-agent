import type { NextConfig } from "next";

// Security headers applied to every response.
//
// Referrer-Policy is the one that matters most here, and it is a real leak
// vector rather than box-ticking: the magic-link callback URL
// (/auth/callback?code=...) carries a single-use auth code in its query string.
// Under the browser default of strict-origin-when-cross-origin that code is not
// sent cross-origin, but `no-referrer` guarantees no Referer header carries it
// anywhere at all, including to any resource added later.
//
// The rest close off clickjacking, MIME sniffing, and unrequested device
// access. There is no CSP yet: Next injects inline bootstrap scripts, so a
// correct policy needs nonce plumbing rather than a copied one-liner that
// either breaks the app or is permissive enough to be theatre.
const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
