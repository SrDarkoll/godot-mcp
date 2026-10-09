import type {DiagnosticEntry} from '@godot-mcp/protocol';

export function parseStartupLog(text:string,runId:string,sequenceOffset=0):{entries:DiagnosticEntry[];tail:string[];truncated:boolean}{
  const lines=text.split(/\r?\n/).filter(line=>line.trim().length>0);
  const entries:DiagnosticEntry[]=[];
  let previous:DiagnosticEntry|undefined;
  const timestamp=new Date().toISOString();
  for(const line of lines.slice(0,500)){
    const location=line.match(/^\s*at:\s*(.*?)\s*\((.+):(\d+)\)\s*$/);
    if(location&&previous&&previous.kind!=='output'){
      previous.file=location[2]!.slice(0,1024);previous.line=Number(location[3]);
      previous.frames=[{file:previous.file,line:previous.line,function:location[1]!.slice(0,256)}];
      continue;
    }
    const kind=/^\s*(?:SCRIPT ERROR|ERROR):/.test(line)?'error':/^\s*WARNING:/.test(line)?'warning':'output';
    previous={sequence:sequenceOffset+entries.length+1,runId,timestamp,kind,stream:null,
      message:line.slice(0,4096),file:null,line:null,frames:[],truncated:line.length>4096,source:'startup_log'};
    entries.push(previous);
  }
  return {entries,tail:lines.slice(-30).map(line=>line.slice(0,4096)),truncated:lines.length>500};
}
