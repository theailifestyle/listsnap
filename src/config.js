// Open Cloud hands every setting except PORT to the app as a file: /run/secrets/<NAME>.
// Locally (docker compose, npm start) the same names come from environment variables.
import fs from "node:fs";

const DIR = process.env.SECRETS_DIR || "/run/secrets";

export function secret(name) {
  try {
    return fs.readFileSync(`${DIR}/${name}`, "utf8").trim() || undefined;
  } catch {
    return process.env[name] || undefined;
  }
}

// AI: the Open Bedrock gateway if the app has one, else the provider key Open Cloud injects
// (service page -> AI provider key -> OPENROUTER_API_KEY), else offline mode.
export function aiConfig() {
  const gatewayKey = secret("LLM_GATEWAY_KEY");
  const key = gatewayKey || secret("OPENROUTER_API_KEY");
  if (!key) return null;
  return {
    mode: gatewayKey ? "gateway" : "provider",
    baseUrl: (secret("LLM_GATEWAY_URL") || secret("AI_BASE_URL") || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    key,
    model: secret("AI_MODEL") || "openai/gpt-4o-mini",
  };
}
