# Structured scene and resource batches

`scene.batch.preview` validates 1–64 structured operations against the active scene and returns an `expected` fingerprint. `scene.batch` accepts the same operations, label and fingerprint. It revalidates immediately before applying; changes to scene identity, Undo version, relevant nodes, hierarchy, names, indexes or property values return `BATCH_CONFLICT` and require a new preview.

Supported operations create native Node classes, set bounded native node/resource properties, rename, reparent, reorder and delete non-root scene nodes. `@id` references address nodes created earlier in the batch. Other paths resolve against the initial active scene through the shared scoped resolver. Parent traversal, foreign absolute paths, script resources/classes, script-defined properties and dedicated fields such as owner/script/name are rejected.

A successful batch is one Editor Undo action. It changes the editor's in-memory scene/resources and reports `saved: false`; call the appropriate structured save tool separately. Undo restores deleted subtrees, child order, owners, names, hierarchy and property values. Redo reapplies the batch. Resource property changes remain in Undo history and are not written until explicitly saved.

Before registering the action, the addon applies native operations and checks every postcondition. If a setter rejects a value or a target becomes invalid, inverse operations run immediately. The response reports whether rollback was verified. `BATCH_RECOVERY_REQUIRED` means the inverse state could not be proven; inspect the scene and use editor history or reopen without saving as appropriate. Unsaved editor state cannot be recovered from the file transaction journal.

Native property setters and project resources/scripts are trusted Godot code and may have effects outside Undo. The batch excludes custom script method calls and script properties. File writes, imports and project settings use their dedicated controls.
