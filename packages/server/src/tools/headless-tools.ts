import {
  HeadlessGetOutputSchema,
  HeadlessImportSchema,
  HeadlessRunSceneSchema,
  HeadlessRunSchema,
  HeadlessRunTestsSchema,
  HeadlessStatusSchema,
  HeadlessStopSchema,
  HeadlessValidateProjectSchema,
  type HeadlessGetOutputParams,
  type HeadlessImportParams,
  type HeadlessRunParams,
  type HeadlessRunSceneParams,
  type HeadlessRunTestsParams,
  type HeadlessStatusParams,
  type HeadlessStopParams,
  type HeadlessValidateProjectParams
} from '@godot-mcp/protocol';
import type { HeadlessProcessManager } from '../headless/headless-process-manager.js';

export function validateHeadlessProject(manager: HeadlessProcessManager, args: HeadlessValidateProjectParams) {
  return manager.validateProject(HeadlessValidateProjectSchema.parse(args));
}

export function importHeadlessProject(manager: HeadlessProcessManager, args: HeadlessImportParams) {
  return manager.importProject(HeadlessImportSchema.parse(args));
}

export function runHeadlessProject(manager: HeadlessProcessManager, args: HeadlessRunParams) {
  HeadlessRunSchema.parse(args);
  return manager.run();
}

export function runHeadlessScene(manager: HeadlessProcessManager, args: HeadlessRunSceneParams) {
  return manager.runScene(HeadlessRunSceneSchema.parse(args));
}

export function runHeadlessTests(manager: HeadlessProcessManager, args: HeadlessRunTestsParams) {
  return manager.runTests(HeadlessRunTestsSchema.parse(args));
}

export function getHeadlessStatus(manager: HeadlessProcessManager, args: HeadlessStatusParams) {
  HeadlessStatusSchema.parse(args);
  return manager.status();
}

export function stopHeadlessProcess(manager: HeadlessProcessManager, args: HeadlessStopParams) {
  HeadlessStopSchema.parse(args);
  return manager.stop();
}

export function getHeadlessOutput(manager: HeadlessProcessManager, args: HeadlessGetOutputParams) {
  return manager.getOutput(HeadlessGetOutputSchema.parse(args));
}
