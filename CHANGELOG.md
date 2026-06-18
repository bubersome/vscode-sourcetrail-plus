# Changelog

## 0.1.1 — 2026-06-18

### Fixed
- Right-click "Sourcetrail: Send Location" menu was hidden because the
  \`navigation@9\` group + \`editorTextFocus\` when-clause conflicted with
  other extensions / editor states. Reverted to the original
  \`sourcetrailgroup@1\` group so the entry always shows.

## 0.1.0 — 2026-06-18 (fork)

Forked from astallinger.sourcetrail 0.0.2.

### Changed
- Default ports changed from 6666/6667 → **17666/17667** to avoid
  Electron's Node-inspector worker (`--inspect-port=0`) randomly grabbing 6666.
- Default `startServerAtStartup` flipped to `true`.

### Added
- Dedicated **Sourcetrail** Output channel — every TCP send/recv logged
  with timestamp + direction. Click status bar item to open.
- `Sourcetrail: Reconnect` command — rebinds without restarting VSCode.
- `Sourcetrail: Show Output` and `Sourcetrail: Show Last Error` commands.
- Exponential-backoff retry on `EADDRINUSE` (up to 30 s).
- Automatic re-bind when port settings change at runtime.
- 4-state status bar (disconnected / connecting / connected / error)
  with tooltip explaining state.
- `navigation` group for the right-click "Send Location" entry
  (now appears at top of context menu).

### Fixed
- Send-error handler no longer swallows the underlying error code —
  user sees `Cannot send (EHOSTUNREACH)` etc.
- Connection timeouts (3 s) so a stale socket doesn't hang the plugin.

## 0.0.2 — original
Initial release by Coati Software.
