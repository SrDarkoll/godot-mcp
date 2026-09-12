import * as z from 'zod/v4';
export const PermissionSchema=z.enum(['filesystem.project','filesystem.external','process.godot','process.shell','process.external','network.local','network.external','editor.modify','runtime.modify','editor.script_methods']);
export type Permission=z.infer<typeof PermissionSchema>;
export const DEFAULT_PERMISSIONS:Record<Permission,boolean>={'filesystem.project':true,'filesystem.external':false,'process.godot':true,'process.shell':false,'process.external':false,'network.local':true,'network.external':false,'editor.modify':true,'runtime.modify':true,'editor.script_methods':false};
export const PermissionChangeSchema=z.strictObject({permission:PermissionSchema,enabled:z.boolean()});
export const RiskSchema=z.enum(['normal','risky','blocked']);
export type Risk=z.infer<typeof RiskSchema>;
