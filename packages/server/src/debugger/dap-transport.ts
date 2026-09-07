import net from 'node:net';

const MAX_DAP_HEADER_BYTES=8*1024;
const MAX_DAP_BODY_BYTES=8*1024*1024;

type DapObject=Record<string,unknown>;
export type DapEvent=DapObject&{type:'event';event:string};
export type DapEventListener=(event:DapEvent)=>void;
export type DapCloseListener=(error:Error)=>void;

export interface DapTransport {
  connect(host:string,port:number,timeoutMs:number):Promise<void>;
  request(command:string,args:DapObject,timeoutMs:number):Promise<DapObject>;
  onEvent(listener:DapEventListener):()=>void;
  onClose(listener:DapCloseListener):()=>void;
  close():void;
}

interface PendingDapRequest {
  command:string;
  resolve:(body:DapObject)=>void;
  reject:(error:Error)=>void;
  timer:ReturnType<typeof setTimeout>;
}

export class DapTransportError extends Error {
  constructor(message:string){super(message);this.name='DapTransportError';}
}
export class DapRequestError extends Error {
  readonly command:string;
  constructor(command:string,message:string){super(`DAP ${command} failed: ${message}`);this.name='DapRequestError';this.command=command;}
}

export class TcpDapTransport implements DapTransport {
  private socket:net.Socket|null=null;
  private buffer=Buffer.alloc(0);
  private bodyLength:number|null=null;
  private nextSeq=1;
  private connected=false;
  private closed=false;
  private closeNotified=false;
  private readonly pending=new Map<number,PendingDapRequest>();
  private readonly eventListeners=new Set<DapEventListener>();
  private readonly closeListeners=new Set<DapCloseListener>();

