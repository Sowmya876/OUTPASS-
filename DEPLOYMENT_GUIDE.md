# OutPass deployment: Vercel + Render + MongoDB Atlas

**Prepared only. Nothing has been pushed, provisioned or deployed. Carry out these steps only after deployment approval.** Existing local databases, Atlas credentials and JWT_SECRET must remain unchanged.

## 1. Project root and prepared hosting files

Use the folder containing the root `package.json`, `package-lock.json`, `client/`, and `server/` as the Git repository and both hosting project roots. Do not choose the legacy `outpass/server/` folder. Keep the root npm workspace lockfile.

| Setting | Vercel frontend | Render backend |
| --- | --- | --- |
| Repository/root directory | Repository root (`.`) | Repository root (`.`) |
| Runtime | Node 24.x | Node 24.14.0, matching the tested local runtime |
| Install/build | `MONGOMS_DISABLE_POSTINSTALL=1 npm ci --include=dev`, then `npm run build` | `npm ci --omit=dev` |
| Published output/start | `client/dist` | `npm run start -w server` |
| Health | Browser smoke tests | `/api/health` |

`vercel.json` specifies Vite, commands, static output and SPA fallback. `.vercelignore` excludes local private files from CLI uploads. `render.yaml` is an optional Blueprint with one Free web service and automatic deploys disabled. Applying a Blueprint still creates resources and performs its initial deployment: **do not apply it before approval**. The manual Render setup below is equivalent. `.node-version` pins Render's tested version; root package engines select Node 24.x on Vercel. No dependency versions were upgraded.

