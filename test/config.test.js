import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Open Cloud's files win over environment variables.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-"));
process.env.SECRETS_DIR = dir;
const { secret, aiConfig } = await import("../src/config.js");

test("secret reads /run/secrets-style files first, then env", () => {
  fs.writeFileSync(path.join(dir, "S3_BUCKET"), "from-file");
  process.env.S3_BUCKET = "from-env";
  process.env.ONLY_ENV = "env-value";
  assert.equal(secret("S3_BUCKET"), "from-file");
  assert.equal(secret("ONLY_ENV"), "env-value");
  assert.equal(secret("MISSING"), undefined);
});

test("AI config: offline, provider key, then gateway", () => {
  assert.equal(aiConfig(), null);
  fs.writeFileSync(path.join(dir, "OPENROUTER_API_KEY"), "or-key");
  assert.deepEqual(aiConfig(), { mode: "provider", baseUrl: "https://openrouter.ai/api/v1", key: "or-key", model: "openai/gpt-4o-mini" });
  fs.writeFileSync(path.join(dir, "LLM_GATEWAY_KEY"), "gw-key");
  fs.writeFileSync(path.join(dir, "LLM_GATEWAY_URL"), "http://llm-gateway:8000/v1");
  fs.writeFileSync(path.join(dir, "AI_MODEL"), "chat-vision");
  assert.deepEqual(aiConfig(), { mode: "gateway", baseUrl: "http://llm-gateway:8000/v1", key: "gw-key", model: "chat-vision" });
});
