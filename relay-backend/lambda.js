"use strict";

const crypto = require("crypto");

const DISPATCH_TABLE = String(process.env.DISPATCH_TABLE || "nexora-relay-dispatch");
const NONCE_TABLE = String(process.env.NONCE_TABLE || "nexora-relay-nonces");
const JWT_SECRET = String(process.env.JWT_SECRET || "replace-this-secret-before-production");
const TOKEN_TTL = String(process.env.TOKEN_TTL || "8h");
const REQUIRE_SIGNED_REQUESTS = String(process.env.REQUIRE_SIGNED_REQUESTS || "true").toLowerCase() !== "false";
const SIGNATURE_WINDOW_SECONDS = Number(process.env.SIGNATURE_WINDOW_SECONDS || 300);
const NONCE_TTL_SECONDS = Number(process.env.NONCE_TTL_SECONDS || 600);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

let ddb = null;
let hasDdb = false;
try {
  // Optional: use DynamoDB when aws-sdk is bundled in deployment package.
  // Lambda runtime may not include aws-sdk by default.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const AWS = require("aws-sdk");
  ddb = new AWS.DynamoDB.DocumentClient();
  hasDdb = true;
} catch (error) {
  hasDdb = false;
}

const memoryDispatchStore = new Map();
const memoryNonceStore = new Map();

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

function parsePairs(rawPairs) {
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
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!key || !value) {
        return;
      }
      map[key] = value;
    });
  return map;
}

const signingKeys = parsePairs(process.env.SIGNING_KEYS);
const signingClientRoles = parsePairs(process.env.SIGNING_CLIENT_ROLES);

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

function getOrigin(event) {
  const headers = event.headers || {};
  return headers.origin || headers.Origin || "";
}

