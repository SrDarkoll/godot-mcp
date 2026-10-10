import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

// MINIDUMP_HEADER, MINIDUMP_EXCEPTION_STREAM and MINIDUMP_MODULE use
// the Windows SDK's fixed-width, four-byte-packed dump format.
function summarize(bytes) {
  if(bytes.length < 32 || bytes.toString('ascii',0,4)!=='MDMP')throw new Error('Invalid minidump header');
  const streams=new Map();
  const count=bytes.readUInt32LE(8), directory=bytes.readUInt32LE(12);
  if(directory+count*12>bytes.length)throw new Error('Truncated minidump directory');
  for(let i=0;i<count;i++){
    const entry=directory+i*12;
    const size=bytes.readUInt32LE(entry+4), rva=bytes.readUInt32LE(entry+8);
    if(rva+size>bytes.length)throw new Error('Truncated minidump stream');
    streams.set(bytes.readUInt32LE(entry),{size,rva});
  }
  const exception=streams.get(6), modules=streams.get(4);
  if(!exception || exception.size<32 || !modules || modules.size<4)throw new Error('Exception or module stream unavailable');
  const address=bytes.readBigUInt64LE(exception.rva+24);
  const result={threadId:bytes.readUInt32LE(exception.rva),exceptionCode:`0x${bytes.readUInt32LE(exception.rva+8).toString(16)}`,address:`0x${address.toString(16)}`,module:null};
  const moduleCount=bytes.readUInt32LE(modules.rva);
  if(4+moduleCount*108>modules.size)throw new Error('Truncated minidump module list');
  for(let i=0;i<moduleCount;i++){
    const entry=modules.rva+4+i*108;
    const base=bytes.readBigUInt64LE(entry), size=bytes.readUInt32LE(entry+8);
    if(address<base || address>=base+BigInt(size))continue;
    const nameRva=bytes.readUInt32LE(entry+20);
    if(nameRva+4>bytes.length)throw new Error('Truncated minidump module name');
    const nameSize=bytes.readUInt32LE(nameRva);
    if(nameRva+4+nameSize>bytes.length)throw new Error('Truncated minidump module name');
    result.module={name:bytes.toString('utf16le',nameRva+4,nameRva+4+nameSize),offset:`0x${(address-base).toString(16)}`};
    break;
  }
  return result;
}

const directory=process.argv[2];
if(!directory)throw new Error('A minidump directory is required');
const summaries=[];
for(const file of (await readdir(directory)).filter(file=>file.endsWith('.dmp'))){
  try{summaries.push({file,...summarize(await readFile(path.join(directory,file)))});}
  catch(error){summaries.push({file,diagnosticError:String(error)});}
}
await writeFile(path.join(directory,'minidump-summary.json'),JSON.stringify(summaries,null,2));
console.log(`Native crash summaries: ${JSON.stringify(summaries)}`);
