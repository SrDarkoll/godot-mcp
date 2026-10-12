#!/usr/bin/env node
import {isMainModule} from '@godot-mcp/server/entry-point';
import {runCli} from "./cli-runner.js";
export {runCli} from "./cli-runner.js";
export {parseCliArgs} from "./cli-args.js";
if(isMainModule(import.meta.url)){
 void runCli().then(code=>{process.exitCode=code;}).catch(()=>{console.error("CLI failed");process.exitCode=1;});
}
