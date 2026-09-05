# Godot MCP Editor Mutation Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Godot MCP from read-only inspection to reliable, undoable manipulation of a live Godot 4 editor project (generic object introspection, canonical Variant serialization, scene/node mutations, native Undo/Redo, resources, scripts with validation, signals, project settings, and editor controls).

**Architecture:** The Node server exposes high-level MCP tools and generic introspection primitives backed by Zod schemas in `@godot-mcp/protocol`. The Godot addon (`addons/godot_mcp`) executes structured RPC requests against Godot's `EditorInterface` and `EditorUndoRedoManager`, serializing Variants structurally without eval or arbitrary code execution strings. Safety policies restrict generic method calls, and node addressing is deterministic.

**Tech Stack:** Node.js 22+, npm workspaces, TypeScript (ESM), Vitest, Zod v4, Godot 4.x (GDScript EditorPlugin, `EditorUndoRedoManager`, `EditorInterface`).

**Spec:** `docs/superpowers/specs/2026-09-05-godot-mcp-design.md`

---

## File map locked by this plan

```text
packages/protocol/src/
  variant.ts                    Variant types, canonical schemas, encoders, and decoders
  tools.ts                      Extended MCP tool input/output contract definitions
  errors.ts                     Mutation and validation error codes
  index.ts                      Re-exports

packages/server/src/
  tools/
    object-tools.ts             Generic introspection & property/method dispatch
    scene-tools.ts              scene.create, scene.open, scene.save, scene.save_as, scene.reload, scene.instantiate, scene.get_root
    node-tools.ts               node.create, node.delete, node.duplicate, node.rename, node.reparent, node.move, node.inspect, node.list_children, node.get_property, node.set_property, node.get_properties
    resource-tools.ts           resource.load, resource.inspect, resource.create, resource.set_property, resource.save, resource.duplicate
    script-tools.ts             script.create, script.attach, script.detach, script.inspect, script.validate
    signal-tools.ts             signal.list, signal.connections, signal.connect, signal.disconnect
    project-settings-tools.ts   project.settings.get, project.settings.set, project.input.list, project.input.add_action, project.input.remove_action
    editor-tools.ts             editor.get_active_scene, editor.get_open_scenes, editor.get_selected_nodes, editor.select_node, editor.change_scene, editor.undo, editor.redo, editor.get_filesystem, editor.scan_filesystem
  mcp/
    create-server.ts            Registration of all Plan 2 tools

packages/godot-addon/addons/godot_mcp/
  serialization/
    variant_serializer.gd       Structural serializer & deserializer for all Godot Variants
  bridge/
    safety_policy.gd            Allow/deny list for callable methods on objects
    handlers/
      object_handlers.gd        object.* handlers
      scene_handlers.gd         scene.* handlers
      node_handlers.gd          node.* handlers (with EditorUndoRedoManager)
      resource_handlers.gd      resource.* handlers
      script_handlers.gd        script.* handlers and GDScript syntax validation
      signal_handlers.gd        signal.* handlers
      project_handlers.gd       project.settings.* and project.input.* handlers
      editor_handlers.gd        editor.* handlers
    rpc_dispatcher.gd           Routing to all handlers

tests/
  protocol/
    variant.test.ts             Round-trip tests for every Godot Variant type
  integration/
    editor-mutation.test.ts     Real Godot 4.x multi-step mutation, undo/redo, and error suite
```

---

### Task 1: Canonical Variant serialization and deserialization

**Files:**
- Create: `packages/protocol/src/variant.ts`
- Modify: `packages/protocol/src/index.ts`
- Create: `packages/godot-addon/addons/godot_mcp/serialization/variant_serializer.gd`
- Test: `packages/protocol/test/variant.test.ts`

- [ ] **Step 1: Write failing protocol tests for Variant serialization/deserialization**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement TypeScript Variant schemas and codecs in protocol**
- [ ] **Step 4: Implement GDScript VariantSerializer in addon**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 2: Generic Object introspection and safety policy

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/safety_policy.gd`
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/object_handlers.gd`
- Create: `packages/server/src/tools/object-tools.ts`
- Test: `packages/server/test/object-tools.test.ts`

- [ ] **Step 1: Write failing tests for object introspection and call safety**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement safety policy and GDScript object handlers**
- [ ] **Step 4: Implement server object tools and register in MCP**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 3: Scene operations (create, open, save, save_as, reload, instantiate)

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/scene_handlers.gd`
- Create: `packages/server/src/tools/scene-tools.ts`
- Test: `packages/server/test/scene-tools.test.ts`

- [ ] **Step 1: Write failing tests for scene tool schemas and handlers**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript scene handlers**
- [ ] **Step 4: Implement server scene tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 4: Node operations with native EditorUndoRedoManager integration

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/node_handlers.gd`
- Create: `packages/server/src/tools/node-tools.ts`
- Test: `packages/server/test/node-tools.test.ts`

- [ ] **Step 1: Write failing tests for node operations and undo/redo routing**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript node handlers with EditorUndoRedoManager**
- [ ] **Step 4: Implement server node tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 5: Generic Resource operations (load, inspect, create, set_property, save, duplicate)

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/resource_handlers.gd`
- Create: `packages/server/src/tools/resource-tools.ts`
- Test: `packages/server/test/resource-tools.test.ts`

- [ ] **Step 1: Write failing tests for resource tools**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript resource handlers**
- [ ] **Step 4: Implement server resource tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 6: Script operations with Godot-aware syntax validation and diagnostics

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/script_handlers.gd`
- Create: `packages/server/src/tools/script-tools.ts`
- Test: `packages/server/test/script-tools.test.ts`

- [ ] **Step 1: Write failing tests for script tools and diagnostic reporting**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript script handlers with syntax validation**
- [ ] **Step 4: Implement server script tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 7: Signal introspection and connections (with Undo/Redo)

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/signal_handlers.gd`
- Create: `packages/server/src/tools/signal-tools.ts`
- Test: `packages/server/test/signal-tools.test.ts`

- [ ] **Step 1: Write failing tests for signal tools**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript signal handlers**
- [ ] **Step 4: Implement server signal tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 8: Project settings and Input Map actions

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/project_handlers.gd`
- Create: `packages/server/src/tools/project-settings-tools.ts`
- Test: `packages/server/test/project-settings-tools.test.ts`

- [ ] **Step 1: Write failing tests for project settings and input actions**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript project settings handlers**
- [ ] **Step 4: Implement server project settings tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 9: Editor state and control operations

**Files:**
- Create: `packages/godot-addon/addons/godot_mcp/bridge/handlers/editor_handlers.gd`
- Create: `packages/server/src/tools/editor-tools.ts`
- Test: `packages/server/test/editor-tools.test.ts`

- [ ] **Step 1: Write failing tests for editor control tools**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GDScript editor handlers**
- [ ] **Step 4: Implement server editor tools**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Commit**

### Task 10: Full vertical slice integration tests with real Godot 4.x

**Files:**
- Create: `tests/integration/editor-mutation.test.ts`
- Modify: `scripts/run-integration.mjs`

- [ ] **Step 1: Write comprehensive integration test covering complete 12-step mutation lifecycle and error suite**
- [ ] **Step 2: Run integration test and verify all steps pass against real Godot 4.x engine**
- [ ] **Step 3: Commit**