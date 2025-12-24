# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Switched from npm to Bun for faster dependency installation in Docker
- Updated Dockerfile to use `oven/bun:1-debian` base image
- Replaced `--remote` flag workflow with remote bindings (`remote = true` on R2)
- Videos now stored at bucket root instead of `/renders/` prefix
- Response now includes full public URL for rendered videos
- Improved Dockerfile layer caching by separating dependency and source copying
- Combined `remotion browser ensure` and `remotion bundle` into single layer
- Sorted apt packages alphabetically for maintainability
- Added `--no-install-recommends` to apt-get for smaller image size

### Added

- `public/` directory for static assets (required by Remotion)
- `[dev]` section in wrangler.toml with `enable_containers = true`
- `account_id` at top level of wrangler.toml (required for containers)
- `@remotion/renderer` explicitly added to dependencies
- Documentation in `docs/OVERVIEW.md`
- This changelog
- `.dockerignore` to reduce Docker build context size
- OCI labels to Dockerfile for image metadata
- `NODE_ENV=production` environment variable in container
- `HEALTHCHECK` instruction for container liveness monitoring
- Non-root user (`bun`) for container runtime security
- `curl` package for healthcheck support

### Fixed

- Resolved zod version conflict (downgraded to 3.22.3 for @remotion/zod-types compatibility)
- Fixed missing `public/` directory causing Docker build failure
- Fixed container configuration for local development

### Removed

- Removed `package-lock.json` (using bun.lock instead)
- Removed `/renders/` prefix from R2 storage paths

## [0.1.0] - 2024-12-24

### Added

- Initial Remotion + Cloudflare Containers setup
- Express server for headless rendering
- Durable Object container management
- R2 storage integration
- HelloWorld demo composition
