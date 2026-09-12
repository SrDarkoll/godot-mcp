import {expect,it} from 'vitest';import {PermissionChangeSchema,DEFAULT_PERMISSIONS} from '../src/security.js';
it('defaults to project scope and rejects unknown permissions',()=>{
 expect(DEFAULT_PERMISSIONS['filesystem.external']).toBe(false);expect(DEFAULT_PERMISSIONS['editor.modify']).toBe(true);
 expect(PermissionChangeSchema.safeParse({permission:'root.all',enabled:true}).success).toBe(false);
});
