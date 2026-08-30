# Quickstart: Cloudinary Image Storage Integration

## Prerequisites

- Everything in `specs/001-porteros-api-migration/quickstart.md` (Node.js 24, a reachable MongoDB instance, a working `/api/auth/sso/exchange` flow so you have a valid access token to authenticate with).
- A Cloudinary account (the free tier is enough for local development) and its **API Environment variable** from the Cloudinary console's dashboard — a single `cloudinary://<api_key>:<api_secret>@<cloud_name>` connection string.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CLOUDINARY_URL` | Yes | `cloudinary://<api_key>:<api_secret>@<cloud_name>` — the Cloudinary SDK parses this itself; never commit a real value |
| `IMAGE_MAX_UPLOAD_SIZE_BYTES` | No (default `10485760`, 10 MB) | Maximum accepted upload size, enforced before the file reaches Cloudinary |

Add these to the same untracked `.env` file used for the rest of local development.

## Install

```bash
npm install cloudinary multer file-type
npm install --save-dev @types/multer
```

## Try it (with a valid access token from the SSO exchange flow)

```bash
TOKEN="<paste-a-valid-access-token-here>"

# Upload
curl -s -X POST http://localhost:3000/api/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/path/to/a/large-photo.jpg" | jq
# → 201, { "id": "...", "url": "https://res.cloudinary.com/...", "format": "jpg", "bytes": ..., "width": ..., "height": ..., "createdAt": "..." }
# Note the stored `bytes` is noticeably smaller than `ls -la large-photo.jpg`'s original size (SC-002).

IMAGE_ID="<id from the response above>"

# Retrieve
curl -s http://localhost:3000/api/images/$IMAGE_ID \
  -H "Authorization: Bearer $TOKEN" | jq
# → 200, same shape as the upload response

# Retrieve as a different (or no) user
curl -i http://localhost:3000/api/images/$IMAGE_ID
# → 401, no body
curl -i http://localhost:3000/api/images/$IMAGE_ID -H "Authorization: Bearer $OTHER_USERS_TOKEN"
# → 403 { "error": "forbidden", ... }

# Delete
curl -i -X DELETE http://localhost:3000/api/images/$IMAGE_ID \
  -H "Authorization: Bearer $TOKEN"
# → 204

# Confirm it's gone
curl -i http://localhost:3000/api/images/$IMAGE_ID -H "Authorization: Bearer $TOKEN"
# → 404 { "error": "image_not_found", ... }
```

## Try the rejection paths

```bash
# Not an image at all (content-sniffed, not extension-based)
echo "not an image" > fake.jpg
curl -i -X POST http://localhost:3000/api/images -H "Authorization: Bearer $TOKEN" -F "image=@fake.jpg"
# → 400 { "error": "invalid_image", ... }

# Oversized file (bigger than IMAGE_MAX_UPLOAD_SIZE_BYTES)
curl -i -X POST http://localhost:3000/api/images -H "Authorization: Bearer $TOKEN" -F "image=@/path/to/a/huge-file.jpg"
# → 413 { "error": "file_too_large", ... }
```

## Automated tests

```bash
npm test              # unit: handlers (fakes) + repository (mocked Collection)
npm run test:http     # supertest against /api/images, fake-backed — no real Cloudinary/Mongo calls
```
