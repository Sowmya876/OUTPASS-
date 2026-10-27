# OutPass verification record

Verified on 27 October 2026.

## Vercel/Render cloud preparation — latest verification

- Prepared root-level vercel.json (workspace build, client/dist output, SPA rewrite), render.yaml (single Node web service, health route, secret placeholders/generated cloud JWT, manual deploy trigger), .vercelignore, and explicit Node 24 runtime configuration. No provider resources were created, no remote actions performed, and no Git push occurred.
- Production server configuration now reads hosting environment variables rather than private local .env/selectors, requires an exact HTTPS CLIENT_ORIGIN and validates PORT. Express explicitly binds 0.0.0.0. Local development configuration remains available and local health endpoints on ports 5000/5173 still returned HTTP 200.
- Vercel builds validate VITE_API_URL as a public HTTPS API origin. Local builds retain the existing relative API/proxy behavior; no unknown Render URL was hardcoded or written into the local frontend environment.
- Backend readiness now awaits ping plus connectionStatus confirmation of an authenticated database user before professor setup/readiness. Added an optional read-only db:ping server command. Both positive authentication-enabled temporary MongoDB and anonymous/failing-ping rejection cases were verified; this is not an Atlas/Render connectivity claim.
- Final regression run: **42 passed, 0 failed**, including all prior H1/H2, authorization, role-switch, quota/concurrency, QR/gate, onboarding and React interaction coverage plus five hosting/configuration/readiness tests. Tests use isolated databases and did not seed or repair the working local demo.
- Frontend production build: **passed**. Built client/dist contains only index.html and generated assets. Read-only comparison found no known local demo passwords, Atlas URI or JWT secret in the static artifact, and no forbidden private filenames. No secret values were printed.
- DEPLOYMENT_GUIDE.md documents safe future GitHub staging, dedicated Atlas user/database/network ranges, Render/Vercel settings and commands, authenticated Render-side ping release gate, HTTPS/CORS/SPA behavior, public workflow acceptance tests, failure diagnostics and evaluation availability.
- Remaining unverified: actual Render-to-Atlas authenticated connection, deployed HTTPS/CORS/proxy topology, Vercel route-refresh behavior, provider availability and physical camera scanning. No public hosting deployment is claimed.

## Approved H1/H2 pre-deployment fixes — latest verification

- H1: both ordinary seed entry points now run a shared target guard before connection/writes. Regression subprocesses exercised normal seed, admin seed and admin recovery with Professor Demo Mode both enabled and disabled against an isolated professor-named database; refusal left fixture users unchanged and added no leaves or mail previews.
- H2: demo authentication no longer prepares leaves. Authenticated Student-only sample preparation is separate; every role can read capacity status. The frontend displays a capacity notice without preventing login, dashboard access or switching. Student preparation refreshes the existing request table when a sample is created.
- Manual submissions and sample preparation share a database-unique quota-slot allocator. Historical unnumbered records are counted without modifying them. Concurrent manual requests, concurrent sample preparation, mixed creation paths and mixed historical/numbered fixtures respect the 200-request cap. Invalid input consumes no quota.
- Full regression run: **37 passed, 0 failed** using isolated temporary MongoDB databases and the existing cached binary. Coverage includes all four demo logins/switching at capacity, previous-token revocation, Student submission, Warden approval/rejection, QR generation/validation, checkout/return, duplicate prevention, Admin read-only restrictions and existing normal authentication/onboarding protections.
- Actual React DOM interaction tests passed before and at capacity through a real isolated Vite/Express stack: all four role buttons reach their dashboards, Student sample creation refreshes the table, capacity messages are visible and switching still invalidates older tokens.
- Frontend production build: **passed**. No deployment, live seed script, account repair, credential rotation or live mutating API verification was performed. Tests did not target the persistent working local databases. Atlas credentials and JWT_SECRET were not edited.
- Other audit recommendations remain outside this approved scope. Hosted database access, HTTPS, SPA/API routing and proxy settings still require deployment-environment verification. Camera and visual browser/device testing are not established by DOM simulation.

## Professor Demo Mode — latest verification

