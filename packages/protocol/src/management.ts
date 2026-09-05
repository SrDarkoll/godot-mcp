import * as z from 'zod/v4';
import {PermissionSchema} from './security.js';
export const BridgeDescriptorSchema=z.object({sessionId:z.string().min(1).max(256),host:z.literal('127.0.0.1'),port:z.number().int().min(1).max(65535),token:z.string().regex(/^[a-f0-9]{64}$/),pid:z.number().int().positive(),protocol:z.literal(1)});
export const ManagementRequestSchema=z.strictObject({type:z.literal('management'),protocol:z.literal(1),requestId:z.uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),projectRoot:z.string().min(1).max(4096),command:z.enum(['status','shutdown'])});
export const ManagementStatusSchema=z.strictObject({state:z.enum(['running','closing']),pid:z.number().int().positive(),sessionId:z.string(),projectRoot:z.string(),editorConnected:z.boolean(),runtimeConnected:z.boolean(),godotVersion:z.string().nullable(),addonVersion:z.string().nullable(),protocolVersion:z.literal(1),permissions:z.record(PermissionSchema,z.boolean()),activeTransactionId:z.uuid().nullable(),recoveryRequired:z.boolean()});
export const ManagementResponseSchema=z.discriminatedUnion('ok',[
 z.strictObject({type:z.literal('management_response'),protocol:z.literal(1),requestId:z.uuid(),sessionId:z.string(),ok:z.literal(true),data:z.record(z.string(),z.unknown())}),
 z.strictObject({type:z.literal('management_response'),protocol:z.literal(1),requestId:z.uuid(),sessionId:z.string(),ok:z.literal(false),error:z.strictObject({code:z.string(),message:z.string()})})
]);
export type ManagementStatus=z.infer<typeof ManagementStatusSchema>;
export type BridgeDescriptor=z.infer<typeof BridgeDescriptorSchema>;
