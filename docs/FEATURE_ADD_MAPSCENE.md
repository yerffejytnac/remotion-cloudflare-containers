# Feature: Add MapScene Composition

This document describes the migration of the MapScene composition from `remotion-sandbox-nextjs` to `remotion-cloudflare-containers`.

## Overview

MapScene is a Remotion composition that renders an animated map video using MapLibre GL. It features:

- 3D map with buildings rendered via MapLibre GL (WebGL)
- Animated camera orbit (360° rotation) with zoom progression
- Location marker with optional image/video media
- Category-based color theming (5 types)
- Instagram Reels format (1080x1920 @ 30fps)

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `maplibre-gl` | ^5.15.0 | WebGL map rendering engine |
| `@remotion/media-utils` | 4.0.394 | `getVideoMetadata()` for dynamic composition duration |

Install command:
```bash
bun add maplibre-gl @remotion/media-utils
```

## File Structure

All MapScene files are colocated in a single directory for maintainability:

```
src/MapScene/
├── MapScene.tsx      # Main composition component
├── index.ts          # Barrel exports
├── constants.ts      # Schema, colors, helpers
└── map-style.json    # MapLibre vector tile style (~3400 lines)
```

### File Descriptions

#### `constants.ts`

Contains:
- `MapSceneProps` - Zod schema for composition props
- `CATEGORY_COLORS` / `CATEGORY_LABELS` - 5 color-coded categories
- `getMediaType()` - Detects video vs image from URL extension
- Video dimension constants: 1080x1920 @ 30fps (Instagram Reels format)
- Duration constants: 30-60 seconds

#### `MapScene.tsx`

The main component with:
- MapLibre GL map initialization with 3D buildings
- `delayRender()` / `continueRender()` for async tile loading
- Camera animation: zoom 16→18, 360° orbit, 45° pitch
- Instagram safe zone awareness (top 250px, bottom 350px reserved)
- Animated marker with optional `<Img>` or `<OffthreadVideo>` media

#### `map-style.json`

Protomaps dark theme vector tile style with:
- Source: `https://tiles.tremendous.dev/illinois.json`
- 3D building extrusions
- Custom fonts and sprites

## Configuration Changes

### `remotion.config.ts`

Added OpenGL renderer for WebGL/MapLibre:

```ts
// Required for WebGL/MapLibre rendering - prevents flickering
Config.setChromiumOpenGlRenderer("angle");
```

**Why:** MapLibre uses WebGL which requires a proper OpenGL backend. Without this, the map may flicker or fail to render correctly.

Reference: [Remotion GL Options](https://www.remotion.dev/docs/gl-options)

### `src/server.ts`

Added `chromiumOptions` to both `selectComposition()` and `renderMedia()`:

```ts
const chromiumOptions = {
  gl: "angle" as const,
};

const composition = await selectComposition({
  serveUrl: "./build",
  id: compositionId,
  inputProps,
  chromiumOptions,
});

await renderMedia({
  composition,
  inputProps,
  codec: "h264",
  outputLocation,
  serveUrl: "./build",
  chromiumOptions,
  imageFormat: "jpeg",
  jpegQuality: 90,
});
```

**Why:** The `remotion.config.ts` only applies to CLI commands. For Node.js APIs like `renderMedia()`, options must be passed directly.

Reference: [Remotion Chromium Flags](https://www.remotion.dev/docs/chromium-flags)

### `src/Root.tsx`

Added MapScene composition with dynamic duration calculation:

```tsx
import { getVideoMetadata } from "@remotion/media-utils";

const calculateMapSceneMetadata = async ({ props }) => {
  if (props.mediaUrl && getMediaType(props.mediaUrl) === "video") {
    const metadata = await getVideoMetadata(props.mediaUrl);
    // Clamp duration between 30-60 seconds
    return { durationInFrames: Math.ceil(targetDuration * VIDEO_FPS) };
  }
  return { durationInFrames: DEFAULT_DURATION_FRAMES };
};

<Composition
  id={MAP_COMP_NAME}
  component={MapScene}
  calculateMetadata={calculateMapSceneMetadata}
  // ...
/>
```

## GL Renderer Options

From [Remotion GL Options documentation](https://www.remotion.dev/docs/gl-options):

| Renderer | Use Case |
|----------|----------|
| `null` | Default, lets Chrome decide |
| `angle` | Desktop with GPU (recommended for WebGL) |
| `angle-egl` | Cloud instance with GPU (Linux) |
| `swangle` | No GPU available, software rendering (slower) |
| `swiftshader` | Legacy software renderer |

**Recommended for this project:**
- Local development: `angle`
- Docker without GPU: `swangle` (may be slower)
- Lambda: `swangle` (default)

## Known Issues

### Map Flickering in Docker

When rendering in Docker containers without GPU access, the map may flicker (appear blank on some frames). This is due to:

1. Concurrent frame rendering creating multiple browser contexts
2. Each context needs to load map tiles independently
3. Tiles may not be fully loaded when frame is captured

**Potential solutions:**
1. Use `gl: "swangle"` for software rendering
2. Reduce concurrency with `concurrency: 1` (slower but more reliable)
3. Use a GPU-enabled Docker host with `angle-egl`

### Linux Dependencies

The Docker container requires specific libraries for Chrome Headless Shell. From [Remotion Linux Dependencies](https://www.remotion.dev/docs/miscellaneous/linux-dependencies):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 \
  libdbus-1-3 \
  libatk1.0-0 \
  libasound2 \
  libxrandr2 \
  libxkbcommon-dev \
  libxfixes3 \
  libxcomposite1 \
  libxdamage1 \
  libgbm-dev \
  libcups2 \
  libcairo2 \
  libpango-1.0-0 \
  libatk-bridge2.0-0
```

## Usage

### Remotion Studio

```bash
bun run dev
# Open http://localhost:3000, select "MapScene" from sidebar
```

### CLI Render

```bash
bunx remotion render src/index.ts MapScene out/video.mp4 \
  --props='{"title":"Test","type":1,"latitude":"41.9484","longitude":"-87.6553","mediaUrl":""}'
```

### API Render (Docker)

```bash
curl -X POST http://localhost:8080/render \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "MapScene",
    "inputProps": {
      "title": "Location Name",
      "type": 3,
      "latitude": "41.9484",
      "longitude": "-87.6553",
      "mediaUrl": "https://example.com/image.jpg"
    },
    "renderId": "unique-id"
  }'
```

## Props Schema

| Prop | Type | Description |
|------|------|-------------|
| `title` | string | Location title displayed on video |
| `type` | number (1-5) | Category type, determines badge color |
| `latitude` | string | Latitude as string (parsed to float) |
| `longitude` | string | Longitude as string (parsed to float) |
| `mediaUrl` | string | Optional image/video URL for marker |

## References

- [Remotion GL Options](https://www.remotion.dev/docs/gl-options)
- [Remotion Chromium Flags](https://www.remotion.dev/docs/chromium-flags)
- [Remotion Linux Dependencies](https://www.remotion.dev/docs/miscellaneous/linux-dependencies)
- [Remotion Performance](https://www.remotion.dev/docs/performance)
- [Remotion Flickering](https://www.remotion.dev/docs/flickering)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