- Implemented explicitly gated DEMO_MODE with APP_ENV=demo and a separate outpass_professor_demo database. Disabled by default in source and ordinary deployments. Local demo setup writes only a gitignored private selector/URI file; existing normal local accounts, Atlas URI and JWT_SECRET are preserved.
- Verified dedicated professor database account cannot read original outpass_local_demo (MongoDB Unauthorized) and all four original fictional password-login accounts remain there.
- Login page has four Explore Demo cards, each calling the real backend demo authentication endpoint. All demo dashboards display Switch Demo Role. Switching atomically revokes the previous server session version; logout revokes the session. Tokens expire after 30 minutes. No frontend passwords, JWT secrets or embedded privileged tokens were added.
- Demo Admin is read-only; write/import/invitation/password/recovery endpoints are denied. Demo-mode queries exclude unmarked data; normal deployments reject demo tokens and omit demo records. Setup refuses a database containing unmarked users/leaves and readiness remains false until initialization succeeds.
- Real clock checkout validation is unchanged. A uniquely keyed fictional seed request starts one minute before preparation and returns four hours later. Completed history is retained, with a fresh pending seed for the next evaluation. A checked-out overdue pass can still return.
- Live localhost:5173 demo workflow passed: Student -> Warden approval -> Student PNG QR/token -> Guard validation/checkout/return -> read-only Admin. Every previous token was rejected after switching. A fresh pending demo request was left ready. Endpoint discovery returns all four roles; only marked fictional users exist in the demo database.
- **28 tests passed, 0 failed** in the final regression run. Includes actual React DOM clicks on all four cards through Vite/Express, correct dashboard headings, Switch Demo Role, hidden Admin editing links, old JWT rejection and logout. This is a DOM simulation, not visual Chrome or physical camera testing.
- Production frontend build passed after final code changes. jsdom was added only as a development/test dependency; installation reported zero vulnerabilities.
- Deployment variables, separate database permissions, SPA hosting rewrites, backend proxy/rate-limit settings and local enable/disable commands are documented in PROFESSOR_DEMO.md. No public hosting deployment was performed.

## Immediate local demo login repair — latest result

- Repaired the four existing fictional local demo accounts in place, preserving IDs and history. Each now has a unique cryptographically random password hashed with bcrypt, its correct role, activatedAt set, invitationStatus activated, and requiresPasswordChange false. Older sessions and password setup tokens were invalidated. Atlas credentials, JWT_SECRET and production authentication were not changed.
- Current credentials are saved only to DEMO_LOGIN_CREDENTIALS.txt in the project root, as explicitly requested. No activation is needed. Windows owner-only ACLs, Git ignore exclusion and Vite file-serving denial are applied. Verified the ignore rule with git check-ignore in an isolated temporary repository. Actual Vite /@fs access to the credentials file returned HTTP 403.
- Re-read the private file without printing it and verified Student, Warden, Guard and Admin each received HTTP 200 from http://localhost:5173/api/auth/login with the correct role, unrestricted activated status and a bearer token. Authenticated /auth/me and Admin dashboard API also passed in setup verification.
- Verified complete live local request -> approval -> QR -> checkout -> return workflow, both student movement timestamps, and returned-state persistence after reconnect. Backend and Vite health checks use the persistent local authenticated database. No backend restart was needed.
- npm test: **23 passed, 0 failed** outside the sandbox. New tests cover repeatable repair, file contents without secret output, unique bcrypt credentials, stable account IDs/history, old session/token revocation, all-role login, and refusal in Atlas, production, remote-host or wrong-database modes. Initial sandbox runs could not reread owner-only credential files; the unrestricted run passed.
- Production build: **passed** outside the sandbox after its parent-directory read restriction.
- Repeat setup with npm run demo:local. This rotates only the four fictional local demo passwords and rewrites the private credentials file. Do not use the older activation HTML or server/.env.demo credentials for the newly repaired local accounts.

## Persistent local development fallback — current running demonstration

- Selected explicit local mode without changing server/.env, Atlas MONGODB_URI or JWT_SECRET. The selection is stored separately in gitignored server/.env.database-mode.
- No Windows MongoDB service/Community installation was found. Started the already available real Community 7.0.24 mongod executable directly, with persistent WiredTiger data under .local-mongodb/data, --auth and --bind_ip 127.0.0.1. Runtime does not use mongodb-memory-server. Private setup credentials create a separate read/write app user scoped to outpass_local_demo.
- Authenticated persistent local MongoDB ping passed. Four fictional accounts were created, activated and successfully logged in through the running Vite proxy: Student, Warden, Guard, Admin. Authenticated /auth/me succeeded for all four; the Admin student-dashboard API succeeded.
- Complete live local workflow passed through port 5173: submit request -> warden approval -> PNG QR/token -> guard validation -> checkout -> student checked_out -> return validation -> return -> student returned with both timestamps. Returned state also survived MongoDB disconnect/reconnect. No Atlas data was touched.
- Password verification values were generated randomly in memory, discarded, and never printed or stored as plaintext. Private single-use reset links for choosing user-owned demo passwords are in server/.env.local-demo.html. No emails sent. These links require user setup and expire in 30 minutes; npm run demo:links renews them without overwriting existing passwords.
- Current backend uses local mode on port 5000; frontend on port 5173. Stale Atlas-mode backend watchers were stopped to remove port conflicts.
- npm test: **21 passed, 0 failed**, including new local-mode loopback/production/Atlas-preservation guards. npm run build: **passed** outside the sandbox after a sandbox parent-directory read restriction.
- Physical camera scanning and direct browser UI interactions are not established by the HTTP integration tests. See the final task response for any subsequent browser verification result.
- Commands, private files, supported Windows installation instructions and switching back to Atlas are documented in LOCAL_DEMO.md. Local mode is rejected in NODE_ENV=production; failures never silently switch databases.

