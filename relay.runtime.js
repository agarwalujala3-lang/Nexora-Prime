/*
  Public runtime defaults for relay integration.
  Optional private overrides can be provided via relay.config.js.
*/
(function initRelayRuntimeDefaults() {
  if (typeof window === "undefined") {
    return;
  }

  if (!window.NEXORA_RELAY_SECURITY || typeof window.NEXORA_RELAY_SECURITY !== "object") {
    window.NEXORA_RELAY_SECURITY = {};
  }

  if (typeof window.NEXORA_RELAY_ENDPOINT !== "string") {
    window.NEXORA_RELAY_ENDPOINT = "";
  }

  const defaults = {
    bearerToken: "",
    keyId: "",
    signingSecret: "",
    algorithm: "HMAC-SHA256"
  };

  window.NEXORA_RELAY_SECURITY = Object.assign(defaults, window.NEXORA_RELAY_SECURITY);
})();
