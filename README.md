# amentoi-cli

An [api2cli](https://api2cli.dev/docs/create-cli) scaffold adapted for the Amen Toi multi-service API. Commands are organized by resource, have help at every level, and support `--json` for agent workflows. One account API key is sent only to Core. Core exchanges it for a five-minute, audience-bound token for Link, Forms, or People in the selected workspace. Each service checks its own permissions and entitlements.

## Install

[Bun](https://bun.sh/) is required for the api2cli binary. Download the release package:

```bash
npm install -g https://github.com/AmenToiStack/amentoi-cli/releases/download/v0.4.0/amentoi-cli-0.4.0.tgz
amentoi-cli --help
```

The repository also has `skills/amentoi-cli/SKILL.md` for agents and can be installed by `npx api2cli install AmenToiStack/amentoi-cli` once the repository is published.

## Configure

```bash
printf '%s' "$AMENTOI_API_KEY" | amentoi-cli auth set
amentoi-cli auth test --json
amentoi-cli workspaces list --json
amentoi-cli workspaces use personal-slug
amentoi-cli pages list --json
amentoi-cli --workspace OTHER_WORKSPACE_ID forms list --json
```

Create an account-wide key in Amen Link API key settings with the service scopes you need. The key grants only workspaces where you may manage API keys, and each request uses the intersection of the key's scopes, its creation-time grant, your current workspace rights, and product installation and entitlements. Select a workspace with `workspaces use` or override it with `--workspace ID` or `AMENTOI_WORKSPACE_ID`. Existing workspace-only keys remain restricted to their original workspace. If `expiresAt` is omitted at creation, the key does not expire automatically; it can still be revoked or rotated. Five-minute service tokens are never saved.

Production URLs for Core, Link, Forms, People, and Mail are configured by default. For staging, local development, or another Core-supported product, use `amentoi-cli config set <service> <url>` or `AMENTOI_<SERVICE>_URL`. `api call` can then reach its existing `/v1` routes through a Core product session. The CLI checks `AMENTOI_API_KEY` first, then `~/.config/tokens/amentoi-cli.txt` (mode 0600), then the previous `~/.config/amentoi/cli.json` key. An old key in `AMENTOI_API_KEY` takes precedence over one saved with `auth set`.

Core has key-session routes for Link, Forms, and People, and for any product named in its `PRODUCT_API_RESOURCES`: Amen Mail works that way (production origin `https://mail.amentoi.com` built in). Songs and Liturgy do not yet have key-session routes. Product availability also depends on the selected workspace type; for example, Forms may not be available in a Personal workspace.

## Commands

```bash
amentoi-cli pages list --json
amentoi-cli pages create --slug mon-profil --title 'Mon profil' --json
amentoi-cli pages get PAGE_ID --json
amentoi-cli blocks create PAGE_ID --type LINK --data '{"url":"https://example.com","label":"Site"}' --json
amentoi-cli blocks window PAGE_ID BLOCK_ID --from 2026-10-01T09:00:00Z --until null --json
amentoi-cli blocks image PAGE_ID --url https://example.com/image.png --output preview.webp --json
amentoi-cli blocks thumbnail PAGE_ID BLOCK_ID --file preview.webp --json
amentoi-cli pages publish PAGE_ID --json
amentoi-cli pages stats PAGE_ID --days 30 --json
amentoi-cli forms create --file form.json --json
amentoi-cli forms publish FORM_ID --json
amentoi-cli submissions list FORM_ID --limit 50 --json
amentoi-cli forms stats --json
amentoi-cli forms create --file form.json --respondent-tags membre,2026 --json
amentoi-cli forms update FORM_ID --no-send-to-people --json
amentoi-cli people mail-status --json
amentoi-cli people mail-resync --json
amentoi-cli mail tags list --json
amentoi-cli mail contacts list --origin PEOPLE_SYNC --basis CONSENT --tags TAG_ID --json
amentoi-cli mail segments list --json
amentoi-cli mail campaigns list --view sent --json
amentoi-cli mail campaigns report CAMPAIGN_ID --json
amentoi-cli mail sources --json
AMENTOI_USER_TOKEN=... amentoi-cli --workspace ORG_ID connections connect people mail --json
AMENTOI_USER_TOKEN=... amentoi-cli --workspace ORG_ID connections list --json
amentoi-cli --workspace ORG_ID people list --query Pierre --json
amentoi-cli --workspace ORG_ID people overview --json
amentoi-cli --workspace ORG_ID people stats --days 30 --json
amentoi-cli tools list people --json
amentoi-cli api call link GET /v1/link/pages --json
amentoi-cli --workspace ORG_ID api download people GET /v1/people/export.csv --output people.csv --json
```

**Forms and People.** Forms send respondents to People by default. `--send-to-people` / `--no-send-to-people` and `--respondent-tags a,b` (at most 20; `''` clears) write `settings.people`; `forms update` reads and merges the current settings because Forms replaces them as a whole. `forms get` shows a `people` block.

**Amen Mail** commands are read-only and need `mail.audience.read`, `mail.segment.read` or `mail.campaign.read`. `mail contacts list --tags` takes tag IDs from `mail tags list`. `mail sources` is `null` outside the Mail audience workspace.

**Needs a signed-in user, not an API key.** `connections list|connect|disconnect|resync` call Core routes that require a user with `core.product.install` (both sides to connect; either side to disconnect or resync). Core refuses API keys there. The CLI has no sign-in flow: export `AMENTOI_USER_TOKEN` (an Amen Identity access token); without it the command fails locally and sends nothing. `people mail-resync` is the key-capable way to replay the directory to Mail (needs `people.export.write`).

**Never offered.** `mail.integration.write` (People to Mail relay) and `people.optout.write` (Mail to People opt-out) are forbidden to API keys by Core, so the CLI has no command for them.

`form.json` is the full API body with `name`, `slug`, and `schema`. `api call` supports JSON endpoints and `--idempotency-key`; `api download` and `api upload` cover binary endpoints. Run `amentoi-cli <resource> <action> --help` for each action's flags and examples.

The `amentoi` binary remains available for existing scripts and also accepts `--workspace ID` and `workspaces list/use/current`. The `amentoi-cli` binary is the api2cli-based interface. Core and each product service enforce permissions; `--json` returns `{ "ok": true, "data": ..., "meta": ... }` or a structured error and a nonzero exit code.
