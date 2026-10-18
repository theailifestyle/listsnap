import { test } from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../src/errors.js";

function run(err) {
  const out = { logged: [] };
  const orig = console.error;
  console.error = (m) => out.logged.push(m);
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  try { errorHandler(err, { path: "/api/lists" }, res); } finally { console.error = orig; }
  return out;
}

test("malformed JSON is a 400 and its message (which quotes the body) is not logged", () => {
  const err = Object.assign(new SyntaxError('Unexpected token \'c\', "call the d"... is not valid JSON'), { status: 400, type: "entity.parse.failed" });
  const out = run(err);
  assert.equal(out.status, 400);
  assert.deepEqual(out.logged, []);
  assert.doesNotMatch(JSON.stringify(out.body), /call the/);
});

test("too large keeps its message; server errors are logged as 500", () => {
  assert.equal(run(Object.assign(new Error("x"), { status: 413, type: "entity.too.large" })).status, 413);
  const out = run(new Error("boom"));
  assert.equal(out.status, 500);
  assert.equal(out.logged.length, 1);
});
