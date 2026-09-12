# Transaction diff

`transaction.diff` reads verified before/after snapshot blobs. It does not publish staged content. Supply `transaction_id`; `session_id` can select retained history from the same project.

The response lists action, hashes, byte lengths and binary/text classification for every staged file. UTF-8 text receives a unified preview, with line-ending, final-newline and UTF-8 BOM metadata. Binary/invalid-UTF-8/NUL-containing data is summarized without dumping its bytes. Creation and deletion are explicit, including empty files.

Defaults: three context lines, 200 total rendered lines and 64 KiB of diff text across files. Limits can be raised to 2,000 lines / 256 KiB. More than 20,000 input lines per side omits that text diff with an explicit reason. The comparison algorithm bounds its matching matrix and falls back to replacement of the changed region for larger comparisons. `truncated` means the preview is incomplete; metadata/hashes remain available.

Redaction is enabled by default. It hides lines with common credential patterns, sensitive configuration filenames and private-key blocks. Snake_case names such as AWS_SECRET_ACCESS_KEY are covered. This is a heuristic, not guaranteed secret removal. File paths and content hashes remain visible. `redact: false` explicitly requests raw text within the same output limits.

Review before sharing. Redacted or truncated previews must not be applied as patches; newline/BOM-only changes may appear only in metadata. Use the actual staged transaction for publication, preserving its confirmation and conflict checks.
