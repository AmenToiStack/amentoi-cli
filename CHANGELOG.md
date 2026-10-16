# Changelog

## 0.4.0

- Add `connections list|connect|disconnect|resync` for Core product connections (people -> mail, forms -> people, forms -> link, store -> link). These Core routes act for a signed-in user: set `AMENTOI_USER_TOKEN`; a workspace API key is refused and the CLI says so without sending anything.
- Add `people mail-status` (People `GET /v1/integrations/connections`) and `people mail-resync` (`POST /v1/integrations/mail/resync`, needs `people.export.write`).
- Add read-only `mail` commands: `contacts list|get` (filters by tag, origin, legal basis, status), `tags list`, `segments list|get`, `campaigns list|get|report`, `sources`. `mail` is a new service key with no built-in origin: `amentoi-cli config set mail <url>`.
- `forms create|update` take `--send-to-people` / `--no-send-to-people` and `--respondent-tags a,b`; `forms update` merges them onto the current settings; `forms get` shows a `people` block.
- No command is offered for `mail.integration.write` or `people.optout.write`, which are forbidden to API keys.

## 0.3.0

- One account API key across Amen Toi workspaces.
