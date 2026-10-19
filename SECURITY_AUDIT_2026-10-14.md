# SecScan follow-up — 2026-10-14

The scan describes the **currently public** `hr-recruiter.ddns.net` host. At the time of verification its A record resolves to `37.60.247.120`; the prepared replacement host is `37.60.224.174`. The public site is still serving an older frontend build. Local changes in this report are **not live** until a release is deployed and public HTTPS is connected to the intended host.

## Code changes prepared

| Finding | Result |
| --- | --- |
| 1. Unused JavaScript | Dashboard, vacancy and candidate routes are loaded on demand. The main minified bundle fell from 561.37 KB to 427.08 KB (158.37 KB to 125.97 KB gzip). |
| 2. Forced reflow | Removed the duplicate Google button render after initialization, so its measured width is not read and rendered twice on first load. A browser performance trace is still needed to attribute the scanner's remaining reflow warning. |
| 3–4. Resource chain/render blocking | Google Fonts was moved from a CSS `@import` into HTML with preconnect. The font request uses `display=swap`. Other render blocking resources need a browser performance trace before further changes. |
| 6. Low contrast | The five identified auth text colors now calculate to 4.51:1–4.62:1 against white. |
| 7. HSTS | A 300-second HTTPS-only header is prepared in the domain proxy template and both app Nginx configurations. Production still needs to serve the new configuration. |
| 11, 18–20. SEO metadata | Added a root-only sitemap, robots policy for private routes, canonical URL, Open Graph tags and a 1200×630 PNG. |
| 12–13, 24. Small screens and type | Auth layout shrinks to 320px without horizontal overflow; reported microcopy is at least 12px; auth inputs are 16px. |
| 21. False 200 responses | Both Docker and rootless Nginx configurations now serve the SPA shell only for known client routes and return 404 for unknown URLs. |

## Findings requiring separate evidence or access

| Finding | Reason not changed blindly |
| --- | --- |
| 5. Unused CSS | The scan visited one route; the CSS also serves authenticated routes. Removing rules on that evidence could break the app. |
| 8, 14. DMARC/SPF | The configured SMTP sender does **not** use `hr-recruiter.ddns.net`. DNS records must follow the actual sender domain and provider; the sample records in the report are unsafe to publish unchanged. |
| 9, 10, 15. SSH/FTP | The reported address is the old public host. There is no administrative access to that host; its SSH package/patch level and FTP service cannot be changed from this checkout. |
| 16. CSP | The existing exception is already path-scoped to Google's `/gsi/client` script and is required by login. A nonce-based replacement needs a separate report-only rollout and a Google login test. |
| 17. DNSSEC | Depends on the DNS provider for the parent `ddns.net` zone, not on application code. |
| 22. Missing labels | Both login inputs and all four registration inputs currently have programmatic labels. Recheck the deployed build to identify any remaining field. |
| 25. Gray/color count | Aesthetic score, not a functional defect. A global palette replacement would affect the whole app and needs visual review of all screens. |
| 26. Structure tags | The new landing already has `header`, `nav`, `main` and `footer`. The public host serves an older build. |

## Verification

- Frontend production build completed.
- Frontend tests: 94 passed; landing browser tests: 5 passed.
- At 320px, landing/login/register had `scrollWidth === viewport width`.
- Login and registration fields had accessible labels and 16px computed font size.
- Both app Nginx variants passed syntax tests with the server's Nginx binary, using nonprivileged temporary configurations. A temporary rootless instance returned 200 for `/` and `/dashboard`, and 404 for an unknown URL.
- `robots.txt`, `sitemap.xml`, and `og-image.png` were present in the built output.
- Public host: `/api/health` returned 200, while `/robots.txt`, `/sitemap.xml`, and an unknown path still returned HTML/200 because the old release remains live.

## Deployment prerequisite

The replacement host runs the app on `127.0.0.1:8081` without sudo. Its user cannot bind ports 80/443, and the public hostname still points to the old IP. A hosting administrator must first expose HTTPS on port 443 with a valid certificate and forward it to `127.0.0.1:8081`. Verify the new host by DNS override before changing the public A record. Then deploy and smoke-test the new build, change DNS, and rerun SecScan. Keep the old host available until the cutover is verified.
