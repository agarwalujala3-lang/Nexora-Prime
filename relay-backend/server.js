"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT || 8091);
const JWT_SECRET = String(process.env.JWT_SECRET || "replace-this-secret-before-production");
const TOKEN_TTL = String(process.env.TOKEN_TTL || "8h");
const REQUIRE_SIGNED_REQUESTS = String(process.env.REQUIRE_SIGNED_REQUESTS || "true").toLowerCase() !== "false";
const SIGNATURE_WINDOW_SECONDS = Number(process.env.SIGNATURE_WINDOW_SECONDS || 300);
const NONCE_TTL_SECONDS = Number(process.env.NONCE_TTL_SECONDS || 600);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const rolePermissions = {
  citizen_app: ["relay:create", "dispatch:read_redacted"],
  ngo_dispatcher: ["relay:create", "dispatch:read_redacted"],
  police_dispatcher: ["relay:create", "dispatch:read_full"],
  gov_control: ["relay:create", "dispatch:read_full", "dispatch:override"],
  admin: ["relay:create", "dispatch:read_full", "dispatch:override", "system:admin"]
};

const defaultUsers = {
  "citizen-app": { password: "change-me", role: "citizen_app" },
  "ngo-console": { password: "change-me", role: "ngo_dispatcher" },
  "police-console": { password: "change-me", role: "police_dispatcher" },
  "gov-console": { password: "change-me", role: "gov_control" },
  "admin": { password: "change-me", role: "admin" }
};

const relayUsers = (() => {
  const raw = process.env.RELAY_USERS_JSON;
  if (!raw) {
    return defaultUsers;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : defaultUsers;
  } catch (error) {
    return defaultUsers;
  }
})();

function parseSigningKeys(rawPairs) {
  const map = {};
  String(rawPairs || "")
    .split(",")
    .map(pair => pair.trim())
    .filter(Boolean)
    .forEach(pair => {
      const separator = pair.indexOf(":");
      if (separator <= 0) {
        return;
      }
      const keyId = pair.slice(0, separator).trim();
      const secret = pair.slice(separator + 1).trim();
      if (!keyId || !secret) {
        return;
      }
      map[keyId] = secret;
    });
  return map;
}

const signingKeys = parseSigningKeys(process.env.SIGNING_KEYS);

const outboundConnectors = [
  {
    id: "gov112",
    label: "Gov-112",
    url: String(process.env.GOV_RELAY_URL || "").trim(),
    keyId: String(process.env.GOV_RELAY_KEY_ID || "").trim(),
    signingSecret: String(process.env.GOV_RELAY_SIGNING_SECRET || "").trim(),
    scope: "exact",
    events: ["sos_created", "auto_dispatch_batch", "live_location_update"]
  },
  {
    id: "ngo",
    label: "NGO",
    url: String(process.env.NGO_RELAY_URL || "").trim(),
    keyId: String(process.env.NGO_RELAY_KEY_ID || "").trim(),
    signingSecret: String(process.env.NGO_RELAY_SIGNING_SECRET || "").trim(),
    scope: "redacted",
    events: ["sos_created", "auto_dispatch_batch", "live_location_update"]
  },
  {
    id: "police",
    label: "Police-CAD",
    url: String(process.env.POLICE_RELAY_URL || "").trim(),
    keyId: String(process.env.POLICE_RELAY_KEY_ID || "").trim(),
    signingSecret: String(process.env.POLICE_RELAY_SIGNING_SECRET || "").trim(),
    scope: "exact",
    events: ["sos_created", "auto_dispatch_batch", "live_location_update"],
    scenarioKeys: ["road_accident", "attack", "cab_risk"]
  }
];

const dispatchStore = new Map();
const nonceStore = new Map();
const rateStore = new Map();

const logsDir = path.join(__dirname, "logs");
const auditLogPath = path.join(logsDir, "audit.log");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
if (!fs.existsSync(auditLogPath)) {
  fs.writeFileSync(auditLogPath, "");
}

