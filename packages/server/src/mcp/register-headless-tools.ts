import {
  HeadlessGetOutputSchema,
  HeadlessImportSchema,
  HeadlessRunSceneSchema,
  HeadlessRunSchema,
  HeadlessRunTestsSchema,
  HeadlessStatusSchema,
  HeadlessStopSchema,
  HeadlessValidateProjectSchema
} from '@godot-mcp/protocol';
import type { HeadlessProcessManager } from '../headless/headless-process-manager.js';
import type { ToolRegistrar } from '../security/tool-registrar.js';
import {
  getHeadlessOutput,
  getHeadlessStatus,
  importHeadlessProject,
  runHeadlessProject,
  runHeadlessScene,
  runHeadlessTests,
  stopHeadlessProcess,
  validateHeadlessProject
} from '../tools/headless-tools.js';
import { bindCanonicalTool, defineCanonicalToolBinding } from '../tooling/canonical-tool-binding.js';

const headlessValidateProjectTool = defineCanonicalToolBinding('headless.validate_project', {
  inputSchema: HeadlessValidateProjectSchema,
  handler: validateHeadlessProject
});
const headlessImportTool = defineCanonicalToolBinding('headless.import', {
  inputSchema: HeadlessImportSchema,
  handler: importHeadlessProject
});
const headlessRunTool = defineCanonicalToolBinding('headless.run', {
  inputSchema: HeadlessRunSchema,
  handler: runHeadlessProject
});
const headlessRunSceneTool = defineCanonicalToolBinding('headless.run_scene', {
  inputSchema: HeadlessRunSceneSchema,
  handler: runHeadlessScene
});
const headlessRunTestsTool = defineCanonicalToolBinding('headless.run_tests', {
  inputSchema: HeadlessRunTestsSchema,
  handler: runHeadlessTests
});
const headlessStatusTool = defineCanonicalToolBinding('headless.status', {
  inputSchema: HeadlessStatusSchema,
  handler: getHeadlessStatus
});
const headlessStopTool = defineCanonicalToolBinding('headless.stop', {
  inputSchema: HeadlessStopSchema,
  handler: stopHeadlessProcess
});
const headlessGetOutputTool = defineCanonicalToolBinding('headless.get_output', {
  inputSchema: HeadlessGetOutputSchema,
  handler: getHeadlessOutput
});

export function registerHeadlessTools(registrar: ToolRegistrar, manager: HeadlessProcessManager): void {
  bindCanonicalTool(registrar, headlessValidateProjectTool, manager);
  bindCanonicalTool(registrar, headlessImportTool, manager);
  bindCanonicalTool(registrar, headlessRunTool, manager);
  bindCanonicalTool(registrar, headlessRunSceneTool, manager);
  bindCanonicalTool(registrar, headlessRunTestsTool, manager);
  bindCanonicalTool(registrar, headlessStatusTool, manager);
  bindCanonicalTool(registrar, headlessStopTool, manager);
  bindCanonicalTool(registrar, headlessGetOutputTool, manager);
}
