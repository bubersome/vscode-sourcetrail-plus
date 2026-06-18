# Sourcetrail Plus

A modernized fork of [astallinger.sourcetrail](https://github.com/CoatiSoftware/vsce-sourcetrail)
designed for the 2026 community Sourcetrail fork
([OpenSourceSourcetrail/Sourcetrail](https://github.com/OpenSourceSourcetrail/Sourcetrail)).

## Why a fork

The original plugin has been unmaintained since Coati Software dissolved
in 2020. It silently fails in several scenarios that are increasingly
common on modern VSCode:

| Symptom | Cause | Fix |
|---|---|---|
| Send Location does nothing | Port 6666 squatted by Electron's Node-inspector worker (`--inspect-port=0`) | Default ports moved to **17666 / 17667** |
| `EADDRINUSE` on startup | Plugin race with utility workers | Exponential backoff retry up to 30 s |
| No feedback when Sourcetrail rejects a message | No logging | Dedicated **Sourcetrail** Output channel |
| Status bar lies about connectivity | No real state machine | 4 explicit states with click-to-log |
| Cannot reconnect without restart | No reconnect command | `Sourcetrail: Reconnect` command |

## Default ports

`pluginPort = 17666` and `sourcetrailPort = 17667`.

**Also change Sourcetrail's side** to match — Preferences → Plugin tab, or:

```xml
<!-- ~/sourcetrail/config/ApplicationSettings.xml -->
<network>
    <plugin_port>17666</plugin_port>
    <sourcetrail_port>17667</sourcetrail_port>
</network>
```

Restart Sourcetrail after editing the XML.

## Commands

| Command | What it does |
|---|---|
| `Sourcetrail: (Re)start Server` | Bind the local plugin port |
| `Sourcetrail: Stop Server` | Release the port |
| `Sourcetrail: Send Location` | `setActiveToken>>file>>line>>col<EOM>` (also in right-click menu) |
| `Sourcetrail: Send Ping` | `ping>>VS Code<EOM>` — connectivity smoke test |
| `Sourcetrail: Reconnect` | Re-bind after settings change |
| `Sourcetrail: Show Output` | Open the log channel |
| `Sourcetrail: Show Last Error` | Surface the most recent error |

## Settings

```jsonc
{
  "sourcetrail.ip": "127.0.0.1",
  "sourcetrail.pluginPort": 17666,
  "sourcetrail.sourcetrailPort": 17667,
  "sourcetrail.startServerAtStartup": true
}
```

## Build & install

```bash
npm install
npm run package
code --install-extension vscode-sourcetrail-plus-0.1.0.vsix
```

## Protocol

Identical to the original `astallinger` plugin (text over TCP, `<EOM>`
terminated). Sourcetrail 2026.4 still accepts these exact messages:

```
ping>>VS Code<EOM>
setActiveToken>>{abs_path}>>{line_1based}>>{col_1based}<EOM>
moveCursor>>{abs_path}>>{line_1based}>>{col_1based}<EOM>     # incoming
```

## Credits

- Original: Andreas Stallinger / Coati Software (`astallinger.sourcetrail` v0.0.2)
- Modernization: this fork

## License

MIT — see [LICENSE](LICENSE).
