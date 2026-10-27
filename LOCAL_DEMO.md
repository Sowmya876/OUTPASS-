# Persistent local OutPass demonstration

Atlas remains the intended production database. `server/.env` (including its Atlas MONGODB_URI and JWT_SECRET) is unchanged. The local database is separate; no Atlas data is copied, deleted, or modified.

## Start locally

From the project root, in PowerShell:

1. `npm run db:local` — keep this terminal running. It starts a real MongoDB Community process with authentication, bound to 127.0.0.1:27017, using persistent WiredTiger storage under `.local-mongodb/data`. It does not use mongodb-memory-server or automatically select another database.
2. In another terminal: `npm run db:use-local`.
3. Stop existing OutPass API processes before `npm run dev`; otherwise port 5000 may still belong to an older database mode. The terminal must report `Database mode: local` and `MongoDB connected; OutPass is ready`. Use the frontend at http://localhost:5173.
4. Run `npm run demo:local`. It creates or repairs exactly the four fictional @outpass.demo accounts in local outpass_local_demo, assigns their intended roles, generates unique random passwords and bcrypt hashes, marks them activated, and verifies all four logins plus the complete leave workflow through the Vite proxy. Existing account IDs and request history are preserved. Every rerun rotates demo passwords and invalidates older sessions and activation/reset links.
5. Open `DEMO_LOGIN_CREDENTIALS.txt` in the project root locally. Copy the email and password for the desired role and sign in at http://localhost:5173. No activation link or manual account configuration is required. The previous server/.env.demo passwords and server/.env.local-demo.html links are not the current demo credentials.
6. The credentials file is deliberately readable plaintext at your request, for fictional local demos only. It is gitignored, restricted to your Windows account, and blocked by Vite's file-serving deny list. Do not share or commit it. It contains no database credentials, JWTs, or activation tokens. Production authentication rules and normal student onboarding remain unchanged.

Use separate browser profiles or private windows for different roles. Submit departure a minute in the future, approve as warden, copy the student's manual QR token, wait until departure, then validate/checkout as guard. Validate again and return. Refresh student history to see both timestamps and Returned. Physical camera scanning still requires a real-device check.

## Switch back to Atlas

Run `npm run db:use-atlas`, stop the API, then restart `npm run dev`. This selects the original Atlas URI and leaves local data intact. TLS and certificate validation remain enabled for Atlas. Atlas connectivity must be restored first; there is no automatic fallback. `DATABASE_MODE` set in the terminal or server/.env overrides the private selector, so clear any such override when using these commands. Production (`NODE_ENV=production`) rejects local mode.

## Local server and Windows installation

No installed MongoDB Windows service was found. This workspace already contained the MongoDB Community 7.0.24 executable downloaded for its regression tests. The launcher runs that executable directly with persistent disk storage and authentication; the test harness is not used. This avoids a system-wide installation for today's demo.

For a conventional supported Windows installation, follow MongoDB's official [Community ZIP instructions](https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-windows-zip/) or [MSI instructions](https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-windows/). Download from MongoDB, install/extract, and point the launcher at the installed executable:

```powershell
$env:MONGOD_PATH = 'C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe'
npm run db:local
```

Choose either the project launcher or a Windows service on port 27017; do not start both. The launcher fails rather than using another port/database if startup fails. It never disables authentication to recover existing data. Do not downgrade an existing data directory to an older MongoDB major version.

## Storage and security

- `.local-mongodb/data` is persistent and gitignored. Its logs are under `.local-mongodb/mongod.log`.
- `server/.env.local-mongodb` stores random database credentials privately. The app user has read/write access only to outpass_local_demo; separate setup credentials create that user. Do not delete this file while retaining the database, print its contents, or commit it.
- `server/.env.database-mode` stores only the explicit local/atlas selection and is gitignored.
- Local MongoDB is loopback-only with authentication. Its new local transport uses MongoDB's default loopback connection, not Atlas TLS; no Atlas TLS setting is disabled or changed. Use fictional data only. App passwords remain bcrypt hashes, and JWT/role/password-change protections remain active.
- This project currently lives in a Windows Temp extraction directory. Copy the project, its private configuration, and local data to a durable private folder before relying on it beyond today's demonstration. Stop MongoDB before copying its data directory.
