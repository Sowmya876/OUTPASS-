# OutPass ? campus leave management

A MERN trimester project with student, warden, guard and administrator roles, and real MongoDB persistence. Existing `outpass/server` dependency files are preserved; the active application is in root `server` and `client`.

## Quick start

Requires Node.js 22.12+ (Node 24 supported), npm, and MongoDB Atlas or local MongoDB.

1. Run `npm install` in the project root.
2. Configure `server/.env` using `server/.env.example`. This workspace already has a locally generated JWT secret. Keep it private.
3. For Atlas, put your connection URI in `MONGODB_URI`, include a database name such as `outpass`, allow your IP in Atlas Network Access, and use an Atlas database user. URL-encode special characters in the database password. Never put the URI in the client or commit it.
4. Run `npm run seed`. It preserves existing fictional demo accounts. New demo accounts receive local, gitignored activation previews in server/.env.student-activation.html, server/.env.warden-activation.html and server/.env.guard-activation.html. Open the relevant preview, follow its link and set your own password. No new plaintext password is stored or logged.
5. Run `npm run dev`. Open http://localhost:5173. API: http://localhost:5000/api/health.

| Role | Fictional account | Email |
| --- | --- | --- |
| Student | Ananya Rao, CSE2026042, Maple Hostel B-204 | student@outpass.demo |
| Warden | Meera Iyer | warden@outpass.demo |
| Guard | Ravi Kumar | guard@outpass.demo |

The three Atlas demo accounts have now been created. Their generated credentials are saved locally in `server/.env.demo`, which is gitignored. Open that file in VS Code to sign in; do not share or commit it. Future `npm run seed` executions preserve existing accounts.

Existing demo passwords remain unchanged. New accounts use random hashed bootstrap credentials that are discarded; a single-use activation link lets the owner set their password. For a lost password, use Forgot password on the login screen; in test mode an administrator can view the encrypted email preview for students. Admin recovery is available through the local bootstrap command described below.

## Five-minute demonstration

1. Sign in as Ananya and create a request with departure **one or two minutes from now** and return later today.
2. Sign out; sign in as Meera, review the request and approve it.
3. Sign in as Ananya and open/download the QR pass. Copy the manual token if demonstrating on one computer.
4. After the departure time, sign in as Ravi, scan the QR or paste its token, validate, then confirm checkout.
5. Validate again: the next permitted action is return. Confirm return. Another validation is rejected.
6. Check student history and warden statistics. Demonstrate a rejection with a required explanatory note.

Use separate browser tabs if desired: authentication is kept in sessionStorage per tab. Duplicating a tab can copy its initial session, so log out and select another role. Camera scanning requires permission and localhost or HTTPS. Manual token entry provides the same backend verification.

## Commands

- `npm run dev`: API watch mode and Vite together.
- `npm run seed`: non-destructive demo-account creation.
- `npm test`: integration tests against a temporary **real MongoDB process**, separate from Atlas. First run downloads a MongoDB binary using mongodb-memory-server.
- `npm run build`: optimized frontend production build.
- `npm run start -w server`: backend without file watching.
- `npm run preview -w client`: inspect the built UI. For full API use during development, use `npm run dev`.

Vite proxies /api to port 5000. If you change the API port, update `client/vite.config.js`. For separate production origins, set `VITE_API_URL` at build time and `CLIENT_ORIGIN` on the API. Serve the frontend build with SPA fallback and proxy /api to Express. This project defaults to local demonstration rather than an Internet deployment.

## Architecture for viva

```text
client/src/main.jsx      Existing React routes, authentication and role dashboards
client/src/Onboarding.jsx Admin onboarding, activation and password recovery screens
client/src/api.js        REST helper; bearer token attached centrally
client/src/styles.css   Tailwind import and responsive visual styles
server/src/index.js     environment validation, DB connection, HTTP lifecycle
server/src/models.js    User and Leave Mongoose schemas
server/src/auth.js      JWT verification, account lookup, role checks
server/src/app.js       middleware, login, current user, error handling
server/src/leaves.js    leave, approval, pass and gate routes
server/src/seed.js      fictional account creation
server/src/onboarding.js Admin provisioning, CSV, activation and password recovery
server/src/mail.js       Branded templates, encrypted test previews, gated SMTP
server/src/seed-admin.js Local administrative bootstrap and recovery
server/test/            real-database API integration tests
```

