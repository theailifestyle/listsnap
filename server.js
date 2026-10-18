import crypto from "node:crypto";
import express from "express";
import pg from "pg";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { secret, aiConfig } from "./src/config.js";
import { makeList } from "./src/ai.js";
import { errorHandler } from "./src/errors.js";
import { MAX_TEXT, MAX_IMAGE, MAX_ITEM_TEXT, MAX_ITEMS, imageType, rateLimiter } from "./src/limits.js";

// Settings are read once at startup. Open Cloud restarts the app whenever a database,
// bucket or key is added, so new values are picked up then.
const dbUrl = secret("DATABASE_URL");
const db = dbUrl ? new pg.Pool({ connectionString: dbUrl, max: 5 }) : null;
const bucket = secret("S3_BUCKET") || "listsnap";
const s3 = secret("S3_ENDPOINT") && secret("S3_ACCESS_KEY_ID")
  ? new S3Client({
      endpoint: secret("S3_ENDPOINT"), region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: secret("S3_ACCESS_KEY_ID"), secretAccessKey: secret("S3_SECRET_ACCESS_KEY") },
    })
  : null;
const ai = aiConfig();
const perClient = rateLimiter(10, 60_000);   // AI calls per client per minute
const overall = rateLimiter(60, 60_000);     // AI calls per minute, all clients

const app = express();
app.set("trust proxy", 1);                   // one proxy in front (Open ELB), so req.ip is the client
app.disable("x-powered-by");
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/status", (req, res) => res.json({ database: !!db, storage: !!s3, ai: ai ? ai.mode : "offline" }));

const needDb = (req, res, next) => (db ? next() : res.status(503).json({ error: "No database yet. Create one on the service page." }));
const aiAllowed = (req, res, next) =>
  perClient(req.ip) && overall("all") ? next() : res.status(429).json({ error: "Too many lists at once. Try again in a minute." });

app.get("/api/lists", needDb, async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.id, l.title, l.photo_key, l.created_at,
            COALESCE(json_agg(json_build_object('id', i.id, 'text', i.text, 'done', i.done) ORDER BY i.position)
                     FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM lists l LEFT JOIN items i ON i.list_id = l.id
      GROUP BY l.id ORDER BY l.created_at DESC LIMIT 50`);
  res.json(rows);
});

app.post("/api/lists", needDb, express.json({ limit: "16kb" }), aiAllowed, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Write a list first." });
  if (text.length > MAX_TEXT) return res.status(413).json({ error: `Keep it under ${MAX_TEXT} characters.` });
  res.status(201).json(await saveList(await makeList(ai, { text }), null));
});

app.post("/api/lists/photo", needDb, express.raw({ type: "image/*", limit: MAX_IMAGE }), aiAllowed, async (req, res) => {
  if (!s3) return res.status(503).json({ error: "No bucket yet. Create one on the service page." });
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const type = imageType(data);
  if (!type) return res.status(415).json({ error: "Send a JPEG, PNG or WebP photo." });
  const list = await makeList(ai, { image: { type, data } });
  const key = `photos/${crypto.randomUUID()}.${type.split("/")[1]}`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: type }));
  res.status(201).json(await saveList(list, key));
});

// The bucket has no public address, so photos are served through the app.
app.get("/photos/:file", async (req, res) => {
  if (!s3 || !/^[0-9a-f-]{36}\.(jpeg|png|webp)$/.test(req.params.file)) return res.sendStatus(404);
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `photos/${req.params.file}` }));
    res.set({ "Content-Type": obj.ContentType, "Cache-Control": "private, max-age=86400" });
    obj.Body.pipe(res);
  } catch {
    res.sendStatus(404);
  }
});

app.patch("/api/items/:id", needDb, express.json({ limit: "4kb" }), async (req, res) => {
  const { text, done } = req.body || {};
  const t = text === undefined ? null : String(text).trim().slice(0, MAX_ITEM_TEXT);
  if (t === "") return res.status(400).json({ error: "An item needs some text." });
  const { rows } = await db.query(
    "UPDATE items SET text = COALESCE($2, text), done = COALESCE($3, done) WHERE id = $1 RETURNING id, text, done",
    [Number(req.params.id) || 0, t, typeof done === "boolean" ? done : null]);
  rows.length ? res.json(rows[0]) : res.sendStatus(404);
});

app.delete("/api/items/:id", needDb, async (req, res) => {
  const { rowCount } = await db.query("DELETE FROM items WHERE id = $1", [Number(req.params.id) || 0]);
  res.sendStatus(rowCount ? 204 : 404);
});

app.delete("/api/lists/:id", needDb, async (req, res) => {
  const { rows } = await db.query("DELETE FROM lists WHERE id = $1 RETURNING photo_key", [Number(req.params.id) || 0]);
  if (!rows.length) return res.sendStatus(404);
  if (rows[0].photo_key && s3) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: rows[0].photo_key })).catch(() => {});
  res.sendStatus(204);
});

app.use(errorHandler);

async function saveList({ title, items }, photoKey) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const { rows: [list] } = await c.query(
      "INSERT INTO lists (title, photo_key) VALUES ($1, $2) RETURNING id, title, photo_key, created_at", [title, photoKey]);
    list.items = [];
    for (const [i, text] of items.slice(0, MAX_ITEMS).entries()) {
      const { rows } = await c.query(
        "INSERT INTO items (list_id, text, position) VALUES ($1, $2, $3) RETURNING id, text, done", [list.id, text, i]);
      list.items.push(rows[0]);
    }
    await c.query("COMMIT");
    return list;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const port = Number(process.env.PORT) || 8080;
app.listen(port, "0.0.0.0", () =>
  console.log(JSON.stringify({ event: "listening", port, database: !!db, storage: !!s3, ai: ai ? ai.mode : "offline" })));
