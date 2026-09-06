import { expect, it } from 'vitest';
import { ScreenshotRecordSchema, SessionManifestSchema } from '../src/session-artifacts.js';

const screenshot = {id:'123e4567-e89b-42d3-a456-426614174000', sequence:1, type:'editor_2d',
  path:'screenshots/editor/0001_capture.png', scene:null, reason:'manual_request', label:'capture',
  transaction:null, timestamp:'2026-09-05T00:00:00Z', width:1,height:1,byteLength:70,sha256:'a'.repeat(64),viewportIndex:null};
it('allows only generated screenshot paths', () => {
  expect(ScreenshotRecordSchema.safeParse(screenshot).success).toBe(true);
  for (const path of ['C:/x.png','../x.png','screenshots/editor/../x.png','screenshots\\editor\\x.png']) {
    expect(ScreenshotRecordSchema.safeParse({...screenshot,path}).success).toBe(false);
  }
});
it('requires checkpoint references to an existing screenshot', () => {
  const manifest = {manifestVersion:1,sessionId:'s',projectRoot:'C:/p',startedAt:screenshot.timestamp,endedAt:null,
    godotVersion:null,addonVersion:null,protocolVersion:1,nextScreenshotSequence:2,screenshots:[screenshot],
    checkpoints:[{id:screenshot.id,kind:'visual',screenshotId:screenshot.id,timestamp:screenshot.timestamp,label:'capture'}],
    transactions:[],errors:[],permissionChanges:[]};
  expect(SessionManifestSchema.safeParse(manifest).success).toBe(true);
  expect(SessionManifestSchema.parse(manifest).runtimeRuns).toEqual([]);
  expect(SessionManifestSchema.parse(manifest).headlessRuns).toEqual([]);
  expect(SessionManifestSchema.safeParse({...manifest,screenshots:[]}).success).toBe(false);
});
