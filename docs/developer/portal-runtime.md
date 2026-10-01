# Portal Runtime

The portal backend is no longer a monolithic `server.py`. The runtime now lives under `portal/app/` and `portal/server.py` is a thin compatibility wrapper and CLI entrypoint.

## Package Layout

| Module | Purpose |
|---|---|
| `main.py` | FastAPI app factory, middleware, lifespan |
| `settings.py` | local and cloud settings validation |
| `auth.py` | Entra auth and role dependencies |
| `routers/` | public and authenticated route registration |
| `clients/` | admin-control-plane, agent, and Graph clients |
| `services/` | policy, scan, CA, and health orchestration |
| `storage/` | file and Blob-backed policy config persistence |

## Runtime Model

The app builds a single container object and stores it on `app.state`.

That container owns:

- settings
- pooled HTTP clients
- auth validator
- policy config store
- services

This replaced the old pattern of globals and ad-hoc caches inside one large file.

## Health Model

The portal exposes three different health surfaces on purpose:

| Route | Meaning |
|---|---|
| `/healthz/live` | process is running |
| `/healthz/ready` | required dependencies are ready |
| `/api/system-status` | authenticated dependency-level operational detail |

That split keeps readiness honest without overloading the public liveness contract.

## Cloud Versus Local

Local mode:

- may run without Entra auth
- uses `portal/portal-config.json`
- stores saved policy configs in `portal/policy-configs.json`

Cloud mode:

- requires admin-control-plane URL and management key
- requires Entra auth settings
- discovers agents from `admin-control-plane`
- stores policy configs in Azure Blob Storage through managed identity

## Storage Contract

Policy config persistence is intentionally different by environment:

- local development uses the file-backed store
- cloud runtime uses Blob storage for durability across revisions and restarts

The portal Container App managed identity must have Blob data permissions on the portal policy store.

## Request Handling Notes

- request IDs flow through to downstream dependency calls
- mutation routes are admin-only
- Graph failures are surfaced as real errors, not fabricated healthy state
- cloud startup should fail fast when required runtime configuration is missing

## Risk Settings

The Settings tab separates **Entra signal monitoring** from **local risk enforcement**:

- Signal monitoring defaults to On and reads Graph `identityProtection/riskyAgents`. The sidebar below LIVE HEALTHY reports On only after a successful read, Off after an explicit opt-out, and Unavailable on licensing, authorization, or network failures. Successful empty responses do not establish low risk for absent agents.
- Settings uses the portal's shared card, badge, and notification styles with keyboard-accessible switches. Provider failures show customer-facing licensing, permission, or availability messages; raw Graph responses and request IDs remain in server diagnostics, not Settings or sidebar tooltips.
- Both preferences are stored separately from named policy presets in `portal-runtime-settings/settings.json` using the existing managed identity, or the equivalent local file. Invalid or unreadable stored settings produce an error, not a silent fallback. The settings API reconciles the active sidecar risk mode to the saved preference after restart.
- Blob updates use the public `azure.core.MatchConditions` API for conditional ETag writes. Storage regression tests exercise the real SDK upload path; browser matrix case `browser.management.local.risk-settings` covers both switches and persistence across reload.
- Local enforcement is controlled by `admin_governance.risk_enforcement` in the active sidecar policy. Only the explicit value `off` skips local risk checks. Missing or other values retain existing fail-closed checks. Agent-disabled, tag, mTLS, RBAC, and JWT controls remain independent.
- Enabling local enforcement requires a ready CA cache and permitted control-plane risk evidence to prevent immediate management lockout; it does not initialize or assume safe evidence for workload agents.
- Both built-in demo presets and the shipped demo policy default to `off` and omit the deprecated per-caller blocked risk levels. Hydrated presets respect an operator's persisted enforcement setting. This does not alter live tenant CA policies or token-issuance enforcement.
- Signal monitoring is observational: it does not automatically populate the sidecar risk store. Enabling local risk enforcement still requires explicit evidence in that store. Durable sidecar risk evidence and restart recovery remain tracked in #48.

`GET /api/settings/risk` is viewer/admin readable. `PUT /api/settings/risk-signal` and `PUT /api/settings/risk-enforcement` require administrator authorization and accept `{"enabled": true}` or `{"enabled": false}`. Enforcement updates and coordinated demo preset application require an upgraded sidecar advertising `risk_enforcement_control_supported` in management health.

This feature includes a sidecar change; do not deploy it with `--portal-only` until the sidecar has been upgraded through the normal deployment/attestation flow.

For an already-bootstrapped environment where tenant CA policies must remain unchanged, use `SKIP_ENTRA=true ./deploy.sh --skip-provision` to upgrade workloads and re-attest without running Entra provisioning.

`infra/modules/portal-support.bicep` provisions the private runtime settings container inside the environment-owned storage account. `deploy.sh` initializes its blob from `portal/default-risk-settings.json` only if it does not exist; regular and portal-only deployments preserve operator choices. `scripts/teardown.sh` deletes the storage account and settings through `azd down --force --purge`; scoped rebuild deletes the resource group, including settings, before provisioning new defaults. `--skip-azd` performs environment-variable cleanup only and deliberately does not delete live settings.

## Related Reading

- [Portal Cloud Deployment](../architecture/portal-cloud-deployment.md)
- [Management APIs](../reference/management-apis.md)
- [Authentication Flows](../reference/authentication-flows.md)
