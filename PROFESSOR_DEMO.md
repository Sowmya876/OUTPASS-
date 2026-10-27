# Professor Demo Mode

## What is implemented

The login page discovers `/api/demo/info`. Only an explicitly enabled demo backend displays Explore Demo with Student, Warden, Guard and Admin role cards. Every card calls `POST /api/auth/demo`, which issues a backend-signed, 30-minute bearer JWT for a fictional, bcrypt-backed demo user. There are no passwords, JWT secrets or pre-generated access tokens in the frontend bundle.

Every demo dashboard has Switch Demo Role. Switching atomically changes the server-side demo session and version: the previous token immediately stops working. Logging out revokes that session. Independent browser sessions do not sign each other out.

This is a public, shared fictional demonstration: visitors see the same demo workflow, not private individual workspaces. Use a separate deployment and database. The database must be named `outpass_professor_demo` or `outpass_professor_demo_<alphanumeric suffix>`. Startup refuses unmarked users or leaves and does not expose demo API data until setup passes. Queries additionally filter marked demo records; normal deployments reject demo users and exclude their data. The demo database account must have read/write access only to its dedicated database.

Demo Admin is read-only. Student provisioning, CSV imports, invitations, password changes, recovery and account activation APIs are denied in demo mode. Normal production authentication and onboarding are unchanged. Email transmission is forced off in demo mode.

## Local demonstration already prepared

1. Keep the persistent authenticated MongoDB process running (`npm run db:local`).
2. Run `npm run demo:professor`, then restart the backend. This explicitly selects a separate local database through private `server/.env.professor-demo`; it does not edit `server/.env`, the original local database or Atlas.
3. Run the API and Vite frontend (`npm run dev`) with no competing process on port 5000. Open **http://localhost:5173**. Use that exact origin, which matches the default CLIENT_ORIGIN.
4. Click Student. Authentication opens the dashboard independently of request creation. A separate Student-only preparation request creates a fictional pending leave if capacity permits; departure is one minute before preparation and return is four hours later. The dashboard refreshes when that request is ready.
5. Switch Demo Role → Warden. Review and approve that request.
6. Switch → Student. View pass and copy its manual token. Switch → Guard, paste the token, Validate pass, Confirm checkout; validate again and Confirm return.
7. Switch → Student to see returned history and timestamps. Switch → Admin for the restricted student list.

The checkout window uses the real server clock and existing gate validation; production validation is never bypassed. Opening the Student dashboard after a completed/rejected request prepares a new pending demonstration request when capacity permits and preserves history. Expired pending/approved seed requests are retained and replaced with a current request when quota permits. A checked-out pass remains returnable when overdue. A unique sparse database key prevents duplicate active sample requests during concurrent preparation.

### Pre-deployment availability safeguards

- Ordinary `npm run seed` and `npm run seed:admin` (including recovery) refuse Professor Demo Mode or a professor-demo database target before connecting or writing. Use only the dedicated professor setup for this database.
- `POST /api/auth/demo` authenticates/switches roles without creating or counting leave requests. The Student dashboard separately calls authenticated `POST /api/demo/request`; a preparation failure does not prevent login. Admin cannot use that creation endpoint.
- `GET /api/demo/status` reports the request limit and capacity notice to every demo role. At capacity, logins, role switching, read-only Admin and actions on existing requests continue normally. Only new creation is rejected, with a clear explanation.
- Both Student submission and automatic sample preparation use the same 200-slot allocator. A unique sparse `demoQuotaSlot` database index arbitrates concurrent inserts, including across backend instances. Historical records are not rewritten: unnumbered records reserve that many unused slots. Failed validation and duplicate sample preparation do not consume additional records or slots. The allocator works on standalone local MongoDB as well as Atlas without requiring transactions or resetting data.
- Existing data at or above capacity is preserved. No cleanup, deletion, credential rotation or migration script is required by these fixes. Run one consistent updated backend version; older versions that bypass the allocator must not remain active.

