import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Capture2DParamsSchema,CapturePayloadSchema,GameCapturePayloadSchema,MAX_CAPTURE_BYTES,
  type CapturePayload,type Capture2DParams,type CaptureResult,type ScreenshotRecord} from '@godot-mcp/protocol';
import type {Session} from '../session/session.js';
import {SessionStore} from '../session/session-store.js';
import {BridgeRpcError} from '../bridge/rpc-router.js';

export interface SaveCaptureInput {
  type:'editor_2d'|'editor_3d'|'game'; payload:CapturePayload; metadata:Capture2DParams; runId?:string;
}

const crcTable = Uint32Array.from({length:256},(_,value) => {
  let crc=value;
  for(let bit=0;bit<8;bit++)crc=(crc&1) ? 0xedb88320^(crc>>>1) : crc>>>1;
  return crc>>>0;
});
function crc32(bytes:Buffer):number {
  let crc=0xffffffff;
  for(const byte of bytes)crc=crcTable[(crc^byte)&255]!^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}

function validatePng(payload:CapturePayload): Buffer {
  const bytes = Buffer.from(payload.png_base64,'base64');
  if (bytes.length > MAX_CAPTURE_BYTES) throw new BridgeRpcError('CAPTURE_TOO_LARGE','PNG exceeds 16 MiB');
  const invalid = () => { throw new BridgeRpcError('INVALID_CAPTURE_PAYLOAD','Invalid PNG capture'); };
  if (bytes.toString('base64') !== payload.png_base64 || bytes.length < 45 ||
      !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) invalid();
  let offset = 8; let data = false; let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii',offset+4,offset+8);
    if (length > bytes.length-offset-12) invalid();
    if(crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))invalid();
    if (offset === 8 && (type !== 'IHDR' || length !== 13 || bytes.readUInt32BE(16) !== payload.width || bytes.readUInt32BE(20) !== payload.height)) invalid();
    if (offset !== 8 && type === 'IHDR') invalid();
    if (type === 'IDAT') data = true;
    offset += length+12;
    if (type === 'IEND') { if (length !== 0) invalid(); ended = true; break; }
  }
  if (!data || !ended || offset !== bytes.length) invalid();
  return bytes;
}

export class ScreenshotStore {
  private queue:Promise<unknown> = Promise.resolve();
  constructor(private readonly session:Session,private readonly sessions:SessionStore) {}

  save(input:SaveCaptureInput):Promise<CaptureResult> {
    const result = this.queue.then(() => this.persist(input));
    this.queue = result.catch(() => {});
    return result;
  }

  private async persist(input:SaveCaptureInput):Promise<CaptureResult> {
    const parsed = CapturePayloadSchema.safeParse(input.payload);
    const metadata = Capture2DParamsSchema.safeParse(input.metadata);
    if (!parsed.success || !metadata.success ||
        (input.type !== 'editor_3d' ? parsed.data.viewport_index !== null : parsed.data.viewport_index === null) ||
        (input.type==='game'&&!GameCapturePayloadSchema.safeParse({...input.payload,run_id:input.runId}).success)) {
      throw new BridgeRpcError('INVALID_CAPTURE_PAYLOAD','Invalid capture metadata');
    }
    const payload = parsed.data;
    const bytes = validatePng(payload);
    if ((await this.sessions.read(this.session.id)).endedAt) throw new BridgeRpcError('SESSION_CLOSED','Session has ended');
    const slug = metadata.data.label.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9_-]/g,'_').replace(/_+/g,'_').slice(0,48) || 'capture';
    let sequence = 0;
    let relative = '';
    for (;;) {
      await this.sessions.update(this.session.id,m => {
        sequence = m.nextScreenshotSequence;
        return {...m,nextScreenshotSequence:sequence+1};
      });
      const folder=input.type==='game'?'game':'editor';
      relative = `screenshots/${folder}/${String(sequence).padStart(4,'0')}_${slug}.png`;
      try {
        const dir = await this.sessions.ensureDirectory(this.session.id,`screenshots/${folder}`);
        const handle = await fs.open(path.join(dir,path.basename(relative)),'wx');
        try { await handle.writeFile(bytes); await handle.sync(); }
        finally { await handle.close(); }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw new BridgeRpcError('ARTIFACT_WRITE_FAILED','Unable to persist PNG; any partial artifact is retained');
      }
    }
    const screenshot:ScreenshotRecord = {id:randomUUID(),sequence,type:input.type,path:relative,runId:input.type==='game'?input.runId!:null,
      scene:payload.scene,reason:metadata.data.reason,label:metadata.data.label,transaction:null,
      timestamp:payload.captured_at,width:payload.width,height:payload.height,byteLength:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),viewportIndex:payload.viewport_index};
    const checkpoint = metadata.data.checkpoint ? {id:randomUUID(),kind:'visual' as const,
      screenshotId:screenshot.id,timestamp:screenshot.timestamp,label:screenshot.label} : null;
    await this.sessions.update(this.session.id,m => ({...m,screenshots:[...m.screenshots,screenshot],
      checkpoints:checkpoint ? [...m.checkpoints,checkpoint] : m.checkpoints}));
    return {sessionId:this.session.id,screenshot,checkpoint};
  }
}