  async connect(host:string,port:number,timeoutMs:number):Promise<void>{
    if(host!=='127.0.0.1')throw new DapTransportError('DAP host must be 127.0.0.1');
    if(this.closed)throw new DapTransportError('DAP transport is closed');
    if(this.socket)throw new DapTransportError('DAP transport is already connected or connecting');
    if(!Number.isInteger(port)||port<1||port>65535)throw new DapTransportError('DAP port is invalid');
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new DapTransportError('DAP connect timeout is invalid');
    const socket=net.createConnection({host,port});
    this.socket=socket;
    socket.setNoDelay(true);
    socket.on('data',chunk=>this.acceptData(chunk));
    socket.on('error',error=>this.fail(error instanceof Error?error:new DapTransportError(String(error))));
    socket.on('close',()=>this.fail(new DapTransportError('DAP transport closed')));
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{
        if(settled)return;settled=true;
        const error=new DapTransportError(`DAP connect timed out after ${timeoutMs}ms`);
        reject(error);this.fail(error);socket.destroy();
      },timeoutMs);
      socket.once('connect',()=>{
        if(settled)return;settled=true;clearTimeout(timer);this.connected=true;resolve();
      });
      socket.once('error',error=>{
        if(settled)return;settled=true;clearTimeout(timer);reject(error);
      });
    });
  }

  request(command:string,args:DapObject,timeoutMs:number):Promise<DapObject>{
    if(!this.connected||!this.socket||this.closed)return Promise.reject(new DapTransportError('DAP transport is not connected'));
    if(!command)return Promise.reject(new DapTransportError('DAP command is required'));
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.reject(new DapTransportError('DAP request timeout is invalid'));
    const seq=this.nextSeq++;
    const packet={seq,type:'request',command,arguments:args};
    const bytes=this.frame(packet);
    return new Promise<DapObject>((resolve,reject)=>{
      const timer=setTimeout(()=>{
        const pending=this.pending.get(seq);
        if(!pending)return;
        this.pending.delete(seq);
        pending.reject(new DapRequestError(command,`timed out after ${timeoutMs}ms`));
      },timeoutMs);
      this.pending.set(seq,{command,resolve,reject,timer});
      try{this.socket!.write(bytes);}catch(error){
        clearTimeout(timer);this.pending.delete(seq);reject(error instanceof Error?error:new Error(String(error)));
      }
    });
  }

  onEvent(listener:DapEventListener):()=>void{this.eventListeners.add(listener);return()=>this.eventListeners.delete(listener);}
  onClose(listener:DapCloseListener):()=>void{this.closeListeners.add(listener);return()=>this.closeListeners.delete(listener);}

  close():void{
    if(this.closed)return;
    this.closed=true;this.connected=false;
    const error=new DapTransportError('DAP transport closed');
    this.rejectPending(error);
    const socket=this.socket;this.socket=null;
    if(socket&&!socket.destroyed)socket.destroy();
    this.notifyClose(error);
  }

  private frame(value:unknown):Buffer{
    const body=Buffer.from(JSON.stringify(value),'utf8');
    return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`,'ascii'),body]);
  }

  private acceptData(chunk:Buffer):void{
    if(this.closed)return;
    this.buffer=Buffer.concat([this.buffer,chunk]);
    try{
      while(true){
        if(this.bodyLength===null){
          const headerEnd=this.buffer.indexOf('\r\n\r\n');
          if(headerEnd<0){
            if(this.buffer.length>MAX_DAP_HEADER_BYTES)throw new DapTransportError('DAP header exceeds 8 KiB');
            return;
          }
          if(headerEnd>MAX_DAP_HEADER_BYTES)throw new DapTransportError('DAP header exceeds 8 KiB');
          const header=this.buffer.subarray(0,headerEnd).toString('ascii');
          const contentLengths=header.split('\r\n').map(line=>/^content-length\s*:\s*(.+)$/i.exec(line)).filter((match):match is RegExpExecArray=>match!==null);
          if(contentLengths.length!==1)throw new DapTransportError('DAP frame must contain exactly one Content-Length header');
          const raw=contentLengths[0]?.[1]?.trim()??'';
          if(!/^\d+$/.test(raw))throw new DapTransportError('DAP Content-Length is invalid');
          const length=Number(raw);
          if(!Number.isSafeInteger(length)||length<=0)throw new DapTransportError('DAP Content-Length must be positive');
          if(length>MAX_DAP_BODY_BYTES)throw new DapTransportError('DAP body exceeds 8 MiB');
          this.bodyLength=length;
          this.buffer=this.buffer.subarray(headerEnd+4);
        }
        const length=this.bodyLength;
        if(length===null||this.buffer.length<length)return;
        const body=this.buffer.subarray(0,length);
        this.buffer=this.buffer.subarray(length);
        this.bodyLength=null;
        const parsed:unknown=JSON.parse(body.toString('utf8'));
        if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new DapTransportError('DAP body must be a JSON object');
        this.acceptMessage(parsed as DapObject);
      }
    }catch(error){
      const normalized=error instanceof Error?error:new DapTransportError(String(error));
      this.fail(normalized);
      this.socket?.destroy();
    }
  }

  private acceptMessage(message:DapObject):void{
    if(message.type==='event'){
      if(typeof message.event!=='string')throw new DapTransportError('DAP event name is invalid');
      for(const listener of this.eventListeners)listener(message as DapEvent);
      return;
    }
    if(message.type!=='response')return;
    const requestSeq=message.request_seq;
    if(typeof requestSeq!=='number'||!Number.isInteger(requestSeq))throw new DapTransportError('DAP response request_seq is invalid');
    const pending=this.pending.get(requestSeq);
    if(!pending)return;
    this.pending.delete(requestSeq);clearTimeout(pending.timer);
    if(message.success!==true){
      pending.reject(new DapRequestError(pending.command,typeof message.message==='string'?message.message:'request rejected'));
      return;
    }
    const body=message.body;
    pending.resolve(body&&typeof body==='object'&&!Array.isArray(body)?body as DapObject:{});
  }

  private fail(error:Error):void{
    this.connected=false;
    this.rejectPending(error);
    this.notifyClose(error);
  }
  private rejectPending(error:Error):void{
    for(const [seq,pending] of this.pending){this.pending.delete(seq);clearTimeout(pending.timer);pending.reject(error);}
  }
  private notifyClose(error:Error):void{
    if(this.closeNotified)return;this.closeNotified=true;
    for(const listener of this.closeListeners)listener(error);
  }
}