## Browser login incident — latest checks

- Reproduced the reported shared failure on the running frontend: port 5173 returned HTTP 500 with an empty `text/plain` body for `/api/auth/login`; port 5000 had no listener. This triggered the shared API client's JSON parsing fallback. It was not an HTML response or an individual account failure.
- Backend startup failed before listening because Atlas rejected TLS on all three nodes (`ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`), before database authentication. SRV/TXT DNS lookups and TCP connections succeeded. Windows DNS matched public DNS. Certificate-verified Node default TLS, TLS 1.2, direct resolved-IP TLS with SNI, and Windows TLS all failed. The precise cause of the remote/network rejection is not established; do not treat an IP access-list mismatch as proven.
- User confirmed the exact current outbound IP is Active in the correct Atlas project; a subsequent connection still failed. User is already using a phone hotspot; do not recommend switching to a hotspot again.
- Further hotspot checks: both public resolvers return the same three node IPv4 addresses and no IPv6 addresses. Forced-IPv4 TCP connects to all three nodes in 46–101 ms; certificate-verified TLS (default and TLS 1.2) gets fatal alert 80 on all nodes in 92–198 ms. Therefore a blanket outbound TCP 27017 block is not demonstrated. Three repeated HTTPS public-IP checks are consistent, but cannot establish the source IP Atlas observes on port 27017 or exclude destination-dependent carrier NAT.
- MongoDB's public status page reports MongoDB Cloud Operational and no new incident for 27 October 2026; it also lists an ongoing regional AWS Middle East incident. This does not verify this specific cluster's state. Authenticated Atlas deployment state and server-side connection observations remain unavailable to the agent.
- Exact failing step: IPv4 TCP connection succeeds, then the peer/network path rejects the TLS handshake before certificate verification or database authentication. Client-side tests cannot conclusively distinguish Atlas access enforcement, cluster-side availability, and a TLS-aware intermediary. A comparison using another trusted network or an already trusted VPN with an exact restricted Atlas egress-IP rule, or Atlas-side diagnostics, is needed to assign that final cause. No TLS or certificate bypass was attempted.
- Backend now listens independently of initial database connection, denies DB-backed API requests with HTTP 503 JSON while unavailable, and retries initial connection every five seconds. Existing TLS validation, authentication, JWTs and password-change restrictions remain enabled.
- Shared client now rejects non-JSON responses even when HTTP status is 200, preventing HTML/empty responses from being treated as a successful login. Optional API base URL trailing slashes are normalized.
- **20 tests passed, 0 failed**: the previous 17 regressions plus real Vite-to-Express login for Student/Warden/Admin/Guard, database outage/recovery through the same HTTP service, and the actual shared React API client handling login and rejecting HTML/empty success responses. Integration accounts and databases are isolated fixtures, not Atlas accounts.
- Production build passed after the API client change.
- Live Student and Warden login requests through port 5173 currently return JSON 503 because Atlas remains unavailable. Live Admin login is not verified: database access remains unavailable and no existing admin password is available locally. No account password was changed or activation link consumed.
- Vite proxy target is correct (`http://127.0.0.1:5000`); no active frontend `.env` file overrides it. Backend returns `{token,user}` matching the React login flow. Bearer authorization uses the Authorization header, not cookies. No CORS/auth/password-change bypass was introduced.
- Computer Use stopped because it could not reliably determine the current browser URL; direct browser UI interaction was not completed.
- Older live-service/Atlas statements below describe earlier checks and do not establish current availability. No live login success is claimed for this incident.

## Latest workspace re-verification — 27 October 2026