let auditPrevHash = "GENESIS";
try {
  const lines = fs
    .readFileSync(auditLogPath, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length) {
    const last = JSON.parse(lines[lines.length - 1]);
    auditPrevHash = String(last.hash || "GENESIS");
  }
} catch (error) {
  auditPrevHash = "GENESIS";
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacHex(secret, canonical) {
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

function safeHexEqual(left, right) {
  try {
    const leftBuffer = Buffer.from(String(left || ""), "hex");
    const rightBuffer = Buffer.from(String(right || ""), "hex");
    if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch (error) {
    return false;
  }
}

function appendAudit(eventType, actor, payload) {
  const entry = {
    ts: new Date().toISOString(),
    eventType,
    actor,
    payload,
    prevHash: auditPrevHash
  };
  const hash = sha256Hex(JSON.stringify(entry));
  const line = JSON.stringify({ ...entry, hash });
  fs.appendFileSync(auditLogPath, `${line}\n`);
  auditPrevHash = hash;
}

function hasPermission(role, permission) {
  const set = rolePermissions[role] || [];
  if (set.includes(permission)) {
    return true;
  }
  if (permission === "dispatch:read") {
    return set.includes("dispatch:read_redacted") || set.includes("dispatch:read_full");
  }
  if (permission === "dispatch:read_redacted") {
    return set.includes("dispatch:read_full");
  }
  return false;
}

function authenticateJwt(req, res, next) {
  const auth = String(req.get("authorization") || "");
  if (!auth.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Missing bearer token" });
    return;
  }
  const token = auth.slice(7).trim();
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.auth?.role;
    if (!role || !hasPermission(role, permission)) {
      res.status(403).json({ ok: false, error: "Forbidden for this role" });
      return;
    }
    next();
  };
}

function verifySignedRequest(req, res, next) {
  if (!REQUIRE_SIGNED_REQUESTS) {
    req.signatureMeta = { verified: false, bypassed: true };
    next();
    return;
  }

  const keyId = String(req.get("x-nexora-key-id") || "").trim();
  const timestamp = String(req.get("x-nexora-timestamp") || "").trim();
  const nonce = String(req.get("x-nexora-nonce") || "").trim();
  const signature = String(req.get("x-nexora-signature") || "").trim();
  const claimedBodyHash = String(req.get("x-nexora-body-sha256") || "").trim();

  if (!keyId || !timestamp || !nonce || !signature) {
    res.status(401).json({ ok: false, error: "Missing signature headers" });
    return;
  }
  const secret = signingKeys[keyId];
  if (!secret) {
    res.status(401).json({ ok: false, error: "Unknown signing key" });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > SIGNATURE_WINDOW_SECONDS) {
    res.status(401).json({ ok: false, error: "Signature timestamp out of window" });
    return;
  }

  const nonceKey = `${keyId}:${nonce}`;
  const existing = nonceStore.get(nonceKey);
  if (existing && existing > Date.now()) {
    res.status(409).json({ ok: false, error: "Replay detected" });
    return;
  }

  const rawBody = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body || {});
  const bodyHash = sha256Hex(rawBody);
  if (claimedBodyHash && !safeHexEqual(claimedBodyHash, bodyHash)) {
    res.status(401).json({ ok: false, error: "Body hash mismatch" });
    return;
  }

  const canonical = [req.method.toUpperCase(), req.path, timestamp, nonce, bodyHash].join("\n");
  const expected = hmacHex(secret, canonical);
  if (!safeHexEqual(expected, signature)) {
    res.status(401).json({ ok: false, error: "Invalid signature" });
    return;
  }

  nonceStore.set(nonceKey, Date.now() + NONCE_TTL_SECONDS * 1000);
  req.signatureMeta = { verified: true, keyId, timestamp, nonce, bodyHash };
  next();
}

function rateLimitRelay(req, res, next) {
  const key = `${req.auth?.sub || "anon"}:${req.ip || "ip"}`;
  const current = rateStore.get(key) || { count: 0, resetAt: Date.now() + 60_000 };
  if (Date.now() > current.resetAt) {
    current.count = 0;
    current.resetAt = Date.now() + 60_000;
  }
  current.count += 1;
  rateStore.set(key, current);
  if (current.count > 90) {
    res.status(429).json({ ok: false, error: "Rate limit exceeded" });
    return;
  }
  next();
}

function maskPhone(phone) {
  const clean = String(phone || "").trim();
  if (!clean) {
    return "";
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 6) {
    return "***";
  }
  return `${clean.slice(0, 3)}***${digits.slice(-3)}`;
}

function redactRecordForRole(record, role) {
  const allowExact = hasPermission(role, "dispatch:read_full");
  const clone = JSON.parse(JSON.stringify(record));

  if (allowExact) {
    return clone;
  }

  clone.location = clone.location
    ? {
        redacted: clone.location.redacted || "",
        updatedAt: clone.location.updatedAt || clone.location.createdAt || null
      }
    : null;
  clone.exactLocationTargets = (clone.exactLocationTargets || []).map(target => ({
    ...target,
    phone: maskPhone(target.phone)
  }));
  clone.details = "Redacted. Visible to police/gov roles only.";
  return clone;
}

function validateRelayEvent(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid payload" };
  }
  const event = String(body.event || "").trim();
  if (!event) {
    return { ok: false, error: "Missing event type" };
  }
  const supported = ["sos_created", "auto_dispatch_batch", "live_location_update"];
  if (!supported.includes(event)) {
    return { ok: false, error: `Unsupported event '${event}'` };
  }
  if (!body.payload || typeof body.payload !== "object") {
    return { ok: false, error: "Missing event payload object" };
  }
  return { ok: true, event, payload: body.payload };
}

