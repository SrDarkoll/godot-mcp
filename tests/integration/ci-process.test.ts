import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {expect,it} from 'vitest';
const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'";
function run(expression:string){
 return spawnSync('pwsh',['-NoProfile','-Command',`$ErrorActionPreference='Stop'; . ${quote(path.resolve('scripts/verified-godot-version.ps1'))}; ${expression}`],{encoding:'utf8',windowsHide:true,timeout:20000});
}
it('waits for the native process and rejects invalid versions and timeouts',()=>{
 const godot=process.env.GODOT_BIN;if(!godot)throw new Error('GODOT_BIN required');
 const valid=run(`Get-VerifiedGodotVersion -Executable ${quote(godot)} -ExpectedVersion '4.6.3'`);
 expect(valid.status,valid.stderr).toBe(0);expect(valid.stdout).toMatch(/4\.6\.3\./);
 const wrong=run(`Get-VerifiedGodotVersion -Executable ${quote(process.execPath)} -ExpectedVersion '4.6.3'`);
 expect(wrong.status).not.toBe(0);expect(wrong.stderr).toContain('Unexpected Godot executable version');
 const timed=run(`Get-VerifiedGodotVersion -Executable ${quote(process.execPath)} -Arguments ${quote('-e "setTimeout(()=>{},10000)"')} -TimeoutMs 200`);
 expect(timed.status).not.toBe(0);expect(timed.stderr).toContain('Godot version check timed out');
},30000);
