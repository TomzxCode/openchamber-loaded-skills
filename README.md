# Loaded skills

An [OpenChamber](https://github.com/openchamber/openchamber) extension that
shows the skills an agent actually loaded in the session you are viewing.

The Work Status panel has a "Context sources" section, and its Skills row
counts the skills available to load. This section lists the ones that were
loaded, read from the session's own `skill` tool calls, and it follows the
session you switch to.

## Install

[Install Loaded skills](openchamber://extensions/install?url=https%3A%2F%2Fgithub.com%2Ftomzxcode%2Fopenchamber-loaded-skills)

Or add the repository URL in Settings, Extensions. Web and desktop only; VS
Code and the phone load no extensions.

## What it asks for

- A local service that reads session messages over OpenChamber's read-only
  OpenCode connection (`service` and `opencode` grants).
- Session events (turn started, finished, session created) without content, so
  an open section can refresh when the turn it shows changes. It never sees
  the conversation text.

## How it works

- `status/` is the Work Status section: a frame that reads the current session
  id and draws the loaded skills as compact chips. A chip with a known
  SKILL.md path is clickable and copies that path, since the guest API has no
  open-file call.
- `service/` answers `GET /skills?session=<id>` by fetching that session's
  messages over the loopback OpenCode connection and extracting the skill tool
  calls. It relays turn events to the section so the rows stay current.

## Development

```sh
bun install
bunx openchamber-guest-bundle status/main.ts status/main.js
bunx openchamber-guest-bundle --node service/main.ts service/main.js
bunx openchamber-guest-check
```
