import { MAX_ITEMS, MAX_ITEM_TEXT, MAX_TITLE } from "./limits.js";

const PROMPT = `Turn the user's list into a clean to-do list.
Reply with JSON only: {"title": "short title, max 5 words", "items": ["task", "task"]}.
One task per item, short and clear, in the user's language. Fix obvious spelling. Keep their order.
Drop anything that is not a task (doodles, dates on their own, headings). If there are no tasks, return "items": [].`;

// Offline mode: one item per line, minus bullets, numbers and checkboxes.
// A single line with commas is split on the commas.
export function parseLines(text) {
  let lines = String(text).split(/\r?\n/);
  if (lines.filter((l) => l.trim()).length === 1 && lines.join("").includes(",")) lines = lines.join("").split(",");
  return lines
    .map((l) => l.replace(/^\s*(?:[-*•+]|\d+[.)]|\[[ xX]?\])\s*/, "").replace(/^\s*\[[ xX]?\]\s*/, "").trim())
    .filter(Boolean);
}

export function clean(title, items) {
  return {
    title: String(title || "").trim().slice(0, MAX_TITLE) || "My list",
    items: items.map((i) => String(i).trim().slice(0, MAX_ITEM_TEXT)).filter(Boolean).slice(0, MAX_ITEMS),
  };
}

// Models sometimes wrap JSON in prose or code fences.
export function parseReply(content) {
  const m = String(content).match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (Array.isArray(j.items)) return clean(j.title, j.items);
    } catch {}
  }
  return clean("My list", parseLines(content));
}

// image: {type, data: Buffer} or undefined. Returns {title, items}.
export async function makeList(cfg, { text, image }) {
  if (!cfg) {
    if (image) return clean("Photo list", ["Offline mode can't read photos. Add an AI key to try it."]);
    return clean("My list", parseLines(text));
  }
  const content = image
    ? [{ type: "text", text: "Here is a photo of my list." },
       { type: "image_url", image_url: { url: `data:${image.type};base64,${image.data.toString("base64")}` } }]
    : text;
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: "system", content: PROMPT }, { role: "user", content }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`AI call failed (${res.status})`);
  const data = await res.json();
  return parseReply(data.choices?.[0]?.message?.content ?? "");
}