React handles presentation; Express enforces all permissions; MongoDB stores users, decisions and movement history. No public registration endpoint: privileged roles are created through local setup only; administrators can provision students through the protected onboarding API.

State machine: **pending ? approved ? checked_out ? returned**, or **pending ? rejected**. Warden decisions can happen once. A 256-bit cryptographically random pass token is created on approval. It is shared only with its owning student; its SHA-256 hash is indexed for gate lookup. Raw token storage allows the student to retrieve the QR again, so protect database access. Lists never expose token fields. Treat the QR as a private bearer credential; guards should also check student identity. A copied QR cannot record the same movement twice.

Checkout is permitted only from departure through returnBy. Early and expired checkouts fail. An overdue student can always be checked back in. Gate mutations use a single conditional MongoDB update; two concurrent checkout or return requests cannot both succeed. Each action records its guard and timestamp.

Passwords are bcrypt-hashed. JWTs use an environment secret, HS256, issuer/audience verification and an eight-hour expiry. Requests read the current user role from MongoDB. Login is rate limited. Body sizes, dates, text fields and object IDs are validated. Helmet sets security headers. Session tokens live in sessionStorage, so do not inject untrusted HTML. Logout removes the browser token; JWTs are otherwise valid until expiration.

Lists show up to 300 most recent leave requests; gate history shows 50. This scope keeps the one-day project simple. No parent approvals, payments, SMS or AI.

## REST API

All endpoints except health/login require Authorization: Bearer <JWT>.

| Method /api path | Role | Purpose |
| --- | --- | --- |
| GET /health | public | DB readiness |
| POST /auth/login | public | email/password ? token/user |
| GET /auth/me | any | current account |
| GET /leaves | student, warden | own requests / all recent requests |
| POST /leaves | student | destination, reason, departure, returnBy |
| PATCH /leaves/:id/decision | warden | decision: approved/rejected; note |
| GET /leaves/:id/pass | owning student | token, QR data URI, leave |
| GET /stats | warden | total and status counts |
| POST /gate/validate | guard | token ? leave, nextAction, overdue |
| POST /gate/record | guard | token and action: checkout/return |
| GET /gate/history | guard | recent movements |

## Troubleshooting

- API exits: check server/.env and Atlas network/database-user access. Error logs deliberately omit the connection URI.
- API unreachable in UI: run both services from the root and use the Vite URL.
- Seed fails: configure Atlas first; no account is mocked.
- Test download fails: first-run tests need access to MongoDB's binary download server. They do not need Atlas credentials.
- Pass rejected before departure: wait for the chosen departure time; do not edit stored records to bypass validation.
- Camera unavailable: use localhost/HTTPS, allow camera access, close other camera applications, or paste the pass token.

