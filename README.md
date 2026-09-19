# Hashlight

Hashlight is a browser-only constrained hash search tool. The existing HTML/CSS
interface and search controls remain in place. JavaScript owns the UI, worker
coordination, validation, and display; the MD5 computation is implemented in
C++ and compiled to WebAssembly.

## Requirements

- Node.js 18 or newer
- Emscripten SDK with `emcc`, `emcmake`, and `emmake` available in `PATH`

## Build the WASM engine

From the project root, activate Emscripten and run:

```text
npm run build:wasm
```

The command compiles `wasm/hash_engine.cpp` and copies the generated
`hash_engine.js` and `hash_engine.wasm` into `wasm/`. The browser loads these
files when a search starts.

## Run the project

```text
npm run serve
```

Open the local URL printed by `serve`. A static host can serve the same project
files; no backend is required. The `.wasm` file must be served as
`application/wasm`, which standard static hosts do automatically.

## Architecture

- `index.html` and `style.css`: existing UI and presentation.
- `js/app.js`, `js/validator.js`, and `js/constraints.js`: UI state, validation,
  search configuration, and candidate generation.
- `js/search-worker.js`: runs the search off the main thread and sends only
  periodic statistics/results to the UI.
- `js/wasm-hash.js`: initializes the Emscripten module and exposes the narrow
  `wasmHash(input, algorithm, hashType)` interface.
- `wasm/hash_engine.cpp`: C++ MD5 implementation and the constrained search
  engine. `start_search(target, packedConfig)` initializes one search,
  `search_step()` runs a short batch, and `pause_search`, `resume_search`, and
  `stop_search` control it. Candidate generation, MD5, comparison, attempt
  counting, time limits, and possibility limits stay inside C++.

## Premium accounts and Supabase

The top-right **Premium Login** control is optional: without Supabase
configuration the existing non-login search remains fully usable. For a
Vite-hosted build provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
through the hosting environment (or set `globalThis.SUPABASE_URL` and
`globalThis.SUPABASE_ANON_KEY` before loading `js/auth.js` for a static host).
The frontend never contains a service-role key.

Apply `supabase/migrations/001_premium_access.sql` with the Supabase CLI. It
creates profiles, singleton non-login settings, RLS policies, an automatic
three-row search-history trigger, and a protected role/limit update trigger.
Create the first admin privately in the Supabase SQL editor after registering
the intended account:

```sql
update public.profiles
set role = 'admin', approval_status = 'approved'
where id = (select id from auth.users where email = 'admin@example.com');
```

Do not expose an admin signup screen. Deploy
`supabase/functions/expire-pending-users` and schedule it hourly with Supabase
Cron/pg_cron; it uses `SUPABASE_SERVICE_ROLE_KEY` only as a server-side secret
to delete pending Auth users older than 24 hours.

Approved users get their database-configured limits before a search starts;
pending/disabled users remain on the non-login limits. Completed matches are
the only records written to `search_history`, and the database trigger keeps
the latest three.

## Verification

Build with `npm run build:wasm` (requires an activated Emscripten SDK), then
serve with `npm run serve`. The production build was compiled successfully
with Emscripten Release flags and exports the long-running search API. The
worker reports candidates/sec and MD5 hashes/sec (the rates are identical
because every attempted candidate is hashed) without reporting candidates
individually. Supabase approval/admin workflows require a configured project
and should be tested against the migration policies.

The current project only has MD5 enabled in the UI. The disabled SHA entries
remain unchanged and are rejected by the engine until their C++ implementations
are added.

## Development

Modify `wasm/hash_engine.cpp`, then run `npm run build:wasm` again. Do not add
a JavaScript hashing fallback: the production search path intentionally has one
source of truth, the C++ WASM engine.
