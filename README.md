# FLUZ Lucky Defense Tools

An unofficial Lucky Defense toolkit built and maintained by FLUZ.

The current release includes:

- a rune inventory builder with v1.0 outdated and v2.0.9 latest recommendation sets;
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

The application targets Cloudflare Workers with static assets, D1, R2, a Durable Object, and rate-limit bindings.

1. Copy `wrangler.example.jsonc` to `wrangler.jsonc`.
2. Create a D1 database, an R2 bucket, and the rate-limit namespaces.
3. Replace the placeholder binding identifiers in `wrangler.jsonc`.
4. Apply the D1 files in `migrations/`.
5. Set the private moderator secrets with Wrangler: `MODERATOR_USERNAME`, `MODERATOR_PASSWORD`, and `MODERATOR_SESSION_SECRET`.
6. Run `npm run deploy`.

The real production identifiers and deployment configuration are intentionally excluded from this repository.

## Privacy and architecture

Builder calculations happen in the browser. Inventory, history, screenshots, and drafts stay local unless the user chooses an export or optional sync. Device sync encrypts builder data in the browser before it reaches Cloudflare. The server stores encrypted state and revision metadata, not account profiles.

Private moderator analytics use the existing visitor Durable Object for compact aggregate counters. The browser sends only an anonymous SHA-256 visitor hash plus an allowlisted page/event name. The private Control Station at `/moderator/analytics` also retains five-minute Worker, D1, and Durable Object health-probe results, outage intervals, and fixed incident categories. It never stores screenshots, filenames, inventories, IP addresses, country, referrers, device details, scan contents, raw exception text, or raw browser identifiers.

## Project ownership

The application source and FLUZ Tools branding are maintained by FLUZ. This repository intentionally excludes private research material, source spreadsheets, personal screenshots, backup archives, and production credentials.

This is an independent fan project and is not affiliated with or endorsed by the game publisher. Game names and visual assets belong to their respective owners and are included only to support the fan tool.

No license is granted for third-party game assets.