`npm run demo:professor` is repeatable and preserves the separate database user's credentials. Demo user seeding is idempotent: IDs, hashes and existing history remain unchanged. To return to the original password-based local application: `npm run demo:professor:off`, then restart the backend. Original DEMO_LOGIN_CREDENTIALS.txt accounts/data are retained in the original local database. Do not run the manual local demo repair against the professor database; its safety guard refuses that database name.

## Deployment settings

Create a dedicated demo backend and static frontend. Do not enable this on the real college deployment. The source is ready for hosting; no public URL was deployed by this task.

Backend variables:

| Variable | Required value |
| --- | --- |
| NODE_ENV | `production` on the hosted service |
| APP_ENV | `demo` |
| DEMO_MODE | `true` (default is disabled) |
| DATABASE_MODE | `atlas` for hosted MongoDB |
| DEMO_MONGODB_URI | Secret URI for the separate `outpass_professor_demo` database, using a demo-only least-privilege database user |
| JWT_SECRET | A unique random secret of at least 32 characters for this demo backend; retain the existing application's secret unchanged |
| CLIENT_ORIGIN | Exact HTTPS frontend origin, with no trailing slash |
| EMAIL_DELIVERY_ENABLED | `false`; code also forces delivery off in demo mode |
| PORT | Hosting provider's assigned port; defaults to 5000 |
| TRUST_PROXY_HOPS | Default `0`; set `1` only if the backend is reachable exclusively through exactly one trusted hosting reverse proxy. Set the actual topology, never blindly trust all forwarded headers. |
| MONGODB_DNS_SERVERS | Optional; leave unset unless the deployment actually needs working custom DNS resolvers |

The dedicated hosted demo does not need the real production MONGODB_URI, SMTP credentials, local private files or credential text file. Do not upload any `.env.*` files, DEMO_LOGIN_CREDENTIALS.txt, or `.local-mongodb` data to the static frontend. Use the hosting provider's secret environment settings. Atlas network access must allow that backend's egress; TLS and certificate verification stay enabled. The current laptop's Atlas TLS problem does not establish connectivity for a hosted backend.

Frontend build variable:

| Variable | Value |
| --- | --- |
| VITE_API_URL | HTTPS backend origin, no `/api` suffix or trailing slash; omit only when a same-origin reverse proxy forwards `/api` to Express |

Install from the project root with `npm ci --include=dev`. Build with `npm run build`; publish `client/dist` and configure SPA fallback rewrites to `index.html`. Start the backend with `npm run start -w server`. Vite's development proxy is not a production reverse proxy. Rebuild the frontend when VITE_API_URL changes. The backend URI contains the real credentials only in server-side secret storage, never in VITE variables.

Use one backend instance for the built-in per-process rate limits (40 demo logins and 180 other demo operations per IP per 15 minutes). Multi-instance hosting needs a shared rate-limit store or an equivalent trusted ingress limit before scaling. Demo sessions are stored in MongoDB, and old role tokens are revoked across instances. Demo leaves are capped at 200; the setup does not delete history to reclaim capacity. For a fresh evaluation environment, use a new allowed demo database suffix instead of deleting production or existing demo history. Place provider-level request limits on a public demo as well.

Set `DEMO_MODE=false` or omit it on normal deployments. Setting DEMO_MODE=true without APP_ENV=demo or a separate named demo database fails startup. Normal signup/login, bcrypt password verification, JWT validation, roles and production time-window rules remain active in the normal deployment.

## Verification

Automated backend tests cover disabled mode, isolation guards, idempotent setup, all four sessions, role permissions, stale token rejection, shared leave identity, QR generation/verification, duplicate checkout, return-before-checkout rejection, return timestamps, read-only Admin, hidden unmarked records, origin checks and rate limiting.

The React DOM integration test renders the actual App through a real Vite proxy and Express server, clicks all four cards, verifies the actual dashboard headings and role-switch banner, rejects old tokens and checks logout. It is simulated DOM interaction, not a visual Chrome or physical-camera test. The live local persistent professor database was also exercised through the frontend proxy for the complete workflow. No external hosting publication or real-device camera test is claimed.
