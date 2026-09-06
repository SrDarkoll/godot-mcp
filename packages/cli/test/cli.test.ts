import {expect,it} from 'vitest';
import {parseCliArgs} from '../src/index.js';
it('parses help, foreground start and scoped session inspection',()=>{
 expect(parseCliArgs(['--help']).command).toBe('help');
 expect(parseCliArgs(['start','C:/Game With Spaces','--bridge-port','0','--tool-profile','runtime'])).toMatchObject({command:'start',projectRoot:'C:/Game With Spaces',bridgePort:0,toolProfile:'runtime'});
 expect(parseCliArgs(['config','C:/Game','--tool-profile','navigation'])).toMatchObject({command:'config',toolProfile:'navigation'});
 expect(parseCliArgs(['sessions','inspect','2026-09-05T12-00-00-000Z_1234abcd','C:/Game','--json'])).toMatchObject({command:'sessions.inspect',json:true,sessionId:'2026-09-05T12-00-00-000Z_1234abcd'});
 expect(parseCliArgs(['setup','codex','C:/Game']).command).toBe('setup.codex');
});
it('rejects missing, duplicate, ambiguous and command-inapplicable options',()=>{
 for(const args of [['init','--godot','--json'],['init','--godot','a','--godot','b'],['start','--json'],['status','--godot','x'],['sessions','inspect','../../x'],['sessions','list','--limit','201'],['doctor','--unknown'],['status','--tool-profile','3d'],['start','--tool-profile','physics'],['init','a','b']])expect(()=>parseCliArgs(args)).toThrow();
});
