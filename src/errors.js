// Request errors (bad JSON, wrong charset, too big) are the client's fault: answer 4xx and log nothing,
// because body-parser messages can quote the start of what was sent (list text).
export function errorHandler(err, req, res, next) {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That's too big. Photos up to 5 MB." });
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: "Bad request." });
  if (err.code === "42P01") return res.status(503).json({ error: "The database has no tables yet. Run db/schema.sql (see the README)." });
  console.error(JSON.stringify({ event: "error", path: req.path, message: err.message }));
  res.status(500).json({ error: err.message.startsWith("AI call failed") ? "The AI didn't answer. Try again." : "Something went wrong." });
}
