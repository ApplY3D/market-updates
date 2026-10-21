# Realtime Fintech Dashboard

Angular dashboard for simulated market data. A Rust library compiled to WebAssembly generates trades and quotes inside a Web Worker; the worker aggregates them and the UI shows per-instrument metrics.

- Live demo: `https://<user>.github.io/<repo>/`
- Stack: Angular 22 (zoneless, signals, Signal Forms), Rust + wasm-bindgen, Vitest, GitHub Actions + Pages

## Run

Requirements: Node 24, pnpm 11, [rustup](https://rustup.rs) (the toolchain version is pinned in `rust-toolchain.toml` and installed automatically), [wasm-pack](https://drager.github.io/wasm-pack/).

```sh
pnpm install
pnpm start        # builds the Wasm package, serves on http://localhost:4200
pnpm test         # cargo test + Angular unit tests (incl. one that runs the compiled .wasm)
pnpm build        # production build in web/dist/market-dashboard/browser
pnpm format       # prettier + cargo fmt
pnpm lint:wasm    # rustfmt --check + clippy
```

## Architecture

```
Main thread (Angular)                          Web Worker
┌──────────────────────────────┐   commands    ┌──────────────────────────────────────┐
│ ProducerStore (signals)      │ ────────────► │ ProducerEngine                       │
│  runId gate, status, rows    │               │  every batch:                        │
│ Dashboard / Settings pages   │ ◄──────────── │   Wasm generate(n) → Uint32Array     │
└──────────────────────────────┘   snapshots   │   MarketMetrics.applyPacked          │
                                  (≤ 50 rows)  │   post snapshot, schedule next batch │
                                               └──────────────────────────────────────┘
```

| Path                          | Responsibility                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `wasm/market-gen`             | Rust generator: PRNG, per-instrument price/book state, packed output. No JS dependencies. |
| `web/src/app/domain`          | Framework-free TS: settings and limits, update decoding, metrics. Used by worker and UI.  |
| `web/src/app/producer/worker` | Worker entry, engine (generate → aggregate → emit → schedule), Wasm adapter.              |
| `web/src/app/producer`        | Command/event protocol, `ProducerStore`, Worker transport.                                |
| `web/src/app/features`        | Dashboard and settings pages.                                                             |

## Decisions

- **Integer cents everywhere.** The generator emits cents, and volume and notional (`Σ price × qty`) are summed as integers. Values are rounded only for display.
- **Metrics are calculated in the worker.** At the maximum rate (1,000 updates per 50 ms) the main thread receives at most 20 small snapshots per second, never raw updates. Every trade is counted in the worker, even though the UI refreshes once per batch.
- **Updates are packed into a `Uint32Array`.** Each update is 7 integer fields copied out of Wasm memory: no strings and no per-update objects crossing the boundary.
- **Each run has an id (`runId`).** Apply creates a new run with a new id and seed. The store ignores any event from an older run or from a replaced worker, so late results can't overwrite a new run.
- **The store owns the status.** Pause and resume update the status immediately and send a command. The worker doesn't send confirmations, so a late reply can't undo a newer action.
- **Pause and resume.** Pause cancels the batch timer. Resume runs a batch immediately and doesn't catch up on the paused time.
- **Batch timing.** Each batch is scheduled `interval − time spent on the last batch` later, with only one timer pending at a time, so batches never pile up.
- **Single producer.** One worker for the app's lifetime. It's created at startup and replaced only by Retry, or by Apply after an error. The old worker is terminated and its generator freed.
- **Seed.** Each run uses a random seed, shown in the UI. The Rust tests use fixed seeds and are deterministic.

### Generator model

Each instrument keeps a mid price and resting bid/ask quantities. For each update the generator:

1. picks an instrument at random (repeats within a batch are allowed);
2. moves the book quantities in a random walk that pulls them back towards an average;
3. moves the mid price by a normally distributed amount proportional to the price, nudged in the direction of the book imbalance;
4. quotes around the mid with a spread of at least 1 cent;
5. executes a trade at the bid or the ask (buys are more likely when the bid side is larger) and removes the traded quantity from that side.

Guaranteed: prices > 0, bid < ask, trade price = bid or ask, trade quantity ≥ 1, book quantities ≥ 0.

### Known limits

- Notional is a JS `number`, so it is exact up to 2^53 cents. With one instrument at the maximum rate and a mean trade of 41 units, that takes about 5 days at a $250 average price, or about 4 months at $10.
- Settings are not persisted across reloads (as the spec allows).

## Deployment

`.github/workflows/ci.yml` runs on every push, to any branch:

1. format check, clippy, Rust tests;
2. Wasm build and Angular tests;
3. production build with `--base-href /<repo>/`.

Pushes to `main` also deploy to GitHub Pages; other branches only build and test, because Pages hosts one site. `index.html` is copied to `404.html`, so deep links like `/settings` work.

One-time setup: **Settings → Pages → Source: GitHub Actions**.
