# Remotion on Cloudflare Workers

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.gif">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

A headless Remotion video rendering service that runs on Cloudflare Containers.

## Requirements

- Cloudflare account with Paid Workers plan
- Docker installed locally (for development)
- Signed into Wrangler CLI (`wrangler login`)

## Setup

**Step 1:** Install dependencies

```bash
bun install
```

**Step 2:** Configure `wrangler.toml` with your credentials:

```toml
account_id = "your-cloudflare-account-id"

[vars]
R2_BUCKET_NAME = "your-bucket-name"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"
preview_bucket_name = "your-bucket-name"
remote = true  # Connect to real R2 during local dev
```

**Step 3:** Generate types

```bash
npx wrangler types
```

## Development

```bash
npx wrangler dev
```

This runs containers locally via Docker while connecting to your real R2 bucket (via `remote = true` binding).

> **Note:** The `--remote` flag is deprecated for container development. Use remote bindings instead.

### Test a render

```bash
curl -X POST http://localhost:8787/render \
  -H "Content-Type: application/json" \
  -d '{
    "compositionId": "HelloWorld",
    "inputProps": {
      "titleText": "Hello World",
      "titleColor": "#000000"
    }
  }'
```

## Deployment

```bash
npx wrangler deploy
```

## Documentation

See [docs/OVERVIEW.md](docs/OVERVIEW.md) for detailed architecture and API reference.

## Resources

- [Remotion Documentation](https://www.remotion.dev/docs/the-fundamentals)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [Help on Discord](https://discord.gg/6VzzNDwUwV)

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
