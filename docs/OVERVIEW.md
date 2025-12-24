# Remotion Cloudflare Rendering Service

A headless video rendering backend that runs on Cloudflare Workers + Containers. This service receives render requests via HTTP, renders videos using Remotion in a Docker container, and stores the output in Cloudflare R2.

## Architecture

```
                                    Cloudflare Edge
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   ┌─────────────────────┐         ┌──────────────────────────────────┐    │
│   │   Cloudflare Worker │         │      Docker Container            │    │
│   │   (container.ts)    │         │      (oven/bun:1-debian)         │    │
│   │                     │         │                                  │    │
│   │  • Entry point      │         │  ┌────────────────────────────┐  │    │
│   │  • Routes requests  │────────▶│  │   Express Server           │  │    │
│   │  • Manages container│         │  │   (server.ts)              │  │    │
│   │  • Saves to R2      │◀────────│  │                            │  │    │
│   │                     │  video  │  │   @remotion/renderer       │  │    │
│   └─────────────────────┘         │  │   Chrome Headless Shell    │  │    │
│            │                      │  └────────────────────────────┘  │    │
│            │                      │                                  │    │
│            ▼                      │  Pre-bundled compositions:       │    │
│   ┌─────────────────────┐         │  ./build (from remotion bundle)  │    │
│   │    R2 Bucket        │         └──────────────────────────────────┘    │
│   │  remotion-renders   │                                                 │
│   │                     │         Durable Object manages container        │
│   │  {uuid}.mp4         │         lifecycle (auto-sleep after 10m)        │
│   └─────────────────────┘                                                 │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## What This Repo Does

| ✅ Does | ❌ Does Not |
|---------|-------------|
| Headless video rendering | Host Remotion Studio |
| HTTP API for render requests | Provide a visual editor |
| Store rendered videos in R2 | Serve preview/development UI |
| Auto-scale containers (up to 10) | Edit compositions |
| Auto-sleep after inactivity | Stream video in real-time |

## Key Components

### 1. Worker Entry (`src/container.ts`)

The Cloudflare Worker that:
- Exposes a `POST /render` endpoint
- Manages the Docker container via Durable Objects
- Saves rendered videos to R2 storage
- Returns render metadata with public URL

```typescript
// Request flow
POST /render → Container.fetch() → Express server → Remotion render → R2 storage
```

### 2. Render Server (`src/server.ts`)

An Express server running inside the Docker container:
- Receives render requests with `compositionId` and `inputProps`
- Uses `@remotion/renderer` to render videos
- Returns the raw video buffer

```typescript
// Example request body
{
  "compositionId": "HelloWorld",
  "inputProps": {
    "titleText": "My Video",
    "titleColor": "#ff0000"
  }
}
```

### 3. Compositions (`src/Root.tsx`)

Demo compositions bundled into the Docker image:
- `HelloWorld` — Animated logo with customizable text/colors
- `OnlyLogo` — Just the animated Remotion logo

These are **placeholders**. In production, replace with your actual compositions.

### 4. Docker Container (`Dockerfile`)

Built on `oven/bun:1-debian` with:
- Chrome Headless Shell for rendering
- All Remotion dependencies
- Pre-bundled compositions (`./build`)

## Configuration

### `wrangler.toml`

```toml
# Required for containers
account_id = "your-account-id"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "remotion-renders"
remote = true  # Connect to real R2 during local dev

[dev]
enable_containers = true

[[containers]]
class_name = "RemotionContainer"
image = "./Dockerfile"
max_instances = 10
instance_type = "standard-1"

[[durable_objects.bindings]]
name = "REMOTION_CONTAINER"
class_name = "RemotionContainer"
```

### Container Behavior

```typescript
// src/container.ts
sleepAfter = "10m"  // Container sleeps after 10 minutes of inactivity
defaultPort = 8080  // Express server port inside container
```

## API Reference

### `POST /render`

Renders a video and saves it to R2.

**Request:**
```json
{
  "compositionId": "HelloWorld",
  "inputProps": {
    "titleText": "Custom Title",
    "titleColor": "#000000",
    "logoColor1": "#91EAE4",
    "logoColor2": "#86A8E7"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "HelloWorld",
    "inputProps": {
      "titleText": "My Custom Video",
      "titleColor": "#ff0000",
      "logoColor1": "#00ff00",
      "logoColor2": "#0000ff"
    }
  }'
```

**Response (200):**
```json
{
  "renderId": "550e8400-e29b-41d4-a716-446655440000",
  "bucketName": "remotion-renders",
  "key": "550e8400-e29b-41d4-a716-446655440000.mp4",
  "url": "https://renders.tremendous.dev/550e8400-e29b-41d4-a716-446655440000.mp4"
}
```

**Response (400):**
```json
{
  "message": "`compositionId` is required."
}
```

**Response (500):**
```json
{
  "message": "Error rendering video.",
  "error": "Stack trace..."
}
```

### `GET /`

Health check / info endpoint.

**Response:**
```
Remotion Worker - use POST /render to render videos
```

## File Structure

```
├── src/
│   ├── container.ts      # Worker entry + Durable Object
│   ├── server.ts         # Express render server (runs in container)
│   ├── index.ts          # Remotion entry point
│   ├── Root.tsx          # Composition definitions
│   ├── index.css         # Tailwind styles
│   └── HelloWorld/       # Demo composition components
├── public/               # Static assets for compositions
├── docs/
│   ├── OVERVIEW.md       # This file
│   └── CHANGELOG.md      # Version history
├── Dockerfile            # Container image definition
├── wrangler.toml         # Cloudflare configuration
├── remotion.config.ts    # Remotion configuration
└── package.json
```

## Development

### Local Development with Remote R2

Run containers locally while saving to your real Cloudflare R2 bucket:

```bash
npx wrangler dev
```

The `remote = true` on the R2 binding connects to your production bucket.

### Fully Local Development

To use local R2 simulation, remove `remote = true` from the R2 binding:

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "remotion-renders"
# remote = true  ← comment out for local simulation
```

Local R2 data is stored in `.wrangler/state/v3/r2/`.

### Preview Remotion Studio

For composition development:

```bash
bun run dev
```

## Deployment

```bash
npx wrangler deploy
```

## Integration with External Apps

### Current Limitation

Compositions are **baked into the Docker image** at build time:

```typescript
// server.ts
const composition = await selectComposition({
  serveUrl: "./build",  // ← Local bundled compositions
  id: compositionId,
  inputProps,
});
```

### Option 1: Bundle Your Compositions Here

1. Replace `src/HelloWorld/` with your compositions
2. Update `src/Root.tsx` with your composition definitions
3. Rebuild and deploy

### Option 2: Accept External Bundle URL

Modify `server.ts` to accept a `serveUrl` in the request:

```typescript
app.post("/render", async (req, res) => {
  const { compositionId, inputProps, serveUrl } = req.body;
  
  const composition = await selectComposition({
    serveUrl: serveUrl || "./build",
    id: compositionId,
    inputProps,
  });
  // ...
});
```

## Resource Limits

| Resource | Limit |
|----------|-------|
| Max containers | 10 (configurable) |
| Container type | `standard-1` |
| Sleep timeout | 10 minutes |
| Video output | H.264 MP4 |

## Cost Considerations

- **Containers**: Billed per second of runtime
- **R2 Storage**: Billed per GB stored + operations
- **Workers**: Billed per request (generous free tier)

Containers auto-sleep after 10 minutes of inactivity to minimize costs.
