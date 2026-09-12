# Serialization limits

VariantSerializer validates the complete value before its recursive serialize/deserialize/encode/decode conversion. Validation has a shared work budget, detects cycles by container identity, and accepts repeated acyclic references. Non-finite scalar floats are rejected. Limits are conservative: reaching a nominal element limit does not override byte or depth budgets.

| Scope | Bound |
|---|---|
| Individual editor Variant value | Depth 16; 4,096 visited items; 4,096 entries per container; 65,536 characters per string; conservative 256 KiB byte budget |
| Runtime property | Depth 8; 256 entries per container; 4,096 characters per string; shared item/byte checks |
| Combined runtime properties | Conservative 256 KiB budget before accumulating further values; final response size also checked |
| Incoming editor RPC params | Structural checks before dispatch; 8 MiB conservative budget and 1 MiB string cap for script templates/content |
| Incoming value/args/properties/binds | Individual Variant budget, checked before invoking mutating handlers |
| Editor scene tree | Maximum depth 32, 2,000 nodes and 1 MiB accumulated metadata |
| Editor filesystem traversal | Maximum depth 32, 4,096 entries and 1 MiB accumulated metadata |
| Ordinary outgoing editor RPC | Structural depth/item checks and conservative 4 MiB budget; envelope depth accounts for nested scene children |
| PNG capture payloads | Separate existing pixel, PNG-byte, checksum and transport bounds; excluded from ordinary Variant response budgeting |

Oversized arguments return ARGUMENT_TOO_LARGE before mutation. Oversized or cyclic values return RESULT_TOO_LARGE through the dispatcher rather than a successful response containing a nested serialization failure. Runtime has its own structured errors. The internal `__godot_mcp_serialization_error__` key is reserved for propagation of conversion failures.

Response errors do not imply rollback of a mutation that already ran. File transactions and structured undo guarantees are separate from serialization. Inspect state before retrying a mutating call after an output/transport failure.

Tests exercise native cyclic values, depth, width, oversized strings, shared references, normal typed round trips, pre-mutation rejection, runtime rejection, scene traversal and filesystem traversal. Filesystem budget tests use a directory-API fixture; ordinary editor integration still exercises the real API. Future pagination should expand usability for larger projects without removing these limits.
