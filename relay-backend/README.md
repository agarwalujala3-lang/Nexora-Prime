# NEXORA Secure Relay Backend

This service provides a locked relay layer for emergency events with:

- JWT authentication
- role-based access control (RBAC)
- HMAC signed inbound requests with nonce + timestamp replay protection
- outbound fan-out to Gov/NGO/Police connectors
- append-only audit log with hash chaining

## 1) Setup

1. Copy `.env.example` to `.env` and fill all values.
2. Install dependencies:
   - `cd relay-backend`
   - `npm install`
3. Run:
   - `npm run dev`

Health endpoint:
- `GET /healthz`

## 2) Auth Flow

Get token:

```bash
curl -X POST http://localhost:8091/v1/auth/token \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"citizen-app\",\"password\":\"change-me\"}"
```

Use returned JWT as `Authorization: Bearer <token>`.

## 3) Signed Request Format

For `POST /v1/relay/events`, client must include:

- `X-Nexora-Key-Id`
- `X-Nexora-Timestamp` (unix seconds)
- `X-Nexora-Nonce` (unique per request)
- `X-Nexora-Body-SHA256`
- `X-Nexora-Signature`

Canonical string:

```text
POST
/v1/relay/events
<timestamp>
<nonce>
<sha256(body)>
```

Signature:

```text
HMAC-SHA256(secret, canonical)
```

## 4) RBAC Roles

- `citizen_app`: create relay event, read redacted dispatch
- `ngo_dispatcher`: create relay event, read redacted dispatch
- `police_dispatcher`: create relay event, read full dispatch
- `gov_control`: create relay event, read full dispatch, override capability
- `admin`: full access

## 5) Frontend Connection

Use `relay.config.example.js` (copy to `relay.config.js`) and set:

- `window.NEXORA_RELAY_ENDPOINT`
- `window.NEXORA_RELAY_SECURITY.bearerToken`
- `window.NEXORA_RELAY_SECURITY.keyId`
- `window.NEXORA_RELAY_SECURITY.signingSecret`

Then include `relay.config.js` before `app.js` in `index.html` for live signed relay mode.

## 6) Important Production Notes

- Replace demo password auth with SSO/IAM (OIDC/SAML).
- Keep signing secrets only in secure secret manager and rotate periodically.
- Use mTLS/IP allowlists with connector endpoints.
- Real Gov/Police integration requires formal onboarding, legal approval, and whitelisted infrastructure.
