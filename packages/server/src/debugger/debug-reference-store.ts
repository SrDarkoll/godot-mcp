import {randomBytes} from 'node:crypto';
import {BridgeRpcError} from '../bridge/rpc-router.js';

type RefKind='frame'|'variable';

interface DecodedReference {
  runtimeGeneration:number;
  breakGeneration:number;
}

export class DebugReferenceStore {
  private runtimeGeneration=0;
  private breakGeneration=0;
  private breakId:string|null=null;
  private readonly frames=new Map<string,number>();
  private readonly variables=new Map<string,number>();

  resetRuntime():void{
    this.runtimeGeneration=this.nextGeneration(this.runtimeGeneration);
    this.breakGeneration=0;
    this.breakId=null;
    this.frames.clear();
    this.variables.clear();
  }

  beginBreak():string{
    this.breakGeneration=this.nextGeneration(this.breakGeneration);
    this.frames.clear();
    this.variables.clear();
    this.breakId=this.createUuid();
    return this.breakId;
  }

  invalidateBreak():void{
    this.breakGeneration=this.nextGeneration(this.breakGeneration);
    this.breakId=null;
    this.frames.clear();
    this.variables.clear();
  }

  currentBreakId():string|null{return this.breakId;}
  currentRuntimeGeneration():number{return this.runtimeGeneration;}
  currentBreakGeneration():number{return this.breakGeneration;}

  createFrameRef(dapFrameId:number):string{return this.createRef('frame',dapFrameId);}
  createVariableRef(dapVariablesReference:number):string{return this.createRef('variable',dapVariablesReference);}
  resolveFrameRef(frameRef:string):number{return this.resolveRef('frame',frameRef);}
  resolveVariableRef(variableRef:string):number{return this.resolveRef('variable',variableRef);}

  private createRef(kind:RefKind,backendId:number):string{
    if(!Number.isInteger(backendId)||backendId<0)throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR',`Invalid debugger ${kind} backend id`);
    const ref=this.createUuid();
    (kind==='frame'?this.frames:this.variables).set(ref,backendId);
    return ref;
  }

  private resolveRef(kind:RefKind,ref:string):number{
    const decoded=this.decodeUuid(ref);
    const notFound=kind==='frame'?'DEBUG_FRAME_NOT_FOUND':'DEBUG_VARIABLE_NOT_FOUND';
    if(!decoded)throw new BridgeRpcError(notFound,`Unknown debugger ${kind} reference`);
    if(decoded.runtimeGeneration!==this.runtimeGeneration||decoded.breakGeneration!==this.breakGeneration){
      throw new BridgeRpcError('STALE_DEBUG_REFERENCE','Debugger reference belongs to an invalidated execution context');
    }
    const value=(kind==='frame'?this.frames:this.variables).get(ref);
    if(value===undefined)throw new BridgeRpcError(notFound,`Unknown debugger ${kind} reference`);
    return value;
  }

  private createUuid():string{
    const bytes=randomBytes(16);
    bytes.writeUInt32BE(this.runtimeGeneration>>>0,0);
    bytes.writeUInt32BE(this.breakGeneration>>>0,12);
    bytes[6]=((bytes[6]??0)&0x0f)|0x40;
    bytes[8]=((bytes[8]??0)&0x3f)|0x80;
    const hex=bytes.toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  private decodeUuid(value:string):DecodedReference|null{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return null;
    const bytes=Buffer.from(value.replaceAll('-',''),'hex');
    if(bytes.length!==16)return null;
    return {runtimeGeneration:bytes.readUInt32BE(0),breakGeneration:bytes.readUInt32BE(12)};
  }

  private nextGeneration(current:number):number{
    if(current>=0xffff_ffff)throw new BridgeRpcError('DEBUG_PROTOCOL_ERROR','Debugger generation counter exhausted');
    return current+1;
  }
}
