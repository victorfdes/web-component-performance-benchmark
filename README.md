# AngularJS vs Web Components in Forms

This browser benchmark compares two implementations of the same large, eagerly
rendered form: one implemented entirely in AngularJS and one implemented as a
Web Component mounted by an AngularJS directive.

The example is an insurance claim adjudication form with deterministic workloads
of 300, 1,000, and 3,000 prefilled controls. It does not hard-code a winner. A
run is valid only when both renderers produce the same canonical payload checksum.

## What is compared

Both variants bootstrap AngularJS 1.8.3 at the form boundary and share:

- the same four-request API chain;
- the same fixture bytes, form schema, values, and reference data;
- the same synchronous processing, rule evaluation, and validation;
- the same eager form shape, controls, and visual tokens;
- the same canonical payload builder and SHA-256 verification.

The boundary is the only intentional difference:

- **AngularJS:** `ngRepeat`, `ngSwitch`, `ngModel`, stable tracking keys, and
  one-time bindings for immutable metadata.
- **AngularJS + Web Component:** an AngularJS `claimFormHost` directive mounts
  one `<claim-form>` custom element. The element uses an open Shadow DOM,
  delegated events, locally owned state, and explicit methods/events at the
  AngularJS boundary.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run generate:fixtures  # regenerate deterministic static API responses
npm run typecheck
npm test
npm run build
npx playwright install     # first browser-test run only
npm run test:e2e
```

The generated production site is written to `dist/`.

## API chain

GitHub Pages cannot execute a backend, so each workload exposes a versioned,
same-origin static API under `public/api/<preset>/`:

1. `manifest.json` is fetched first.
2. Its response supplies the URLs for `schema.json`, `record.json`, and
   `reference.json`.
3. Those three resources are fetched in parallel.
4. The responses are consolidated by the shared main-thread pipeline.

The dashboard can add deterministic client-side latency before both request
stages and can select normal browser caching or `no-store`. It never calls an
external service, so the dataset cannot drift between runs.

## Metric definitions

**Ready to interact** is a project-defined measurement from browser navigation
start until all of the following are complete: API chain, consolidation and
processing, renderer binding, two animation-frame opportunities, and a
programmatically dispatched input event whose value is confirmed in renderer
state. It is not the retired standardized Lighthouse TTI metric.

**Payload build** measures renderer-state extraction, complete validation,
canonical object construction, and JSON serialization. SHA-256 hashing happens
after that timed section. The hash is used for equivalence, not included in the
payload-build duration.

The dashboard performs one discarded warm-up per renderer, alternates measured
run order, and reports median, p95, and median absolute deviation. A difference
within the measured noise is reported as inconclusive. Raw samples and runtime
metadata can be exported as JSON or CSV.

For credible results:

- keep the tab visible and the browser window in the foreground;
- close unrelated high-CPU work and noisy extensions;
- compare on every representative employee device and supported browser;
- repeat after production bundle, validation, or form-behavior changes;
- do not generalize one machine's result into a universal framework claim.

Optional Long Task API figures are reported where the browser supports them and
shown as unavailable elsewhere.

## GitHub Pages

The repository contains a Pages workflow that verifies, builds, and uploads
`dist/`. Its Vite base path is derived from `GITHUB_REPOSITORY`, supporting both
project sites and `<owner>.github.io` repositories.

After pushing the project to GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main` or run the workflow manually.

The local directory intentionally has no Git remote and this implementation
does not create or publish a repository.

## Compatibility and security note

The benchmark targets current Chrome, Edge, Firefox, and Safari. It does not
include IE11 or Web Component polyfills. AngularJS is end-of-life and npm may
report its known security advisory; this repository uses 1.8.3 intentionally to
represent the requested legacy runtime. Do not treat the demo as a recommended
foundation for a new production application.
