# Repository Guidelines

## Project Structure & Module Organization
- `server.js` and `shared/`, `utils/`, `tts/` hold the Express API, shared text-processing helpers, security utilities, and FastAPI TTS microservice.
- `client/` contains the Vite/React UI (`src/components`, `src/hooks`, `src/contexts`) plus static assets in `public/`.
- `data/` stores uploaded EPUB files; keep large samples out of Git.
- Integration aids live at the root: `docker-compose*.yml`, `Dockerfile`, and standalone diagnostics (`debug-chapter-extraction.js`, `test-*.js`).

## Build, Test, and Development Commands
- `npm run dev` — concurrently launches the Express API on 3001 and the React dev server on 3000 with hot reload.
- `docker-compose up --build` — spins up server, client, and Kokoro TTS (FastAPI on 5005) for parity testing.
- `npm run build` then `npm start` — produces the React production bundle and serves it via Express.
- `npm run dev:server` / `npm run dev:client` — run either layer alone when isolating regressions.
- `cd client && npm test` — executes the Jest/Vitest suite.
- `node test-epub-functionality.js` and `node test-tts-server.js` — quick sanity checks for parser and TTS proxy logic.

## Coding Style & Naming Conventions
- JavaScript/JSX only; keep imports relative to `client/src` and `shared/`.
- Frontend uses 2-space indentation; backend and utilities use 4 spaces and CommonJS modules.
- Name hooks `useX`, React components in PascalCase, and server helpers in camelCase.
- Sanitize EPUB input via `utils/htmlSanitizer` and reuse validation helpers instead of reimplementing checks.

## Testing Guidelines
- Favor `client/src/App.test.js` patterns: describe blocks per component and explicit voice/TTS mocks.
- Snapshot visual changes plus sentence-queue edge cases in `hooks/useTTS.test.*` when added.
- Maintain coverage of EPUB parsing branches before merging; tests should pass via `npm test` and the Node sanity scripts above.

## Commit & Pull Request Guidelines
- Follow the observed `type(scope): message` style (`fix(tts): …`, `feat(env): …`). Keep verbs in present tense and scopes narrow.
- Squash noisy WIP commits locally; PRs should describe the feature, include reproduction or validation notes, and reference related issues.
- Attach screenshots or terminal output for UI or CLI-facing changes, and confirm Docker plus local commands still work when touching runtime configuration.
