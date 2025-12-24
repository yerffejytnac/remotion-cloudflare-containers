# Feature: Refactor Upload Logic

## Problem Statement

When making render requests to the deployed Cloudflare Worker, the response returned `error code: 1101` instead of the expected JSON response with render details. The Cloudflare dashboard logs showed the render completed successfully ("Render finished."), but the client received an error.

### Original Error
```bash
curl -X POST https://remotion-renderer.tremendous.dev/render \
  -H "Content-Type: application/json" \
  -d '{"compositionId": "HelloWorld", ...}'

# Response:
error code: 1101
```

## Root Cause Analysis

### What is Error Code 1101?

According to [Cloudflare Workers Error Documentation](https://developers.cloudflare.com/workers/observability/errors/), error code `1101` indicates that:

> "A Worker threw a JavaScript exception during execution"

This can occur when:
1. An unhandled exception is thrown
2. A Promise is never resolved or rejected
3. The Worker fails to return a valid `Response` object

### Why It Happened

The original implementation had a problematic flow:

**Original `container.ts` (Worker):**
```typescript
const response = await container.fetch(request);
if (response.status === 200) {
  const buffer = await response.arrayBuffer();  // ⚠️ Problem 1
  const fileBuffer = Buffer.from(buffer);       // ⚠️ Problem 2
  const file = new File([fileBuffer], "output.mp4", { type: "video/mp4" });
  await env.R2_BUCKET.put(key, file);
  // ...
}
```

**Original `server.ts` (Container):**
```typescript
const fileBuffer = await fs.readFile(outputLocation);  // ⚠️ Buffering entire file
res.status(200).send(fileBuffer);                       // ⚠️ Sending as single chunk
```

### Problems Identified

1. **Memory Buffering**: The entire video file (~2MB+) was being read into memory multiple times:
   - Container: `fs.readFile()` loads entire file into memory
   - Worker: `response.arrayBuffer()` buffers the entire response again
   - Worker: `Buffer.from(buffer)` creates yet another copy

2. **No Error Handling**: The Worker had no try-catch block, so any exception during the buffer operations would result in an unhandled exception (error 1101).

3. **Potential Timeout Issues**: Per [Cloudflare Containers Documentation](https://developers.cloudflare.com/containers/platform-details/#limits), the long-running render operation (~40 seconds) combined with large buffer operations could hit internal limits.

## Solution

### Architecture Change

The refactored solution implements two upload paths:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEW ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Path A: Container Direct Upload (Preferred - if R2 credentials available) │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  Worker → Container → [Render] → S3 API → R2 Bucket                        │
│     │                                          │                            │
│     └──────────── JSON metadata ◄──────────────┘                           │
│                                                                             │
│  Path B: Worker Streaming Upload (Fallback)                                │
│  ────────────────────────────────────────────────────────────────────────── │
│                                                                             │
│  Worker → Container → [Render] → Stream body → Worker → R2 Bucket          │
│     │                                                        │              │
│     └────────────────── JSON metadata ◄──────────────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Changes

#### 1. `src/container.ts` - Worker Entry Point

**Added comprehensive error handling:**
```typescript
try {
  // ... render logic
} catch (error) {
  console.error(`[${renderId}] Worker error:`, error);
  return Response.json({
    error: "Render failed",
    message: error instanceof Error ? error.message : String(error),
    renderId,
  }, { status: 500 });
}
```

**Changed from buffering to streaming:**
```typescript
// OLD (buffering):
const buffer = await response.arrayBuffer();
const fileBuffer = Buffer.from(buffer);
await env.R2_BUCKET.put(key, file);

// NEW (streaming):
const body = response.body;
const r2Object = await env.R2_BUCKET.put(key, body, {
  httpMetadata: { contentType: "video/mp4" },
});
```

**Added R2 credential passing for direct container upload:**
```typescript
const enhancedBody = {
  ...originalBody,
  renderId,
  r2Config: {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
  },
};
```

**Added dual response handling:**
```typescript
if (contentType.includes("application/json")) {
  // Container uploaded directly to R2
  const result = await response.json();
  // Forward metadata
} else {
  // Container returned buffer, stream to R2
  await env.R2_BUCKET.put(key, response.body, ...);
}
```

#### 2. `src/server.ts` - Container Render Server

**Added S3 client for direct R2 upload:**
```typescript
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const getS3Client = (config: R2Config | undefined): S3Client | null => {
  if (!config?.accountId || !config?.accessKeyId || !config?.secretAccessKey) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};
```

**Added conditional upload logic:**
```typescript
const s3Client = getS3Client(r2Config);
if (s3Client && renderId && r2Config) {
  // Upload directly to R2 via S3 API
  await s3Client.send(new PutObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: "video/mp4",
  }));
  
  // Return just metadata (small JSON, not video buffer)
  res.status(200).json({ success: true, renderId, key, size: fileSize, uploadedToR2: true });
} else {
  // Fallback: return video buffer
  res.status(200).send(fileBuffer);
}
```

#### 3. `wrangler.toml` - Configuration

**Documented required secrets:**
```toml
# Required secrets (set via `npx wrangler secret put <name>`):
# - R2_ACCESS_KEY_ID: R2 API token access key ID
# - R2_SECRET_ACCESS_KEY: R2 API token secret access key
# Create these at: https://dash.cloudflare.com/?to=/:account/r2/api-tokens
```

### Dependencies Added

- `@aws-sdk/client-s3`: S3-compatible client for direct R2 uploads from container

## Configuration

### Optional: Enable Direct Container Upload

For optimal performance, configure R2 API credentials to allow the container to upload directly:

1. **Create R2 API Token:**
   - Visit https://dash.cloudflare.com/?to=/:account/r2/api-tokens
   - Create token with "Object Read & Write" permission for `remotion-renders` bucket
   - Copy the Access Key ID and Secret Access Key

2. **Set Worker Secrets:**
   ```bash
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   ```

Without these secrets, the system falls back to streaming through the Worker, which still works but is slightly slower.

## Results

### Before
```bash
curl -X POST https://remotion-renderer.tremendous.dev/render ...
# Response: error code: 1101
```

### After
```bash
curl -X POST https://remotion-renderer.tremendous.dev/render ...
# Response:
{
  "renderId": "ead68f9d-2f6e-4247-8e0c-a01bf980cd13",
  "bucketName": "remotion-renders",
  "key": "ead68f9d-2f6e-4247-8e0c-a01bf980cd13.mp4",
  "size": 2209377,
  "url": "https://renders.tremendous.dev/ead68f9d-2f6e-4247-8e0c-a01bf980cd13.mp4"
}
```

## References

- [Cloudflare Workers Error Codes](https://developers.cloudflare.com/workers/observability/errors/) - Documentation on error 1101
- [Cloudflare Containers Overview](https://developers.cloudflare.com/containers/) - Container architecture reference
- [Cloudflare Containers Platform Details](https://developers.cloudflare.com/containers/platform-details/) - Limits and configuration
- [Cloudflare R2 S3 API Compatibility](https://developers.cloudflare.com/r2/api/s3/) - Using S3 SDK with R2

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/container.ts` | Modified | Added error handling, streaming upload, R2 credential passing |
| `src/server.ts` | Modified | Added S3 client, conditional direct R2 upload |
| `wrangler.toml` | Modified | Added documentation for required secrets |
| `package.json` | Modified | Added `@aws-sdk/client-s3` dependency |
| `bun.lock` | Modified | Updated lockfile |