function allowedOriginValue(origin) {
  if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

function response(event, statusCode, body, extraHeaders = {}) {
  const origin = getOrigin(event);
  const allowOrigin = allowedOriginValue(origin);
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "authorization,content-type,x-nexora-key-id,x-nexora-timestamp,x-nexora-nonce,x-nexora-body-sha256,x-nexora-signature,x-nexora-alg",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "600",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function parseJsonBody(event) {
  if (!event.body) {
    return {};
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function rawBodyText(event) {
  if (!event.body) {
    return "";
  }
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function getHeader(event, name) {
  const headers = event.headers || {};
  const target = name.toLowerCase();
  const found = Object.keys(headers).find(key => key.toLowerCase() === target);
  return found ? String(headers[found] || "") : "";
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacHex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  let text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (text.length % 4 !== 0) {
    text += "=";
  }
  return Buffer.from(text, "base64").toString("utf8");
}

function parseDurationSeconds(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) {
    return 8 * 60 * 60;
  }
  const exact = Number(value);
  if (Number.isFinite(exact) && exact > 0) {
    return Math.floor(exact);
  }
  const match = value.match(/^(\d+)\s*([smhd])$/);
  if (!match) {
    return 8 * 60 * 60;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  if (unit === "d") return amount * 24 * 60 * 60;
  return 8 * 60 * 60;
}

function timingSafeHexEqual(left, right) {
  try {
    const leftBuffer = Buffer.from(String(left || ""), "hex");
    const rightBuffer = Buffer.from(String(right || ""), "hex");
    if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch (error) {
    return false;
  }
}

function issueJwt(sub, role) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + parseDurationSeconds(TOKEN_TTL);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    sub,
    role,
    iss: "nexora-secure-relay",
    iat: now,
    exp
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${signature}`;
}

function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const sigA = Buffer.from(signaturePart);
  const sigB = Buffer.from(expected);
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(base64UrlDecode(payloadPart));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error("Token expired");
  }
  return payload;
}

function hasPermission(role, permission) {
  const granted = rolePermissions[role] || [];
  if (granted.includes(permission)) {
    return true;
  }
  if (permission === "dispatch:read") {
    return granted.includes("dispatch:read_redacted") || granted.includes("dispatch:read_full");
  }
  if (permission === "dispatch:read_redacted") {
    return granted.includes("dispatch:read_full");
  }
  return false;
}

async function reserveNonce(keyId, nonce) {
  if (!hasDdb) {
    const nonceKey = `${keyId}:${nonce}`;
    const nowMs = Date.now();
    const existing = memoryNonceStore.get(nonceKey);
    if (existing && existing > nowMs) {
      const replayError = new Error("Replay detected");
      replayError.code = "ConditionalCheckFailedException";
      throw replayError;
    }
    memoryNonceStore.set(nonceKey, nowMs + NONCE_TTL_SECONDS * 1000);
    if (memoryNonceStore.size > 10000) {
      const threshold = Date.now();
      for (const [storedKey, expiry] of memoryNonceStore.entries()) {
        if (expiry <= threshold) {
          memoryNonceStore.delete(storedKey);
        }
      }
    }
    return;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS;
  await ddb.put({
    TableName: NONCE_TABLE,
    Item: {
      nonceKey: `${keyId}:${nonce}`,
      createdAt: new Date().toISOString(),
      expiresAt
    },
    ConditionExpression: "attribute_not_exists(nonceKey)"
  }).promise();
}

async function verifySignedRequest(event) {
  if (!REQUIRE_SIGNED_REQUESTS) {
    return { ok: true, signed: false, keyId: "" };
  }

  const keyId = getHeader(event, "x-nexora-key-id").trim();
  const timestamp = getHeader(event, "x-nexora-timestamp").trim();
  const nonce = getHeader(event, "x-nexora-nonce").trim();
  const signature = getHeader(event, "x-nexora-signature").trim();
  const claimedBodyHash = getHeader(event, "x-nexora-body-sha256").trim();
  const secret = signingKeys[keyId];

  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, status: 401, error: "Missing signature headers" };
  }
  if (!secret) {
    return { ok: false, status: 401, error: "Unknown signing key" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, status: 401, error: "Signature timestamp out of window" };
  }

  const bodyText = rawBodyText(event);
  const bodyHash = sha256Hex(bodyText);
  if (claimedBodyHash && !timingSafeHexEqual(claimedBodyHash, bodyHash)) {
    return { ok: false, status: 401, error: "Body hash mismatch" };
  }

  const method = (event.requestContext?.http?.method || event.httpMethod || "POST").toUpperCase();
  const rawPath = event.rawPath || event.path || "/";
  const canonical = [method, rawPath, timestamp, nonce, bodyHash].join("\n");
  const expected = hmacHex(secret, canonical);
  if (!timingSafeHexEqual(expected, signature)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  try {
    await reserveNonce(keyId, nonce);
  } catch (error) {
    if (error && (error.code === "ConditionalCheckFailedException")) {
      return { ok: false, status: 409, error: "Replay detected" };
    }
    return { ok: false, status: 500, error: "Nonce reservation failed" };
  }

  return { ok: true, signed: true, keyId };
}

function readBearer(event) {
  const auth = getHeader(event, "authorization");
  if (!auth.startsWith("Bearer ")) {
    return "";
  }
  return auth.slice(7).trim();
}

function authorizeFromBearer(event, permission) {
  const token = readBearer(event);
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }
  try {
    const payload = verifyJwt(token);
    if (!hasPermission(payload.role, permission)) {
      return { ok: false, status: 403, error: "Forbidden for this role" };
    }
    return {
      ok: true,
      actor: payload.sub,
      role: payload.role
    };
  } catch (error) {
    return { ok: false, status: 401, error: "Invalid bearer token" };
  }
}

function authorizeRelayActor(event, signatureInfo) {
  const token = readBearer(event);
  if (token) {
    const bearerAuth = authorizeFromBearer(event, "relay:create");
    if (bearerAuth.ok) {
      return bearerAuth;
    }
  }

  if (signatureInfo?.keyId) {
    const mappedRole = signingClientRoles[signatureInfo.keyId] || "citizen_app";
    if (!hasPermission(mappedRole, "relay:create")) {
      return { ok: false, status: 403, error: "Key role not allowed for relay:create" };
    }
    return {
      ok: true,
      actor: `key:${signatureInfo.keyId}`,
      role: mappedRole
    };
  }
  return { ok: false, status: 401, error: "Unable to authorize relay actor" };
}

function validateRelayEvent(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid request payload" };
  }
  const event = String(body.event || "").trim();
  const payload = body.payload;
  const supported = ["sos_created", "auto_dispatch_batch", "live_location_update"];
  if (!supported.includes(event)) {
    return { ok: false, error: "Unsupported event type" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Missing event payload object" };
  }
  return { ok: true, event, payload };
}

function incidentIdFromPayload(payload) {
  return String(payload.id || payload.incidentId || "").trim();
}

async function getDispatchRecord(incidentId) {
  if (!hasDdb) {
    return memoryDispatchStore.get(incidentId) || null;
  }
  const result = await ddb.get({
    TableName: DISPATCH_TABLE,
    Key: { incidentId }
  }).promise();
  return result.Item || null;
}

async function putDispatchRecord(record) {
  if (!hasDdb) {
    memoryDispatchStore.set(record.incidentId, record);
    return;
  }
  await ddb.put({
    TableName: DISPATCH_TABLE,
    Item: record
  }).promise();
}

function maskPhone(phone) {
  const text = String(phone || "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length < 6) {
    return "***";
  }
  return `${text.slice(0, 3)}***${digits.slice(-3)}`;
}

function redactRecordForRole(record, role) {
  const allowFull = hasPermission(role, "dispatch:read_full");
  if (allowFull) {
    return record;
  }
  const clone = JSON.parse(JSON.stringify(record));
  clone.details = "Redacted. Full details available for police/gov roles.";
  clone.location = clone.location
    ? {
        redacted: clone.location.redacted || "",
        updatedAt: clone.location.updatedAt || null
      }
    : null;
  clone.exactLocationTargets = (clone.exactLocationTargets || []).map(target => ({
    ...target,
    phone: maskPhone(target.phone)
  }));
  return clone;
}

function mergeRelayEvent(existing, eventType, payload, actor) {
  const record = existing || {
    incidentId: incidentIdFromPayload(payload),
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

  if (eventType === "sos_created") {
    record.createdAt = payload.createdAt || record.createdAt;
    record.district = payload.district || record.district;
    record.scenarioKey = payload.scenarioKey || record.scenarioKey;
    record.urgency = payload.urgency || record.urgency;
    record.details = payload.details || record.details;
    record.exactLocationTargets = payload.dispatchPlan?.exactTargets || record.exactLocationTargets;
    record.redactedLocationTargets = payload.dispatchPlan?.redactedTargets || record.redactedLocationTargets;
    if (payload.locationAvailable) {
      record.location = {
        precise: {
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: payload.accuracy || 0,
          mapLink: payload.mapLink || ""
        },
        redacted: payload.locationPublic || "",
        updatedAt: new Date().toISOString()
      };
    }
  }

  if (eventType === "auto_dispatch_batch") {
    record.createdAt = payload.createdAt || record.createdAt;
    record.district = payload.district || record.district;
    record.scenarioKey = payload.scenarioKey || record.scenarioKey;
    record.urgency = payload.urgency || record.urgency;
    record.details = payload.details || record.details;
    record.exactLocationTargets = payload.exactLocationTargets || record.exactLocationTargets;
    record.redactedLocationTargets = payload.redactedLocationTargets || record.redactedLocationTargets;
    if (payload.location) {
      record.location = {
        precise: payload.location,
        redacted: payload.redactedLocation || record.location?.redacted || "",
        updatedAt: new Date().toISOString()
      };
    }
  }

  if (eventType === "live_location_update") {
    record.location = {
      precise: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy || 0
      },
      redacted: payload.redactedLocation || "",
      updatedAt: payload.updatedAt || new Date().toISOString()
    };
  }

  record.updatedAt = new Date().toISOString();
  record.timeline = record.timeline || [];
  record.timeline.push({
    event: eventType,
    at: new Date().toISOString(),
    actor
  });
  record.timeline = record.timeline.slice(-120);
  return record;
}

function shouldSendToConnector(connector, eventType, scenarioKey) {
  if (!connector.url) {
    return false;
  }
  if (!connector.events.includes(eventType)) {
    return false;
  }
  if (connector.scenarioKeys && connector.scenarioKeys.length) {
    return connector.scenarioKeys.includes(scenarioKey);
  }
  return true;
}

function buildConnectorEnvelope(record, eventType, connector) {
  const base = {
    incidentId: record.incidentId,
    event: eventType,
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
    location: {
      redacted: record.location?.redacted || ""
    },
    exactLocationTargets: (record.exactLocationTargets || []).map(target => ({
      ...target,
      phone: maskPhone(target.phone)
    })),
    redactedLocationTargets: record.redactedLocationTargets || []
  };
}

function connectorHeaders(connector, endpointPath, bodyText) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (!(connector.keyId && connector.signingSecret)) {
    return headers;
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = sha256Hex(bodyText);
  const canonical = ["POST", endpointPath, timestamp, nonce, bodyHash].join("\n");
  const signature = hmacHex(connector.signingSecret, canonical);

  headers["X-Nexora-Key-Id"] = connector.keyId;
  headers["X-Nexora-Timestamp"] = timestamp;
  headers["X-Nexora-Nonce"] = nonce;
  headers["X-Nexora-Body-SHA256"] = bodyHash;
  headers["X-Nexora-Signature"] = signature;
  headers["X-Nexora-Alg"] = "HMAC-SHA256";
  return headers;
}

async function forwardConnector(connector, envelope) {
  try {
    const bodyText = JSON.stringify(envelope);
    const endpoint = new URL(connector.url);
    const headers = connectorHeaders(connector, endpoint.pathname, bodyText);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(connector.url, {
      method: "POST",
      headers,
      body: bodyText,
      signal: controller.signal
    });
    clearTimeout(timeout);
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

async function fanOut(record, eventType) {
  const jobs = outboundConnectors
    .filter(connector => shouldSendToConnector(connector, eventType, record.scenarioKey))
    .map(connector => forwardConnector(connector, buildConnectorEnvelope(record, eventType, connector)));
  if (!jobs.length) {
    return [];
  }
  return Promise.all(jobs);
}

function routeParts(rawPath) {
  return String(rawPath || "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

exports.handler = async event => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
  const rawPath = event.rawPath || event.path || "/";

  if (method === "OPTIONS") {
    return response(event, 204, { ok: true });
  }

  if (method === "GET" && rawPath === "/healthz") {
    return response(event, 200, {
      ok: true,
      service: "nexora-secure-relay-lambda",
      signedRequestsRequired: REQUIRE_SIGNED_REQUESTS,
      signingKeysLoaded: Object.keys(signingKeys).length,
      at: new Date().toISOString()
    });
  }

  if (method === "POST" && rawPath === "/v1/auth/token") {
    const body = parseJsonBody(event);
    if (!body) {
      return response(event, 400, { ok: false, error: "Invalid JSON body" });
    }
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const account = relayUsers[username];
    if (!account || account.password !== password) {
      return response(event, 401, { ok: false, error: "Invalid credentials" });
    }
    const token = issueJwt(username, account.role);
    return response(event, 200, {
      ok: true,
      token,
      role: account.role,
      expiresIn: TOKEN_TTL
    });
  }

  if (method === "POST" && rawPath === "/v1/relay/events") {
    const signatureInfo = await verifySignedRequest(event);
    if (!signatureInfo.ok) {
      return response(event, signatureInfo.status || 401, { ok: false, error: signatureInfo.error });
    }

    const actorAuth = authorizeRelayActor(event, signatureInfo);
    if (!actorAuth.ok) {
      return response(event, actorAuth.status || 401, { ok: false, error: actorAuth.error });
    }

    const body = parseJsonBody(event);
    if (!body) {
      return response(event, 400, { ok: false, error: "Invalid JSON body" });
    }
    const validated = validateRelayEvent(body);
    if (!validated.ok) {
      return response(event, 400, { ok: false, error: validated.error });
    }

    const incidentId = incidentIdFromPayload(validated.payload);
    if (!incidentId) {
      return response(event, 400, { ok: false, error: "Missing incident id in payload" });
    }

    try {
      const existing = await getDispatchRecord(incidentId);
      const merged = mergeRelayEvent(existing, validated.event, validated.payload, actorAuth.actor);
      await putDispatchRecord(merged);
      const targets = await fanOut(merged, validated.event);

      const delivered = targets.filter(item => item.status === "delivered").length;
      const failed = targets.filter(item => item.status === "failed").length;
      const queued = 0;

      return response(event, 202, {
        ok: true,
        incidentId,
        event: validated.event,
        actor: actorAuth.actor,
        signatureVerified: Boolean(signatureInfo.signed),
        relay: {
          delivered,
          queued,
          failed,
          targets
        }
      });
    } catch (error) {
      console.error("relay.events failure", error);
      return response(event, 500, { ok: false, error: "Failed to process relay event" });
    }
  }

  const parts = routeParts(rawPath);
  if (method === "GET" && parts.length >= 3 && parts[0] === "v1" && parts[1] === "dispatch") {
    const auth = authorizeFromBearer(event, "dispatch:read");
    if (!auth.ok) {
      return response(event, auth.status || 401, { ok: false, error: auth.error });
    }
    const incidentId = decodeURIComponent(parts[2] || "");
    if (!incidentId) {
      return response(event, 400, { ok: false, error: "Missing incident id" });
    }
    try {
      const record = await getDispatchRecord(incidentId);
      if (!record) {
        return response(event, 404, { ok: false, error: "Dispatch record not found" });
      }
      if (parts.length === 4 && parts[3] === "audit") {
        return response(event, 200, {
          ok: true,
          incidentId,
          timeline: record.timeline || []
        });
      }
      const redacted = redactRecordForRole(record, auth.role);
      return response(event, 200, {
        ok: true,
        data: redacted
      });
    } catch (error) {
      console.error("dispatch read failure", error);
      return response(event, 500, { ok: false, error: "Failed to read dispatch record" });
    }
  }

  return response(event, 404, { ok: false, error: "Not found" });
};
