#!/usr/bin/env node
import {pathToFileURL} from "node:url";
import {runCli} from "./cli-runner.js";
export {runCli} from "./cli-runner.js";
export {parseCliArgs} from "./cli-args.js";
const entry=process.argv[1];
if(entry&&import.meta.url===pathToFileURL(entry).href){
 void runCli().then(code=>{process.exitCode=code;}).catch(()=>{console.error("CLI failed");process.exitCode=1;});
}
