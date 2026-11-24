---
name: amentoi-cli
description: Use one Amen Toi account API key to manage Link pages, Forms (including People settings), People, read Amen Mail, and drive product connections (user session only) across accessible workspaces.
---

# amentoi-cli

Use `amentoi-cli` when the user asks to manage Amen Toi content or read its statistics. Always use `--json` for programmatic calls. Read `amentoi-cli --help` and `amentoi-cli <resource> --help` before using an unfamiliar command.

## Setup

Install Bun, then install the release or run `npx api2cli install AmenToiStack/amentoi-cli`. Production Core, Link, Forms, People, and Mail API origins are built in; override them with `amentoi-cli config set <service> <https-url>` for staging. Amen Mail's production origin is `https://mail.amentoi.com`; for staging use `amentoi-cli config set mail https://mail.dev.amentoi.com` or `AMENTOI_MAIL_URL`. Another product can be configured by its Core product key and reached through `api call` when Core exposes a key-session audience for it.

Create an account-wide key in the Amen Link API key settings with the needed Link, Forms, People and Mail read/write scopes. Pipe it to `amentoi-cli auth set` or set `AMENTOI_API_KEY`. Never print the key or pass it as a command argument in a shared shell. Run `amentoi-cli auth test --json`, then `amentoi-cli workspaces list --json` and `amentoi-cli workspaces use <id-or-slug>`. Use `--workspace ID` for a one-command override. An old `AMENTOI_API_KEY` environment variable takes precedence over a saved key.

The shared key can omit an expiry, but remains revocable. The CLI exchanges it through Core for a five-minute product token bound to the selected workspace. Access requires an active membership, a creation-time grant, the requested scope, and product installation and entitlement. Do not retry denied actions with a different user's credentials.

### Is the CLI up to date?

Run `amentoi-cli version --json` at the start of a session. `data.updateAvailable: true` means a newer release exists: tell the user, and give them `data.command` to run (it reinstalls the CLI and this skill). Do not run it yourself without their go-ahead. Once a day the CLI also prints `amentoi-cli X is available (you have Y). Update: ...` on stderr; relay that line to the user too. A command missing from `--help` (for example `mail campaigns test`) usually means an old version: check `version` before concluding the feature does not exist. `AMENTOI_NO_UPDATE_CHECK=1` turns the daily check off.

## Resources

| Resource | Commands |
| --- | --- |
| `pages` | `list`, `get`, `create`, `update`, `publish`, `stats` |
| `blocks` | `create`, `update`, `delete`, `window`, `image`, `thumbnail` |
| `forms` | `list`, `get`, `create`, `update`, `publish`, `stats`. `create` and `update` take `--send-to-people` / `--no-send-to-people` and `--respondent-tags a,b`; `get` shows a `people` block |
| `submissions` | `list`, `get` |
| `people` | `list`, `get`, `create`, `update`, `archive`, `restore`, `overview`, `stats`, `mail-status`, `mail-resync` |
| `mail` | read: `contacts list`, `contacts get`, `tags list`, `segments list`, `segments get`, `campaigns list`, `campaigns get`, `campaigns report`, `sources`; draft and test: `campaigns create`, `campaigns update`, `campaigns preview`, `campaigns test`, `campaigns test-recipients` |
| `connections` | user session only: `list`, `connect <source> <consumer>`, `disconnect <id>`, `resync <id>` |
| `workspaces` | `list`, `use`, `current` |
| `tools` | `list <service>`, `call <service> <tool-name>` |
| `api` | `call`, `download`, `upload` for existing `/v1` endpoints |

Examples:

```bash
amentoi-cli pages list --json
amentoi-cli pages create --slug mon-profil --title 'Mon profil' --json
amentoi-cli blocks create PAGE_ID --type LINK --data '{"url":"https://example.com","label":"Site"}' --json
amentoi-cli pages stats PAGE_ID --days 30 --json   # PAGE_ID or the page slug
amentoi-cli forms create --file form.json --respondent-tags membre,2026 --json
amentoi-cli forms update FORM_ID --no-send-to-people --json
amentoi-cli forms get FORM_ID --json
amentoi-cli submissions list FORM_ID --json
amentoi-cli --workspace ORG_ID people overview --json
amentoi-cli people mail-status --json
amentoi-cli people mail-resync --json
amentoi-cli mail tags list --json
amentoi-cli mail contacts list --origin PEOPLE_SYNC --basis CONSENT --tags TAG_ID --json
amentoi-cli mail campaigns report CAMPAIGN_ID --json
amentoi-cli mail sources --json
AMENTOI_USER_TOKEN=... amentoi-cli --workspace ORG_ID connections connect people mail --json
```