References: [Vite guide](https://vite.dev/guide/), [Mongoose connections](https://mongoosejs.com/docs/connections.html).

## Verified Windows / Node DNS fix

On this machine, Node reported DNS resolver 127.0.0.1 while the Windows Wi-Fi adapter used 10.94.9.185. Node SRV queries failed with ECONNREFUSED through its default resolver. Explicit queries to the Windows resolver returned all three Atlas hosts and the TXT options. TCP port 27017 succeeded for all three hosts.

`MONGODB_DNS_SERVERS` is an optional comma-separated list of DNS server IP addresses in `server/.env`. It calls Node dns.setServers inside the backend process before connecting. It does not change Windows DNS. This workspace now uses the user-requested public resolvers `8.8.8.8,1.1.1.1`, verified with an authenticated Atlas ping and all three demo logins. Leave the setting blank on machines whose default Node resolver works. If you change networks and the configured resolver becomes unavailable, update or clear this setting and restart the backend. JWT_SECRET was preserved during this DNS fix.

The existing SRV URI authenticated successfully after this fix, so conversion to a standard URI was unnecessary. For a future standard-URI fallback, obtain it from Atlas; include all verified hosts on port 27017, TLS enabled, authSource=admin, and the replica set name verified from Atlas TXT records. Preserve the database path and applicable retry/write-concern options. Do not disable TLS certificate verification.

References: [Node DNS behavior](https://nodejs.org/api/dns.html), [MongoDB connection string formats](https://www.mongodb.com/docs/manual/reference/connection-string-formats/).

## College onboarding and admin demonstration

The proposed SST email domain is not independently verified. Set ALLOWED_STUDENT_EMAIL_DOMAIN in server/.env after confirming it with your institution; the default is sst.scaler.com. Domain checks apply to new student provisioning, not existing demo accounts. There is no public registration, and the admin API always assigns the student role regardless of submitted role fields.

1. Run npm run seed:admin. In this workspace the initial admin has already been created. Its activation preview is server/.env.admin-activation.html (gitignored).
2. Open that file locally in a browser, follow its activation link, and choose a password of at least 12 characters. The 24-hour link is single-use. Sign in using ADMIN_EMAIL from your environment, or admin@outpass.demo by default. No admin password is printed or saved.
3. Open Invite & import. Add an eligible student using their official college email, student ID, hostel and room. Use only records supplied by your college; never generate or scrape a recipient list.
4. In test mode, click Email preview for that student. It shows the branded invitation without sending it. Open activation / reset page to demonstrate password setup. Keep the preview and link private.
5. Before activation, protected leave and admin/gate APIs reject the account. After setting a password, the student can sign in and use the normal leave workflow. A first-login account marked as requiring password change is restricted to account lookup and password change until it completes setup.
6. CSV headers are name,email,rollNumber,hostel,room. Imports support quoted commas, at most 50 rows and 14,000 characters per request (also subject to the 16 KB JSON body cap). Domain, required fields, existing accounts and within-file duplicates are checked before import. Concurrent database conflicts or individual failures are reported per row; successful rows are retained. Do not blindly resubmit successful rows.
7. Activation status and invitation delivery/preview status appear in the student account table. New invitation invalidates earlier links.

New accounts get unique cryptographically random bootstrap credentials hashed with bcrypt and immediately discarded, never distributed as plaintext. The preferred activation-link flow sets the first usable password. Token digests and expiration are stored on the user; preview email bodies are AES-256-GCM encrypted using a key derived from the existing JWT secret. Keep the existing secret stable; rotating it invalidates sessions and the ability to open old previews. Raw links in local bootstrap HTML files are sensitive even though they are not passwords. Delete those local preview files after successful setup. Expired previews in MongoDB are removed by a TTL index.

Password reset uses a generic public response and a 30-minute single-use link. Completing reset/password change invalidates previous JWTs through a stored token version. New passwords are 12+ characters and at most 72 UTF-8 bytes to avoid bcrypt truncation. Normal password changes require the current password. In default test mode, students ask an authenticated admin to open their reset email preview. If an admin is locked out, a trusted local operator can run npm run seed:admin -- --recover to create a private reset preview. Existing admin credentials are not overwritten by ordinary bootstrap runs.

### Email delivery remains disabled

No real student emails have been sent. Default EMAIL_DELIVERY_ENABLED=false stores encrypted test previews only. Real SMTP is supported but not tested with a live mail provider. Do not enable it until the user explicitly authorizes the exact recipients and delivery. It requires EMAIL_DELIVERY_ENABLED=true, each exact address in EMAIL_AUTHORIZED_RECIPIENTS, MAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASSWORD. SMTP uses TLS/STARTTLS; debug logging is disabled. Addresses not explicitly authorized remain test previews even if the global enable flag is true. Admin and demo bootstrap always use local test previews. SUPPORT_EMAIL is a placeholder until the college provides a real contact.

### Additional API endpoints

| Method /api path | Access | Purpose |
| --- | --- | --- |
| GET /onboarding/info | public | Configured college domain and delivery mode |
| POST /auth/activate | single-use token | Set initial password or complete reset |
| POST /auth/forgot-password | public, rate limited | Prepare generic recovery response and side-channel reset |
| POST /auth/change-password | signed-in account | Current password plus new password; mandatory setup allowed |
| GET /admin/students | active admin | Student and activation statuses, latest 500 |
| POST /admin/students | active admin | Provision one college student |
| POST /admin/students/import | active admin | Validate and import CSV |
| GET /admin/students/:id/invitation | active admin | Private, unexpired test email preview |
| POST /admin/students/:id/invitation | active admin | Issue a fresh invitation for a pending student |

Guard responses now omit student email, leave reasons and warden decision notes. Existing leave history and atomic checkout/return behavior are preserved. The app does not add cancellation UI, but gate validation accepts only approved or checked-out passes; rejected or any other inactive state cannot be used.

Security workflow reference: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
