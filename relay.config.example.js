/*
  Copy to relay.config.js and load it before app.js in index.html for secure relay mode.
  Do NOT commit real secrets to source control.
*/
window.NEXORA_RELAY_ENDPOINT = "https://your-relay-domain.example.com/v1/relay/events";

window.NEXORA_RELAY_SECURITY = {
  // JWT from POST /v1/auth/token (short-lived)
  bearerToken: "replace-with-short-lived-jwt",

  // HMAC key id/secret provisioned by backend (rotate regularly)
  keyId: "web-client-1",
  signingSecret: "replace-with-strong-hmac-secret",

  algorithm: "HMAC-SHA256"
};
