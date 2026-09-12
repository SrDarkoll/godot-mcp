# Diagnosing and repairing local configuration

`status` and `stop` authenticate through the live bridge descriptor independently of config.json. `doctor` reports malformed JSON or an invalid configuration schema alongside the remaining checks, instead of aborting before diagnosis.

For explicit repair:

```powershell
godot-mcp config C:\path\to\project --repair --bridge-port 61337 --json
```

Repair retains the original bytes in `.godot-mcp/config-backups/<uuid>.json`, preserves unknown keys when the input is a JSON object, and replaces invalid known fields with valid defaults or the supplied options. Malformed JSON is retained verbatim in the backup before a default configuration is written. The result reports `backupPath` and `restartRequired`; it never prints the original content. A failed backup prevents replacement. Linked files/directories are rejected. Backups are not automatically deleted.

Do not edit config.json concurrently with repair. Repair checks for changes before publication but does not provide operating-system isolation against non-cooperating writers.