- Re-read the supplied guard/onboarding request and inspected the existing implementation; these features were already present.
- Re-ran `npm test`: **17 passed, 0 failed**, using isolated real temporary MongoDB databases. Coverage includes student submission, warden approval/rejection, QR generation, guard validation/checkout/return, concurrent duplicate prevention, student-visible persisted movement history, onboarding, activation, mandatory password changes, recovery, CSV, authorization and rate limits.
- Fixed a frontend display gap: student and warden request tables now show both actual checkout and return timestamps below the status.
- Re-ran `npm run build` after that change: **passed**. The sandbox blocked Vite parent-directory reads initially; the approved build outside the sandbox succeeded.
- Did not rerun live Atlas/demo logins, browser interaction, physical camera scanning, real SMTP delivery or dependency auditing in this verification run. Live-service statements below are the earlier verification record, not newly verified service availability.
- Preserved environment configuration, MongoDB URI and JWT secret. No real emails or student provisioning against Atlas were performed in this run.

## Automated checks

- npm test: **17 passed, 0 failed** against separate real temporary MongoDB processes.
- npm run build: passed after final frontend changes.
- npm audit --omit=dev: **0 reported vulnerabilities**.
- New dependencies were updated to patched current releases after their initial older versions triggered npm audit findings.

Coverage:
1. Health, valid/invalid login, JWT verification and role restrictions.
2. Request date validation, student ownership, pending pass access and invalid IDs.
3. Required rejection note and prevention of repeated warden decisions.
4. Complete student -> warden -> guard API workflow, QR generation, checkout and return.
5. Concurrent duplicate checkout and return: exactly one update succeeds.
6. Invalid tokens, early checkout, expired approval, overdue return and inactive/rejected passes.
7. Guard response privacy: email, leave reason and decision notes omitted; student history and both movement timestamps retained.
8. Existing demo-account preservation; future seeds use private activation previews instead of plaintext passwords.
9. Admin-only provisioning, college domain equality, duplicate detection and prevention of role injection.
10. Encrypted invitation previews, escaped email templates and single-use activation.
11. Mandatory first-login password change and rejection of leave/admin/gate access until setup.
12. Expired, superseded and concurrently reused activation links.
13. Generic recovery responses, 30-minute reset expiration, single-use reset and old JWT invalidation.
14. CSV quoted fields, wrong domains, duplicate records, malformed input, row limits and no imports on preflight validation failure.
15. Configurable college domain and refusal to transmit email merely because a global enable flag is true.
16. Recovery and login rate limits with clear JSON errors.
17. Legacy MongoDB user records missing newly added fields; password-change compatibility and activation persistence across disconnect/reconnect.

## Live Atlas checks

- Authenticated Atlas connection succeeded with the existing URI and JWT secret preserved. DNS resolvers remain 8.8.8.8 and 1.1.1.1.
- Phase 1 verified using the real application routes and existing demo accounts: submission -> approval -> student QR/token retrieval -> guard token validation -> checkout -> student CHECKED_OUT history -> return validation -> return -> student RETURNED history.
- Return-before-checkout and duplicate checkout rejected.
- One labeled fictional guard-workflow verification request retained. Its returned state and actual checkout/return timestamps were verified again after backend restart.
- After onboarding changes and API restart, existing student, warden and guard logins all passed against Atlas and did not require a password change.
- New onboarding endpoint reports test-preview delivery mode, and existing student access to the admin API is rejected.
- Initial admin account created in Atlas. Its private local activation HTML matches the unexpired hashed activation token in MongoDB. The link was deliberately NOT consumed; the owner must choose the admin password.
- No real SST student accounts were provisioned in Atlas and no real emails were sent. Onboarding provision/import/reset security tests use isolated temporary MongoDB databases and fictional fixtures.

## Running services

- Updated API http://127.0.0.1:5000/api/health: HTTP 200.
- Frontend http://127.0.0.1:5173: HTTP 200 for login, activation, onboarding and password-change routes.
- Frontend route HTTP responses confirm SPA delivery, not visual behavior.

## Not verified

- Physical camera scanning on a real device.
- Browser interaction and visual layout: no browser is connected to this session.
- Real SMTP delivery: intentionally disabled and not tested.
- The proposed sst.scaler.com institutional domain: configurable, but must be confirmed with the college.
- The owner's live admin activation and chosen-password sign-in remain the intended user setup step. Admin activation/login/provisioning behavior is covered by the isolated real-database test suite.

## Demonstration

1. Open server/.env.admin-activation.html locally in a browser, follow its link, choose a password, then sign in as ADMIN_EMAIL (default admin@outpass.demo).
2. Use Invite & import with authorized college records. Preview invitations in test mode; no email is sent. Activate the student from the private preview to demonstrate first-password setup.
3. Use existing demo accounts for leave request -> warden approval -> student QR/manual token -> guard validation -> confirm checkout -> validate again -> confirm return.
4. Use a departure a minute or two in the future and wait for it before checkout. Review the same student's history for both timestamps and RETURNED status.
