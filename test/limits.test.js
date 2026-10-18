import { test } from "node:test";
import assert from "node:assert/strict";
import { imageType, rateLimiter } from "../src/limits.js";

test("image type comes from the bytes", () => {
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])), "image/jpeg");
  assert.equal(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(imageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(imageType(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

test("rate limiter allows max per window, then resets", () => {
  const allow = rateLimiter(2, 1000);
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 10), true);
  assert.equal(allow("a", 20), false);
  assert.equal(allow("b", 20), true);
  assert.equal(allow("a", 1000), true);
});
