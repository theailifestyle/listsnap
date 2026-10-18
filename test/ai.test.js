import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseLines, parseReply, makeList } from "../src/ai.js";

test("offline parser strips bullets, numbers and checkboxes", () => {
  assert.deepEqual(parseLines("- milk\n* eggs\n1. call mom\n2) gym\n[ ] taxes\n[x] done thing\n\n  plain  "),
    ["milk", "eggs", "call mom", "gym", "taxes", "done thing", "plain"]);
});

test("offline parser splits a single comma line", () => {
  assert.deepEqual(parseLines("milk, eggs,bread"), ["milk", "eggs", "bread"]);
});

test("model reply: JSON inside a code fence", () => {
  assert.deepEqual(parseReply('```json\n{"title":"Errands","items":["Buy milk","Mail package"]}\n```'),
    { title: "Errands", items: ["Buy milk", "Mail package"] });
});

test("model reply: not JSON falls back to lines; caps item count and length", () => {
  assert.deepEqual(parseReply("- a\n- b"), { title: "My list", items: ["a", "b"] });
  const r = parseReply(JSON.stringify({ title: "x", items: Array(80).fill("y".repeat(300)) }));
  assert.equal(r.items.length, 50);
  assert.equal(r.items[0].length, 200);
});

test("offline mode: text becomes items, photos get a hint", async () => {
  assert.deepEqual(await makeList(null, { text: "one\ntwo" }), { title: "My list", items: ["one", "two"] });
  const p = await makeList(null, { image: { type: "image/jpeg", data: Buffer.from([1]) } });
  assert.equal(p.items.length, 1);
});

test("AI mode sends the photo as an image_url and reads the JSON reply", async () => {
  let seen;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen = { auth: req.headers.authorization, url: req.url, body: JSON.parse(body) };
      res.end(JSON.stringify({ choices: [{ message: { content: '{"title":"Groceries","items":["Milk","Eggs"]}' } }] }));
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const cfg = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, key: "k", model: "m" };
  const out = await makeList(cfg, { image: { type: "image/png", data: Buffer.from("png") } });
  server.close();
  assert.deepEqual(out, { title: "Groceries", items: ["Milk", "Eggs"] });
  assert.equal(seen.url, "/v1/chat/completions");
  assert.equal(seen.auth, "Bearer k");
  assert.equal(seen.body.model, "m");
  assert.equal(seen.body.messages[1].content[1].image_url.url, "data:image/png;base64," + Buffer.from("png").toString("base64"));
});
