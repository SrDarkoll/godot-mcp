# Installation and update

## Checkout

Install Node 22 and Godot 4.6.3 on Windows. In the repository run `npm ci` then `npm run build`. Keep the executable path explicit; no system-wide engine replacement is required.

```powershell
node packages/cli/dist/index.js init C:\Games\Example --godot C:\Tools\Godot_v4.6.3-stable_win64.exe
node packages/cli/dist/index.js doctor C:\Games\Example --json
```

Init installs the addon, local configuration, runtime autoload and compatible generated diagnostic adapter. It preserves unrelated addon files and records changed managed files in retained backups. It does not silently edit the user's MCP-client profile.

Open the project in Godot and configure the MCP client to execute `node C:\path\to\godot-mcp\packages\cli\dist\index.js start C:\Games\Example`. Keep stdout exclusively for MCP. Use `setup codex` to print a client configuration recipe. The addon discovers an authenticated per-session localhost descriptor.

## Tarballs

The npm packages are currently private workspaces rather than published registry packages. Run `npm run release:pack` to create the four `.tgz` files and their hash manifest under `.godot-mcp/distribution/`. In a separate directory, install all four exact files together:

```powershell
npm init -y
npm install --ignore-scripts C:\release\protocol.tgz C:\release\server.tgz C:\release\cli.tgz C:\release\godot-addon.tgz
npm exec -- godot-mcp --help
```

Replace the illustrative filenames with the actual files listed by the pack manifest. The automated `npm run test:distribution` exercises this outside-checkout installation and authenticated CLI/MCP lifecycle. Installation from a clean consumer must not resolve workspace source files.

## Maintenance and recovery

Stop the MCP server with `godot-mcp stop <project> --json`, then run `godot-mcp addon update <project> --godot <executable>`. A live project owner blocks maintenance. An interrupted addon update is compensated from its retained journal before retrying installation; conflicting external edits require inspection and are not overwritten automatically.

Resolve project transaction journals through MCP before addon maintenance. Do not delete snapshots or journals to bypass a recovery error. For local configuration damage use `godot-mcp config <project> --repair --json`; original bytes are retained. See [project maintenance](tools/project-maintenance.md), [config repair](tools/cli-config-repair.md) and [compatibility](compatibility.md).