Source references: [Vercel Vite SPA configuration](https://vercel.com/docs/frameworks/frontend/vite), [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Render Node version selection](https://render.com/docs/node-version).

## 2. Safely prepare and push to GitHub — after approval

The working project currently resides in a Windows Temp extraction directory. Do not rely on that location as the only source copy. Prepare a durable private source checkout without moving or deleting the running local database. Do not copy private runtime files into a public repository. Never copy a live MongoDB data directory as a database backup.

Create an empty **private** GitHub repository without adding another README/lockfile. A public demo website does not require a public source repository. In the intended source root, the following are future commands, not commands executed by this task:

```powershell
git init
git branch -M main
git add .gitignore .vercelignore .node-version package.json package-lock.json
git add client server vercel.json render.yaml README.md TESTING.md
git add LOCAL_DEMO.md PROFESSOR_DEMO.md DEPLOYMENT_GUIDE.md
git status --short
git diff --cached --name-only
git ls-files --cached --ignored --exclude-standard
```

The last command must return no filenames. If it lists an already-tracked ignored file, stop and remove it from the index without deleting the local copy; seek help if unsure. Also examine the staged filename list: it must contain no `.env`/private `.env.*`, activation HTML, `DEMO_LOGIN_CREDENTIALS.txt`, `.local-mongodb` storage, or node_modules. `.env.example` files are intentional sanitized examples. Do not print or paste secret file contents or a full staged diff into chat.

For the existing working tree, these future checks should confirm ignore rules without revealing contents:

```powershell
git check-ignore DEMO_LOGIN_CREDENTIALS.txt server/.env server/.env.professor-demo server/.env.local-mongodb
```

Only after reviewing the staged filenames:

```powershell
git commit -m "Prepare isolated OutPass professor demo hosting"
git remote add origin <YOUR_PRIVATE_GITHUB_REPOSITORY_URL>
git push -u origin main
```

Replace the URL placeholder locally. If there is already Git history, inspect it for secrets before pushing; adding .gitignore cannot erase an earlier secret commit. No Git operations were performed during preparation.

## 3. Prepare a separate Atlas professor database and user

1. In Atlas, use a dedicated demo project/cluster if available, or a separate database in the existing Available cluster. Do not change the existing application's user, password, URI or records.
2. Name the new database exactly `outpass_professor_demo`, or an allowed suffix such as `outpass_professor_demo_review2`. Never import real student records. It can start empty; backend startup creates the fictional users and necessary collections/indexes idempotently. If using Atlas's Create Database UI, an empty `users` collection is sufficient; do not insert sample real users.
3. Create a **new database user**, separate from your Atlas website login and the existing application user. Assign only the built-in `readWrite` role on this exact demo database, not all databases, readWriteAnyDatabase, or Atlas Admin. Restrict access to the intended cluster where available. Avoid a temporary user that expires before evaluation ends.
4. Generate a unique password in Atlas and keep it private. Obtain the Node.js `mongodb+srv://` driver URI using this new user, specifying the demo database path. URL-encode reserved characters in the password when constructing the URI; never paste the real URI into Git or chat. Preserve Atlas TLS defaults and required driver options; do not add TLS/certificate bypass flags.
5. After creating the Render service in the next section, copy its **Outbound IP Addresses/CIDR ranges** from Render's service dashboard and add only those required ranges to Atlas Network Access. A service may use any address in its listed ranges. The laptop's current public-IP rule does not grant Render access. Do not use `0.0.0.0/0` as the default solution.
6. Wait for the entries to become Active, then deploy/retry the Render backend. The first Render attempt may remain unhealthy until its outbound ranges have been allowed; that is not proof of a code failure.

References: [Atlas database users and privileges](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/), [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/), [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses).

## 4. Create the Render backend — after approval

In Render choose **New → Web Service**, connect the private repository, select branch `main`, runtime Node, and use the repository root. Use the build/start commands in section 1 and health path `/api/health`. Do not run `npm run dev`, seed scripts, `demo:local`, or local mongod in the Render build/start command. Startup prepares only marked fictional professor users; ordinary seed scripts deliberately refuse this mode.

Use one instance. Free is the prepared default and has cold starts; choose a paid instance only if you explicitly decide to pay for steadier evaluation availability. Disable automatic deploys while preparing/evaluating. Do not attach the laptop's MongoDB files or rely on Render's ephemeral filesystem for persistence. All application data and demo session state belong in Atlas.

The Express server binds to `0.0.0.0` and uses Render's assigned PORT. Leave PORT unset unless Render requires an override; do not hardcode the public HTTPS port. See [Render web-service requirements](https://render.com/docs/web-services).

### Render environment variables

| Name | Value/action |
| --- | --- |
| `NODE_VERSION` | `24.14.0` (also in .node-version); coordinate future security patch upgrades with retesting |
| `NODE_ENV` | `production` |
| `APP_ENV` | `demo` |
| `DEMO_MODE` | `true` |
| `DATABASE_MODE` | `atlas` |
| `DEMO_MONGODB_URI` | Secret: the NEW demo-only Atlas URI from section 3 |
| `JWT_SECRET` | Secret: a NEW random secret of at least 32 characters for this cloud demo; use Render's secret generator. The Blueprint uses generateValue. Do not change/copy over the local secret. |
| `CLIENT_ORIGIN` | Exact final Vercel production HTTPS origin, no path or trailing slash |
| `EMAIL_DELIVERY_ENABLED` | `false`; demo code additionally forces delivery off |
| `TRUST_PROXY_HOPS` | `1` for the direct browser → Render proxy → Express setup; verify this topology before adding another proxy/CDN |
| `PORT` | Provided by Render; normally leave unset |
| `MONGODB_DNS_SERVERS` | Normally unset; do not blindly copy laptop-specific resolver workarounds |

Do not add normal-production MONGODB_URI, LOCAL_MONGODB_URI, SMTP credentials, private HTML files or DEMO_LOGIN_CREDENTIALS.txt. In production, config uses hosting environment variables and does not load the private local selectors or server/.env.

For initial URL bootstrapping, use `https://deployment-pending.invalid` as CLIENT_ORIGIN until Vercel assigns its production URL. This reserved non-existent origin permits no real frontend. Then replace it with the actual Vercel origin and redeploy Render before evaluation. No wildcard CORS is needed.

Keep the single-instance limit: rate limits are per process. `TRUST_PROXY_HOPS=1` trusts one hop, not every forwarded address; the API must be reachable only through Render's managed ingress. A different topology needs review, not `trust proxy=true`. Guidance: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/).

## 5. Prove Atlas works from Render

Do not assume Available cluster status, successful laptop tests, or a passing local build proves Render connectivity.

On each backend start, the app connects using the secret demo URI, awaits MongoDB `{ping:1}`, and checks `connectionStatus` for an authenticated database user before making the professor deployment ready. An anonymous successful ping is not accepted. Usernames and permissions returned by that check are not logged. See MongoDB's [connectionStatus reference](https://www.mongodb.com/docs/manual/reference/command/connectionstatus/). Look for these **Render-side** log messages:

```text
MongoDB authenticated connection and ping succeeded
MongoDB connected; OutPass is ready
```

Then open `https://<YOUR_RENDER_SERVICE>.onrender.com/api/health`: expect HTTP 200 JSON `{"status":"ok"}`. `/api/demo/info` must return enabled true and student/warden/guard/admin. A professor deployment stays HTTP 503 until its database ping and isolated setup succeed. Inspect actual Render logs, not the same messages from your local terminal.

On a plan with Render Shell access, optionally run `npm run db:ping -w server` **inside Render** for a read-only connection/ping check. It prints no URI, password or JWT. Free services do not provide Shell access, so startup logs plus the health endpoint are the required free-plan path. See [Render Free limitations](https://render.com/docs/free).

**Current status: no Render resource exists from this task, and no authenticated Atlas ping from Render has been observed. This remains a release gate.**

## 6. Deploy the Vercel frontend — after approval

1. Import the same private GitHub repository into Vercel. Choose the repository root, Vite framework, and Node 24.x. Keep Root Directory at the root; do not select legacy outpass/server or server.
2. The root vercel.json already supplies the install/build/output settings. Installation suppresses the test-only MongoDB binary postinstall download; it still installs Vite/build dependencies. No backend function is deployed to Vercel.
3. Add exactly this frontend variable for the Production environment:

| Name | Value |
| --- | --- |
| `VITE_API_URL` | `https://<YOUR_RENDER_SERVICE>.onrender.com` — backend origin only, no `/api`, trailing slash, credentials or query |

4. Deploy after approval. A Vercel build deliberately fails when VITE_API_URL is missing, localhost, non-HTTPS, or contains a path. Local npm run build/dev continue to work without this variable using the existing Vite proxy.
5. Copy the stable Vercel **Production** domain, set Render CLIENT_ORIGIN to that exact origin, and redeploy Render. Wait for its authenticated ping/health again. Then refresh the Vercel frontend.
6. Confirm assets load and browser Network requests go directly to the HTTPS Render API, not localhost and not `vercel.app/api`. Rebuild/redeploy the frontend whenever VITE_API_URL changes; Vite embeds it at build time.

Do not configure JWT_SECRET, DEMO_MONGODB_URI, database passwords, demo account passwords or tokens as VITE variables. VITE-prefixed variables are public build inputs. Vercel preview URLs differ from the configured production origin and are intentionally not allowed by Render's exact-origin configuration. Use the stable Production URL for the professor. If Vercel Deployment Protection is enabled, configure the intended sharing/access settings deliberately so the professor can open that Production URL without access to your hosting account.

The application uses JWTs in Authorization: Bearer headers and sessionStorage; there are no authentication cookies. Cross-domain login relies on CORS preflight allowing Content-Type/Authorization, not SameSite=None cookies or credentials:true. Role switching remains backend-authenticated and revokes the older demo session version.

## 7. HTTPS, CORS and React refresh routing

Use the provider's HTTPS frontend/backend domains and valid managed certificates. Render's ingress terminates HTTPS; Express listens on its internal assigned port. The application does not disable Atlas TLS or certificate verification.

Vercel rewrites frontend routes to index.html, enabling reload/direct navigation for `/login`, `/history`, and protected routes. Existing static assets are served from client/dist. With no session, a protected route should render and redirect to login; with a valid session, the app restores it through `/api/auth/me`.

The SPA rewrite is not an API proxy. VITE_API_URL must point at Render, or a mistaken frontend `/api` request will receive HTML. On Render, CLIENT_ORIGIN must exactly equal the browser's frontend origin, including https and any custom domain. Updating only one side causes CORS/demo-origin errors. Reverify both when adding a domain.

Publish only client/dist to static hosting. Root .gitignore and .vercelignore exclude private artifacts, but cannot repair already tracked secrets or unsafe manual uploads. Keep Vercel's output directory and Git staging checks as release gates.

## 8. Public professor acceptance checklist

Run only after resources are approved and deployed. These actions create/update fictional demo records.

- Confirm Render health is HTTP 200 after its authenticated Atlas ping. Confirm demo/info lists all four roles.
- Open the Vercel Production URL in a fresh browser tab. Click Student; verify the Student dashboard and Switch Demo Role banner. A separate authenticated Student preparation call should create a pending sample when quota permits.
- Switch to Warden and approve that same request. Also create and reject a separate fictional request with a rejection note.
- Switch back to Student, open the approved PNG QR pass and copy its manual token. Seed request departure covers the current evaluation time; manually submitted requests must have a future departure, so wait until that time before checkout.
- Switch to Guard; paste/validate the token, confirm checkout, validate again, then confirm return. Repeated checkout and return-before-checkout must be rejected.
- Switch to Student; refresh and confirm Returned plus actual checkout/return timestamps. Reload `/history` directly to verify the SPA rewrite and session restore.
- Switch to Admin. Only fictional students should appear, with no provision/import/security controls. Verify a demo Admin write request is rejected in an isolated staging check without putting JWTs in screenshots or chat.
- Verify the preceding role token is rejected after switching; logout clears the browser session and revokes its server demo session. Tokens are short-lived, not embedded frontend credentials.
- At the 200-request cap, authentication and switching must still work and a clear capacity notice must appear; new requests are blocked while existing approval/gate actions remain usable. Do not fill the evaluation database just to exercise this: the automated isolated regression suite covers it.
- Check phone layout, manual token fallback and actual-device camera permission/scanning on HTTPS. DOM tests do not establish physical scanning behavior.
- Restart/redeploy the Render backend and verify Atlas data/history survives and health returns to 200. Do not delete data or rerun ordinary seeds.

## 9. Diagnose failures safely

| Symptom | First checks |
| --- | --- |
| Render build cannot find workspace or lockfile | Root directory must be repository root; use root lockfile and listed commands |
| Node/engine/build tool error | Render NODE_VERSION/.node-version and Vercel Node 24.x; do not run the legacy nested server |
| Render cannot detect port | Start server workspace; assigned PORT must be numeric; server binds 0.0.0.0 |
| Health 503 | Wait for cold start, inspect Render-side ping/setup logs, verify Atlas user and network rules |
| Atlas authentication/TLS/DNS failure | Check NEW URI/database path, encoded password, least-privilege user, Active Render egress ranges and cluster status. Never disable TLS/certificate verification. Do not print the URI. |
| Demo database guard failure | Require APP_ENV=demo, DEMO_MODE=true and allowed database name; database must contain only marked fictional records. Do not delete real data to make a guard pass. |
| Explore Demo absent | Open Render demo/info; ensure enabled true, Render warm/healthy and frontend built with correct VITE_API_URL. Refresh after waking a cold backend. |
| Unexpected/invalid API response or HTML | Inspect request host and Content-Type. Requests must reach Render, not the Vercel SPA fallback. |
| CORS or demo-origin 403 | Compare actual Production origin and Render CLIENT_ORIGIN exactly; no wildcard or trailing slash. Verify preflight. |
| Refresh of history returns 404 | Verify root vercel.json was used and output is client/dist |
| All evaluators share a rate limit | Check proxy trust and real ingress topology; do not blindly increase trust or disable limiting |
| 429 request capacity | Login remains available; finish existing requests. A fresh isolated database suffix/user grant may be provisioned deliberately later; never reset production records. |
| Seed command refuses | Expected H1 protection. Professor startup prepares marked demo accounts automatically. |

Use status codes, safe error categories and masked logs when requesting help. Never paste passwords, Authorization headers, activation links, JWTs or database URIs.

## 10. Keep the evaluation available

- Do not rename domains, rotate the cloud JWT secret, change the database URI or alter the proxy topology during evaluation without a planned verification. The local JWT secret remains untouched.
- Free Render services sleep after 15 minutes idle and can take about a minute to wake. Before evaluation, open the backend health endpoint and wait for HTTP 200, then refresh the frontend. Do not promise an always-on service on the Free plan; a paid instance is an optional explicit choice if continuous availability is required. See [Free instance lifecycle](https://render.com/docs/free).
- Keep Atlas user/network entries valid, the cluster available, and provider usage limits within plan allowances. Avoid expiring database users/access rules before the professor finishes.
- Atlas is the persistent store. Render filesystem restarts do not delete its records. Do not upload local mongod data or run local database launchers in the cloud.
- Keep one API instance with the current per-process rate-limit store. Review a shared limiter before scaling. DB-backed sessions and quota-slot uniqueness already coordinate their own operations across instances.
- The demonstration is public/shared fictional data; concurrent visitors can change the same requests. The demo Admin is read-only. Do not introduce real records. Completed history is retained and quota is cumulative.
- Keep automatic backend deploys disabled during evaluation and avoid pushing frontend-changing commits until reviewed. Vercel Git integration can auto-deploy future pushes once connected; this task has not connected anything.
- When evaluation ends, disable the demo or retire only its dedicated resources through a separately approved process. Do not delete existing Atlas/local application data.

No cloud connectivity, hosted HTTPS/camera behavior, provider resource creation, GitHub push or public deployment is claimed by this preparation guide.