Use `api call` for existing operations not yet wrapped as resource commands. Use `--data` or `--file` for JSON bodies. `--json` yields an `{ok,data,meta}` envelope. `--format csv` and `--format yaml` are available for suitable responses. Exit 0 means success; a nonzero code means usage or API failure.

## Forms and People

Every form sends its respondents to People by default (`settings.people.sendToPeople`, with `respondentTags` applied to each respondent, at most 20). `forms update` replaces the whole settings object on the server, so the People flags read the current settings and merge into them; passing `settings` in `--data` replaces them as given. `--respondent-tags ''` clears the tags.

## Amen Mail

Contacts show tags, origin (`PEOPLE_SYNC`, `CORE_SYNC`, `MANUAL`, `CSV_IMPORT`, `CAPTURE`, `API`) and legal basis (`CONSENT`, `LEGITIMATE_INTEREST`, `NONE`). `mail contacts list --tags` takes tag IDs, comma separated; get them from `mail tags list`. Tags mirrored from People are marked `system`. `mail sources` returns `null` outside the Mail audience workspace. Reads need `mail.audience.read`, `mail.segment.read` or `mail.campaign.read` on the key.

### Writing a campaign and testing it

Merge tags (`{{firstName}}`, `{{firstName|ami}}`, `{{lastName}}`, `{{email}}`, custom field keys) are substituted **only by Amen Mail**. Never test a campaign by sending its text through Gmail or another mailbox: the reader sees the raw `{{...}}`. Test through Amen Mail:

```bash
amentoi-cli mail campaigns create --name "Avent 2026" --subject "{{firstName|Bonjour}}, l'Avent commence" --preview-text "..." --body-file avent.md --json
amentoi-cli mail campaigns preview CAMPAIGN_ID --html /tmp/avent.html --json   # recipients count + meta.unresolvedTags
amentoi-cli mail campaigns test-recipients --json                               # allowed test addresses and domains
amentoi-cli mail campaigns test CAMPAIGN_ID --to moi@exemple.fr --first-name Pierre --var paroisse="Saint-Jean" --json
amentoi-cli mail campaigns update CAMPAIGN_ID --body-file avent.md --json       # an edit calls for a new test
```

- `--body-file` is Markdown (`bodyMarkdown`); `--content-file` is a block document as the console editor stores it.
- `preview` renders with sample values (Marie Dupont) and returns `recipients` (`eligible` is the number who will receive it). Report that number to the user; never guess it. `meta.unresolvedTags` non-empty means a tag the reader would see raw.
- `test` renders exactly as the send: snippets, organisation theme, and the values of the contact with that address when one exists. Subject prefixed `[TEST]`. Outside production only the test domains are accepted.
- These need `mail.campaign.write` (drafting, tests) or `mail.campaign.read` (preview). A 403 means the key lacks the scope: ask the user for a key with it, do not fall back to a hand-sent email.
- There is no command to send, schedule, delete, import or export. The send to the audience stays a gesture in the console, after a test of the current content.

## What a key can and cannot do

- `mail.integration.write` (the People to Mail relay) and `people.optout.write` (the Mail to People opt-out relay) are forbidden to API keys. Do not look for a way around it. Core, the key exchange and the services all refuse them, and the CLI offers no command for them.
- `people mail-resync` needs `people.export.write` and is refused while People is not connected to Mail. `people mail-status` needs `people.person.read`.
- `connections` calls Core routes that act for a signed-in person (`core.product.install` on both organisations; either side to disconnect or resync). A workspace API key is refused there. The CLI has no sign-in flow: set `AMENTOI_USER_TOKEN` to the Identity access token of such a user, or use the Connectivity screen of the console. Without the variable the command fails locally with a 401-style error and sends nothing. The closed list of pairs is `forms -> link`, `forms -> people`, `people -> mail`, `store -> link`. After `connect people mail`, People replays its directory to Mail; `connections resync <id>` asks for that again, and `people mail-resync` (key-capable) does the same from the People side.
- Mail is single-tenant for now: it refuses any consumer workspace other than its audience workspace.

Songs and Liturgy do not currently have Core key-session routes. Existing workspace-only keys stay restricted to their original workspace.
