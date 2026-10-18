# ListSnap

Write a messy list or snap a photo of a handwritten one. AI turns it into a clean to-do list you can check off, edit and delete.

A small demo app for [Open Cloud](https://github.com/theailifestyle/open-cloud) App Runner: one Node server, one HTML page, vanilla JS. It uses all three managed pieces:

- **Postgres** (Open RDS) for lists and items
- **S3-compatible object storage** (Open S3) for the photos, shown as a thumbnail next to the list they came from
- **AI** through the Open Cloud provider key (OpenRouter, any vision model) or the Open Bedrock gateway

No accounts, no tracking. It stores only the list text, the photo and when the list was made.

## Run it locally

You need Docker with Compose 2.23 or newer.

```sh
git clone https://github.com/theailifestyle/listsnap && cd listsnap
cp .env.example .env        # optional: paste an OpenRouter key into .env
docker compose up --build
```

Open http://localhost:8080.

Compose starts the app, Postgres and SeaweedFS (the same S3 server Open S3 runs), creates the tables and the `listsnap` bucket. Like on Open Cloud, the app connects as a database role that can read and write rows but can't create tables.

**Offline mode.** Without a key the app still works: typed lists are split into items line by line (bullets, numbers and checkboxes are stripped, a single comma line is split on commas). Photos are stored and shown but not read; their list says to add a key.

Start over with `docker compose down -v`.

## Deploy on Open Cloud

All in the console, plus one command for the tables.

1. **App Runner → Create service.** Name `listsnap`, Git repo `https://github.com/theailifestyle/listsnap`, port `8080`. Pick **External** to get a public URL (`https://listsnap.<apps domain>`; see DNS below), then **Deploy**. The repo ships an `opencloud.json`, so the app runs with a read-only filesystem and the deploy waits for `GET /health`.
2. On the service page, click **Create Postgres database**.
3. Create the tables once, as the database owner, on the server:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/theailifestyle/listsnap/main/db/schema.sql \
     | sudo docker exec -i oc-app-listsnap-db-1 psql -U app -d app
   ```
   The app's own role has no CREATE rights, so it can't do this itself. Until then the page says the database has no tables.
4. **Create bucket** named `listsnap`. (Another name? Also **Save secret** `S3_BUCKET` with that name.)
5. **AI provider key:** type `OPENROUTER_API_KEY` and **Save**. The app gets the key you set under Open Bedrock → Initiate AI.
6. Open the service URL. The three dots at the top (Postgres, Object storage, AI) should all be green.

Each step restarts the app with the new values. No rebuild needed. After a code change, click **Redeploy latest**.

**DNS for the public URL.** The URL is `listsnap.<OC_APPS_DOMAIN>`. Open Cloud never creates DNS records: add an A record for that name pointing to your server first (or a wildcard `*.<apps domain>`). The edge gets a Let's Encrypt certificate on the first visit after DNS resolves. For a different name, add it under **Open ELB → route → Custom domains** and give it an A record too.

## Settings

On Open Cloud every value except `PORT` arrives as a file in `/run/secrets/<NAME>`. Locally the same names are environment variables. The app reads the file first, then the variable.

| Name | Set by | Meaning |
|---|---|---|
| `PORT` | App Runner | Port to listen on (default 8080) |
| `DATABASE_URL` | Create Postgres database | Postgres connection string |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Create bucket | Object storage endpoint and this app's key |
| `S3_BUCKET` | you (optional) | Bucket name, default `listsnap` |
| `OPENROUTER_API_KEY` | AI provider key | Provider key; turns on AI mode |
| `LLM_GATEWAY_URL`, `LLM_GATEWAY_KEY` | Enable Open Bedrock (optional) | Use the Open Bedrock gateway instead; set `AI_MODEL` to the endpoint name |
| `AI_MODEL` | you (optional) | Vision-capable model, default `openai/gpt-4o-mini` |
| `AI_BASE_URL` | you (optional) | Another OpenAI-compatible API, default `https://openrouter.ai/api/v1` |

With no key at all the app runs in offline mode.

## Limits

- Typed lists up to 4,000 characters; up to 50 items of 200 characters each.
- Photos: JPEG, PNG or WebP (checked from the file bytes), up to 5 MB. The browser shrinks photos to 1600 px before upload, which also keeps them under the Open Bedrock gateway's 1 MB request cap.
- AI calls: 10 per minute per visitor, 60 per minute in total.
- Photos are served through the app (`/photos/...`), so the bucket never needs a public address.

## Tests

```sh
npm install && npm test
```

## Files

```
server.js            routes, Postgres, S3
src/ai.js            prompt, model call, reply parsing, offline parser
src/config.js        reads /run/secrets files (or env vars)
src/limits.js        size caps, image type check, rate limiter
public/              the page (HTML, CSS, vanilla JS)
db/schema.sql        tables (run once as the owner)
opencloud.json       health check, read-only filesystem, /tmp scratch
compose.yaml         local run
```

## License

MIT
