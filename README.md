# FLUZ Lucky Defense Tools

An unofficial Lucky Defense toolkit built and maintained by FLUZ.

The current release includes:

- a rune inventory builder with Meta v1.0 and v1.1 recommendation sets;
- anonymous encrypted cross-device sync with no user accounts;
- a complete rune reference matrix;
- an interactive one-player and two-player board builder;
- local board saves, JSON backups, share links, PNG exports, and board discovery.

Live site: [ld.fluz-tools.com](https://ld.fluz-tools.com)

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Run the verification suite with:

```bash
npm test
npm run typecheck
npm run build
```

## Cloudflare setup

The application targets Cloudflare Workers with static assets, D1, and a rate-limit binding.

1. Copy `wrangler.example.jsonc` to `wrangler.jsonc`.
2. Create a D1 database and apply the files in `migrations/`.
3. Replace the placeholder binding identifiers in `wrangler.jsonc`.
4. Run `npm run deploy`.

The real production identifiers and deployment configuration are intentionally excluded from this repository.

## Privacy and architecture

Builder calculations happen in the browser. Inventory, history, and drafts are saved locally. Optional device sync encrypts builder data in the browser before it reaches Cloudflare. The server stores encrypted state and revision metadata, not account profiles.

## Project ownership

The application source and FLUZ Tools branding are maintained by FLUZ. This repository intentionally excludes private research material, source spreadsheets, personal screenshots, backup archives, and production credentials.

This is an independent fan project and is not affiliated with or endorsed by the game publisher. Game names and visual assets belong to their respective owners and are included only to support the fan tool.

No license is granted for third-party game assets.
