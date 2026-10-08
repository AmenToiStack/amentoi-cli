---
name: amentoi-cli
description: Use one Amen Toi account API key to manage Link pages, Forms, People and permitted service tools across accessible workspaces.
---

# amentoi-cli

Use `amentoi-cli` when the user asks to manage Amen Toi content or read its statistics. Always use `--json` for programmatic calls. Read `amentoi-cli --help` and `amentoi-cli <resource> --help` before using an unfamiliar command.

## Setup

Install Bun, then install the release or run `npx api2cli install t0piCyb/amentoi-cli`. Production Core, Link, Forms, and People API origins are built in; override them with `amentoi-cli config set <service> <https-url>` for staging. A new product can be configured by its Core product key and reached through `api call` when Core exposes a key-session audience for it.

Create an account-wide key in the Amen Link API key settings with the needed Link, Forms, and People read/write scopes. Pipe it to `amentoi-cli auth set` or set `AMENTOI_API_KEY`. Never print the key or pass it as a command argument in a shared shell. Run `amentoi-cli auth test --json`, then `amentoi-cli workspaces list --json` and `amentoi-cli workspaces use <id-or-slug>`. Use `--workspace ID` for a one-command override. An old `AMENTOI_API_KEY` environment variable takes precedence over a saved key.

The shared key can omit an expiry, but remains revocable. The CLI exchanges it through Core for a five-minute product token bound to the selected workspace. Access requires an active membership, a creation-time grant, the requested scope, and product installation and entitlement. Do not retry denied actions with a different user's credentials.

## Resources

| Resource | Commands |
| --- | --- |
| `pages` | `list`, `get`, `create`, `update`, `publish`, `stats` |
| `blocks` | `create`, `update`, `subtitle`, `delete`, `window`, `image`, `thumbnail` |
| `forms` | `list`, `get`, `create`, `update`, `publish`, `stats` |
| `submissions` | `list`, `get` |
| `people` | `list`, `get`, `create`, `update`, `archive`, `restore`, `overview`, `stats` |
| `workspaces` | `list`, `use`, `current` |
| `tools` | `list <service>`, `call <service> <tool-name>` |
| `api` | `call`, `download`, `upload` for existing `/v1` endpoints |

Examples:

```bash
amentoi-cli pages list --json
amentoi-cli pages create --slug mon-profil --title 'Mon profil' --json
amentoi-cli blocks create PAGE_ID --type LINK --data '{"url":"https://example.com","label":"Site"}' --subtitle '45 min' --json
amentoi-cli blocks subtitle PAGE_ID BLOCK_ID 'Inscriptions until 12 October' --json   # or --clear
amentoi-cli pages stats PAGE_ID --days 30 --json
amentoi-cli forms create --file form.json --json
amentoi-cli submissions list FORM_ID --json
amentoi-cli --workspace ORG_ID people overview --json
```

Use `api call` for existing operations not yet wrapped as resource commands. Use `--data` or `--file` for JSON bodies. `--json` yields an `{ok,data,meta}` envelope. `--format csv` and `--format yaml` are available for suitable responses. Exit 0 means success; a nonzero code means usage or API failure.

Songs and Liturgy do not currently have Core key-session routes. Existing workspace-only keys stay restricted to their original workspace.