function upsertDispatchRecord(event, payload, actor) {
  const incidentId = String(payload.id || payload.incidentId || "").trim();
  if (!incidentId) {
    throw new Error("Missing incident id");
  }

  const existing = dispatchStore.get(incidentId) || {
    id: incidentId,
    createdAt: new Date().toISOString(),
    district: payload.district || "Unknown",
    scenarioKey: payload.scenarioKey || "unknown",
    urgency: payload.urgency || "unknown",
    details: payload.details || "",
    exactLocationTargets: [],
    redactedLocationTargets: [],
    location: null,
    timeline: []
  };

  if (event === "sos_created") {
    existing.createdAt = payload.createdAt || existing.createdAt;
    existing.district = payload.district || existing.district;
    existing.scenarioKey = payload.scenarioKey || existing.scenarioKey;
    existing.urgency = payload.urgency || existing.urgency;
    existing.details = payload.details || existing.details;
    existing.location = payload.locationAvailable
      ? {
          precise: {
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            mapLink: payload.mapLink
          },
          redacted: payload.locationPublic || "",
          updatedAt: new Date().toISOString()
        }
      : existing.location;
    existing.exactLocationTargets = payload.dispatchPlan?.exactTargets || existing.exactLocationTargets;
    existing.redactedLocationTargets = payload.dispatchPlan?.redactedTargets || existing.redactedLocationTargets;
  }

  if (event === "auto_dispatch_batch") {
    existing.createdAt = payload.createdAt || existing.createdAt;
    existing.district = payload.district || existing.district;
    existing.scenarioKey = payload.scenarioKey || existing.scenarioKey;
    existing.urgency = payload.urgency || existing.urgency;
    existing.details = payload.details || existing.details;
    existing.exactLocationTargets = payload.exactLocationTargets || existing.exactLocationTargets;
    existing.redactedLocationTargets = payload.redactedLocationTargets || existing.redactedLocationTargets;
    if (payload.location) {
      existing.location = {
        precise: payload.location,
        redacted: payload.redactedLocation || existing.location?.redacted || "",
        updatedAt: new Date().toISOString()
      };
    }
  }

  if (event === "live_location_update") {
    existing.location = {
      precise: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy
      },
      redacted: payload.redactedLocation || "",
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
  }

  existing.timeline.push({
    event,
    at: new Date().toISOString(),
    actor
  });
  existing.timeline = existing.timeline.slice(-120);
  dispatchStore.set(incidentId, existing);
  return existing;
}

function shouldSendToConnector(connector, event, record) {
  if (!connector.events.includes(event)) {
    return false;
  }
  if (!connector.scenarioKeys || !connector.scenarioKeys.length) {
    return true;
  }
  return connector.scenarioKeys.includes(record.scenarioKey);
}

function buildConnectorEnvelope(record, event, connector) {
  const base = {
    incidentId: record.id,
    event,
    scenarioKey: record.scenarioKey,
    district: record.district,
    urgency: record.urgency,
    timelineAt: new Date().toISOString()
  };

  if (connector.scope === "exact") {
    return {
      ...base,
      details: record.details,
      location: record.location?.precise || null,
      exactLocationTargets: record.exactLocationTargets || [],
      redactedLocationTargets: record.redactedLocationTargets || []
    };
  }

  return {
    ...base,
    details: "Redacted",
    location: { redacted: record.location?.redacted || "" },
    exactLocationTargets: (record.exactLocationTargets || []).map(target => ({
      ...target,
      phone: maskPhone(target.phone)
    })),
    redactedLocationTargets: record.redactedLocationTargets || []
  };
}

async function forwardConnector(connector, envelope) {
  if (!connector.url) {
    return {
      connector: connector.id,
      status: "queued_local",
      reason: "connector_url_not_configured"
    };
  }

  const bodyText = JSON.stringify(envelope);
  const headers = { "Content-Type": "application/json" };

  if (connector.keyId && connector.signingSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString("hex");
    const endpointPath = new URL(connector.url).pathname;
    const bodyHash = sha256Hex(bodyText);
    const canonical = ["POST", endpointPath, timestamp, nonce, bodyHash].join("\n");
    const signature = hmacHex(connector.signingSecret, canonical);
    headers["X-Nexora-Key-Id"] = connector.keyId;
    headers["X-Nexora-Timestamp"] = timestamp;
    headers["X-Nexora-Nonce"] = nonce;
    headers["X-Nexora-Body-SHA256"] = bodyHash;
    headers["X-Nexora-Signature"] = signature;
    headers["X-Nexora-Alg"] = "HMAC-SHA256";
  }

  try {
    const response = await fetch(connector.url, {
      method: "POST",
      headers,
      body: bodyText
    });
    return {
      connector: connector.id,
      status: response.ok ? "delivered" : "failed",
      httpStatus: response.status
    };
  } catch (error) {
    return {
      connector: connector.id,
      status: "failed",
      reason: error?.message || "network_error"
    };
  }
}

