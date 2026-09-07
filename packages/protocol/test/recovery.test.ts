import {expect,it} from 'vitest';
import {RecoveryPathSchema,TransactionBeginSchema} from '../src/recovery.js';
it('rejects unsafe recovery paths and duplicate Windows identities',()=>{
 for(const value of ['res://../x','res://.git/config','res://x:stream','res://CON.txt','res://a/../b','res://a\\b','res://addons/godot_mcp/plugin.gd','res://x.'])expect(RecoveryPathSchema.safeParse(value).success).toBe(false);
 expect(RecoveryPathSchema.safeParse('project.godot').success).toBe(false);
 expect(RecoveryPathSchema.parse('res://project.godot')).toBe('res://project.godot');
 expect(RecoveryPathSchema.parse('res://scenes/main.tscn')).toBe('res://scenes/main.tscn');
 expect(TransactionBeginSchema.safeParse({label:'edit',paths:['res://A.gd','res://a.gd']}).success).toBe(false);
});
