# Changelog

## 0.5.1

- Add `amentoi-cli version [--json]`: the installed version, the latest GitHub release, `updateAvailable`, and the command that updates this install (`api2cli install AmenToiStack/amentoi-cli --force` for an api2cli install, else `npm install -g <release tgz>`).
- Once a day at most, the CLI checks the latest release in the background and, when a newer one exists, prints one line on stderr (stdout and `--json` stay clean). `AMENTOI_NO_UPDATE_CHECK=1` or `CI=true` turns it off.

## 0.5.0

- Add `mail campaigns create|update|preview|test|test-recipients`: draft a campaign, render it with its recipient count (`meta.unresolvedTags` flags any merge tag left raw), and send a test through Amen Mail with `--first-name` and repeatable `--var key=value`. Merge tags are only substituted by Amen Mail; a campaign tested by hand through another mailbox shows them raw. Needs `mail.campaign.write`. Sending or scheduling to the audience is still not offered.

## 0.4.0

- Add `connections list|connect|disconnect|resync` for Core product connections (people -> mail, forms -> people, forms -> link, store -> link). These Core routes act for a signed-in user: set `AMENTOI_USER_TOKEN`; a workspace API key is refused and the CLI says so without sending anything.
- Add `people mail-status` (People `GET /v1/integrations/connections`) and `people mail-resync` (`POST /v1/integrations/mail/resync`, needs `people.export.write`).
- Add read-only `mail` commands: `contacts list|get` (filters by tag, origin, legal basis, status), `tags list`, `segments list|get`, `campaigns list|get|report`, `sources`. `mail` is a new service key with the production origin `https://mail.amentoi.com` built in.
- `forms create|update` take `--send-to-people` / `--no-send-to-people` and `--respondent-tags a,b`; `forms update` merges them onto the current settings; `forms get` shows a `people` block.
- No command is offered for `mail.integration.write` or `people.optout.write`, which are forbidden to API keys.

## 0.3.0

- One account API key across Amen Toi workspaces.