async function fanOut(record, event) {
  const tasks = outboundConnectors
    .filter(connector => shouldSendToConnector(connector, event, record))
    .map(connector => forwardConnector(connector, buildConnectorEnvelope(record, event, connector)));
  return Promise.all(tasks);
}

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin blocked by CORS policy"));
  }
}));
app.use(express.json({
  limit: "1mb",
  verify(req, res, buffer) {
    req.rawBody = buffer.toString("utf8");
  }
}));

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "nexora-secure-relay",
    signedRequestsRequired: REQUIRE_SIGNED_REQUESTS,
    signingKeysLoaded: Object.keys(signingKeys).length,
    connectorsConfigured: outboundConnectors.filter(item => Boolean(item.url)).map(item => item.id),
    at: new Date().toISOString()
  });
});

app.post("/v1/auth/token", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();
  const account = relayUsers[username];
  if (!account || account.password !== password) {
    res.status(401).json({ ok: false, error: "Invalid credentials" });
    return;
  }
  const token = jwt.sign(
    {
      sub: username,
      role: account.role
    },
    JWT_SECRET,
    {
      expiresIn: TOKEN_TTL,
      issuer: "nexora-secure-relay"
    }
  );
  appendAudit("auth.token_issued", username, { role: account.role });
  res.json({ ok: true, token, role: account.role, expiresIn: TOKEN_TTL });
});

app.post(
  "/v1/relay/events",
  authenticateJwt,
  requirePermission("relay:create"),
  rateLimitRelay,
  verifySignedRequest,
  async (req, res) => {
    const validated = validateRelayEvent(req.body);
    if (!validated.ok) {
      res.status(400).json({ ok: false, error: validated.error });
      return;
    }

    try {
      const record = upsertDispatchRecord(validated.event, validated.payload, req.auth.sub || "unknown");
      const fanOutResults = await fanOut(record, validated.event);
      const delivered = fanOutResults.filter(item => item.status === "delivered").length;
      const queued = fanOutResults.filter(item => item.status === "queued_local").length;
      const failed = fanOutResults.filter(item => item.status === "failed").length;

      appendAudit("relay.event", req.auth.sub || "unknown", {
        event: validated.event,
        incidentId: record.id,
        role: req.auth.role,
        delivered,
        queued,
        failed
      });

      res.status(202).json({
        ok: true,
        incidentId: record.id,
        event: validated.event,
        signatureVerified: Boolean(req.signatureMeta?.verified),
        relay: {
          delivered,
          queued,
          failed,
          targets: fanOutResults
        }
      });
    } catch (error) {
      appendAudit("relay.event_failed", req.auth?.sub || "unknown", {
        message: error?.message || "unknown_error"
      });
      res.status(500).json({ ok: false, error: "Failed to process relay event" });
    }
  }
);

app.get(
  "/v1/dispatch/:id",
  authenticateJwt,
  requirePermission("dispatch:read"),
  (req, res) => {
    const incidentId = String(req.params.id || "").trim();
    const record = dispatchStore.get(incidentId);
    if (!record) {
      res.status(404).json({ ok: false, error: "Dispatch record not found" });
      return;
    }
    const view = redactRecordForRole(record, req.auth.role);
    res.json({ ok: true, data: view });
  }
);

app.get(
  "/v1/dispatch/:id/audit",
  authenticateJwt,
  requirePermission("dispatch:read"),
  (req, res) => {
    const incidentId = String(req.params.id || "").trim();
    const record = dispatchStore.get(incidentId);
    if (!record) {
      res.status(404).json({ ok: false, error: "Dispatch record not found" });
      return;
    }
    res.json({
      ok: true,
      incidentId,
      timeline: record.timeline || []
    });
  }
);

app.use((error, req, res, next) => {
  if (error && error.message && error.message.includes("CORS")) {
    res.status(403).json({ ok: false, error: "Origin not allowed" });
    return;
  }
  res.status(500).json({ ok: false, error: "Internal server error" });
});

setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of nonceStore.entries()) {
    if (expiry <= now) {
      nonceStore.delete(key);
    }
  }
  for (const [key, state] of rateStore.entries()) {
    if (state.resetAt <= now) {
      rateStore.delete(key);
    }
  }
}, 30_000).unref();

app.listen(PORT, () => {
  console.log(`[nexora-secure-relay] listening on ${PORT}`);
  console.log(`[nexora-secure-relay] signed requests required: ${REQUIRE_SIGNED_REQUESTS}`);
  console.log(`[nexora-secure-relay] signing keys loaded: ${Object.keys(signingKeys).length}`);
});
