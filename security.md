Security Plan

Overview
- Goal: add production-ready security with local auth, HTTPS via Tailscale Funnel, hardened defaults, and observability through Grafana.
- Decisions locked in: local auth + SQLite user store; sessions via secure cookies; Prometheus + Loki stack added and wired to Grafana.

Plan (detailed, ordered)
- Step 1: Auth requirements and storage choice (completed)
  - What/why: define how users authenticate and where user records live; this affects security, scalability, and ops overhead.
  - Decisions:
    - Auth model: local email/username + password.
    - Session strategy: server-side sessions via secure cookies (safer for browser apps than JWT in local storage).
    - User store: SQLite (simple, file-based, good for single-node).
  - Code refs: `server.js` (auth middleware), `utils/` (password hashing + validation), `data/` (SQLite DB), `docker-compose*.yml` (if switching to Postgres later).
  - Outcome: local auth + SQLite chosen, Redis used for session store.

- Step 2: Auth backend (server-side)
  - What/why: add secure login/logout endpoints, session handling, and per-request auth gating.
  - Implementation:
    - Add dependencies: `express-session`, `connect-redis`, `bcryptjs` (or `argon2`), plus a small user data layer.
    - Create auth routes: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
    - Add `requireAuth` middleware and apply to API routes (all `/api/*` except `/api/auth/*` and `/health`).
    - Use secure cookies: `httpOnly`, `sameSite=lax`, `secure` in production; session rotation on login; short idle timeouts.
    - Add login rate limiting (separate from upload rate limit).
  - Code refs:
    - `server.js` (middleware + route wiring + `app.set('trust proxy', 1)` for secure cookies behind Funnel)
    - `utils/` (password policy + hashing helpers)
    - `shared/` stays untouched
    - `tests/` (add server auth tests)
  - Design choice rationale: sessions are simpler and safer for browser apps; Redis is already present.

- Step 3: Auth UI and client session handling
  - What/why: add a login screen and make the UI respect auth state.
  - Implementation:
    - Add `AuthContext` + `useAuth` hook to manage session state.
    - Add `LoginForm` component and route (`/login`).
    - Protect routes for book list/reader to require login.
    - Ensure fetch uses `credentials: 'include'`.
  - Code refs:
    - `client/src/contexts/AuthContext.jsx`
    - `client/src/hooks/useAuth.js`
    - `client/src/components/LoginForm.jsx`
    - `client/src/App.jsx` (route protection)
    - `client/src/index.jsx` (Auth provider)
  - Design choice rationale: centralized client auth state keeps routing and API access consistent.

- Step 4: HTTPS via Tailscale Funnel
  - What/why: terminate TLS at Funnel while the app runs HTTP internally.
  - Implementation:
    - Configure Funnel to forward `https://<yourname>.ts.net` to `http://localhost:3001`.
    - Ensure Express trusts proxy headers and uses secure cookies.
  - Code refs:
    - `server.js` (`app.set('trust proxy', 1)`, secure cookie settings, optional HSTS via Helmet)
  - Config refs:
    - Document Tailscale commands (`tailscale serve` + `tailscale funnel`) in `README.md` or `README-security.md`.
  - Design choice rationale: Funnel provides HTTPS without running an ingress proxy; cookies remain secure when proxy trust is set.

- Step 5: Security hardening (post-HTTPS)
  - What/why: tighten surface area for production.
  - Implementation:
    - Add `helmet` with CSP tuned for React.
    - Configure CORS to allow only the Funnel domain.
    - Add CSRF protection if cookie-auth is used.
    - Enforce strict request size limits for JSON and uploads.
  - Code refs: `server.js`, possibly `utils/security`.

- Step 6: Lock down internal services
  - What/why: keep Redis and TTS internal-only; avoid host-level exposure.
  - Implementation:
    - Remove published ports for Redis and TTS in all compose files.
    - Add an `internal: true` network for backend-only services.
    - Optionally enable Redis AUTH for defense-in-depth.
  - Config refs:
    - `docker-compose.yml`
    - `docker-compose.cpu.yml`
    - `docker-compose.gpu.yml`
    - `docker-compose.coreml.yml`

- Step 7: Logging and monitoring for Grafana
  - What/why: centralize logs + metrics for server, TTS, Redis, and container stats.
  - Implementation (recommended stack):
    - Metrics: add `/metrics` via `prom-client` in `server.js` and FastAPI metrics in `tts/`.
    - System/containers: add cAdvisor + node-exporter to Compose for container and host metrics.
    - Logs: ship logs to Grafana using Loki (and Grafana Agent/Alloy if preferred).
  - Integration:
    - Run Prometheus + Loki locally and add them as data sources in Grafana.
    - Provide dashboards (importable JSON) and scrape configs.
  - Config refs:
    - new `docker-compose.monitoring.yml` (or extend existing)
    - `server.js` for `/metrics`
    - `tts/` for FastAPI metrics
    - a `grafana/` folder with dashboards and scrape configs

- Step 8: Tests and validation
  - What/why: prevent regressions on auth paths and protected endpoints.
  - Implementation:
    - Server auth tests under `tests/`
    - Client auth UI tests under `client/src/App.test.js`
  - Commands:
    - `npm test` (client)
    - `npm run test:unit`
    - `node test-tts-server.js`
    - `node test-epub-functionality.js`
