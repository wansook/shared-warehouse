# Operations Entrypoints

## Watchdog

Use the root watchdog as the only operational process supervisor:

```bash
node watchdog.js
```

`backend/watchdog.js` is intentionally deprecated and exits with an error to prevent two supervisors from managing the same backend process.

## Health Check

The backend exposes:

```text
GET /health
```

The root watchdog checks this endpoint every 15 seconds by default. On unhealthy status or timeout, it terminates the backend and restarts it with exponential backoff.

## Backoff Settings

Environment variables:

- `WATCHDOG_RESTART_DELAY_MS`: initial restart delay, default `5000`.
- `WATCHDOG_MAX_RESTART_DELAY_MS`: maximum restart delay, default `60000`.
- `WATCHDOG_CRASH_WINDOW_MS`: crash-loop accounting window, default `120000`.
- `WATCHDOG_HEALTH_INTERVAL_MS`: health probe interval, default `15000`.
- `WATCHDOG_HEALTH_TIMEOUT_MS`: health probe timeout, default `5000`.
- `WATCHDOG_LAUNCH_KIOSK=false`: disables Edge kiosk launch.
