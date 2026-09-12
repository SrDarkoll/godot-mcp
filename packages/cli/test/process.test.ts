import {expect,it} from 'vitest';
import {runCommand} from '../src/process/run-command.js';
it('captures a command result and bounds hung/noisy processes',async()=>{
 const result=await runCommand(process.execPath,['-e','process.stdout.write("ok");process.stderr.write("warn")'],{timeoutMs:3000,maxOutputBytes:1024});
 expect(result).toEqual({code:0,stdout:'ok',stderr:'warn'});
 await expect(runCommand(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:100,maxOutputBytes:1024})).rejects.toMatchObject({code:'PROCESS_TIMEOUT'});
 await expect(runCommand(process.execPath,['-e','process.stdout.write("x".repeat(100000))'],{timeoutMs:3000,maxOutputBytes:1024})).rejects.toMatchObject({code:'PROCESS_OUTPUT_LIMIT'});
});
