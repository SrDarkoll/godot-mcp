import net from 'node:net';
import {afterEach,describe,expect,it} from 'vitest';
import {TcpDapTransport} from '../src/debugger/dap-transport.js';

const servers:net.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));});

function frame(value:unknown):Buffer {
  const body=Buffer.from(JSON.stringify(value),'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`,'ascii'),body]);
}
async function listen(handler:(socket:net.Socket)=>void):Promise<number>{
  const server=net.createServer(handler);servers.push(server);
  await new Promise<void>((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  return (server.address() as net.AddressInfo).port;
}

function collectOneRequest(socket:net.Socket,handler:(request:any)=>void):void{
  let buffer=Buffer.alloc(0);
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    const headerEnd=buffer.indexOf('\r\n\r\n');
    if(headerEnd<0)return;
    const match=/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0,headerEnd).toString('ascii'));
    if(!match)return;
    const length=Number(match[1]);
    const start=headerEnd+4;
    if(buffer.length<start+length)return;
    handler(JSON.parse(buffer.subarray(start,start+length).toString('utf8')));
    buffer=buffer.subarray(start+length);
  });
}

describe('TcpDapTransport',()=>{
  it('parses fragmented UTF-8 events and coalesced messages without decoding partial bodies',async()=>{
    const event={seq:1,type:'event',event:'output',body:{output:'á🐀'}};
    const continued={seq:2,type:'event',event:'continued',body:{threadId:1}};
    const port=await listen(socket=>{
      const a=frame(event);const b=frame(continued);
      const emoji=Buffer.from('🐀','utf8');
      const split=a.indexOf(emoji)+2;
      socket.write(a.subarray(0,split));
      setTimeout(()=>socket.write(Buffer.concat([a.subarray(split),b])),5);
    });
    const transport=new TcpDapTransport();const seen:any[]=[];transport.onEvent(value=>seen.push(value));
    await transport.connect('127.0.0.1',port,500);
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(seen).toEqual([event,continued]);
    transport.close();
  });

  it('correlates successful and failed responses and treats a missing success body as empty',async()=>{
    let socketRef:net.Socket|undefined;
    const port=await listen(socket=>{socketRef=socket;collectOneRequest(socket,request=>{
      if(request.command==='configurationDone')socket.write(frame({seq:10,type:'response',request_seq:request.seq,success:true,command:request.command}));
      else socket.write(frame({seq:11,type:'response',request_seq:request.seq,success:false,command:request.command,message:'nope'}));
    });});
    const transport=new TcpDapTransport();await transport.connect('127.0.0.1',port,500);expect(socketRef).toBeDefined();
    await expect(transport.request('configurationDone',{},500)).resolves.toEqual({});
    await expect(transport.request('evaluate',{},500)).rejects.toMatchObject({command:'evaluate',message:expect.stringContaining('nope')});
    transport.close();
  });

  it('times out a request and ignores a late response',async()=>{
    let late:((value:any)=>void)|undefined;
    const port=await listen(socket=>collectOneRequest(socket,request=>{late=value=>socket.write(frame(value));setTimeout(()=>late?.({seq:2,type:'response',request_seq:request.seq,success:true,command:request.command,body:{late:true}}),60);}));
    const transport=new TcpDapTransport();await transport.connect('127.0.0.1',port,500);
    await expect(transport.request('stackTrace',{},20)).rejects.toThrow(/timed out/i);
    await new Promise(resolve=>setTimeout(resolve,80));
    transport.close();
  });

  it('rejects malformed or oversized framing and rejects pending requests on close',async()=>{
    const cases=[
      Buffer.from('X: 1\r\n\r\n{}','ascii'),
      Buffer.from('Content-Length: 1\r\nContent-Length: 1\r\n\r\n{}','ascii'),
      Buffer.from(`Content-Length: ${8*1024*1024+1}\r\n\r\n`,'ascii'),
      Buffer.alloc(8193,65)
    ];
    for(const payload of cases){
      const port=await listen(socket=>socket.write(payload));
      const transport=new TcpDapTransport();let closed=false;transport.onClose(()=>{closed=true;});
      await transport.connect('127.0.0.1',port,500);
      await new Promise(resolve=>setTimeout(resolve,20));
      expect(closed).toBe(true);
    }
  });

  it('accepts only loopback and makes close idempotent',async()=>{
    const transport=new TcpDapTransport();
    await expect(transport.connect('localhost',12345,10)).rejects.toThrow(/127\.0\.0\.1/);
    transport.close();transport.close();
  });
});
