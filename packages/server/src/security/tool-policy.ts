import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PERMISSIONS, PermissionSchema, type Permission, type Risk } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import type { RecoveryService } from '../recovery/recovery-service.js';
import type { SessionStore } from '../session/session-store.js';
import type { Session } from '../session/session.js';
import { OperationGate } from './operation-gate.js';
import { isBlockedReflectiveMethod } from './reflection-safety.js';
import { CONTROL_TOOL_NAMES, NORMAL_MUTATION_TOOL_NAMES, READ_TOOL_NAMES } from './tool-policy.generated.js';
const READS = new Set(READ_TOOL_NAMES);
const CONTROLS = new Set(CONTROL_TOOL_NAMES);
const NORMAL_MUTATIONS = new Set(NORMAL_MUTATION_TOOL_NAMES);
const LOCAL = (name: string): boolean => name === 'godot.tools' || /^(transaction|checkpoint|permissions|risk)\./.test(name) ||
    name.startsWith('session.') ||
    /^debug\.(output|errors|warnings)$/.test(name);
const NON_FILESYSTEM_PATH_TOOLS = new Set(['animation.add_track']);
const filesystemPathKeys = (name: string): string[] => {
    const keys = NON_FILESYSTEM_PATH_TOOLS.has(name)
        ? ['resource_path', 'script_path', 'source_path', 'target_path']
        : ['path', 'resource_path', 'script_path', 'source_path', 'target_path'];
    if (['tileset.add_atlas_source','sprite2d.set_texture'].includes(name)) return [...keys, 'texture_path'];
    if (['material3d.set_standard','material3d.configure_standard'].includes(name)) return [...keys, 'albedo_texture_path', 'normal_texture_path'];
    return keys;
};
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
export interface ToolAssessment {
    risk: Risk;
    targets: string[];
    fingerprint: string;
    permissions: Permission[];
}
export interface ToolAuthorization {
    approvedFingerprint?: string;
}
export type ApprovalAuditOutcome = 'approval_required' | 'approval_approved' | 'approval_declined' | 'approval_stale' | 'approval_replayed';
export class ToolPolicy {
    private closing = false;
    private readonly flags = { ...DEFAULT_PERMISSIONS };
    private readonly gate = new OperationGate();
    private auditQueue: Promise<void> = Promise.resolve();
    constructor(private readonly session: Session, private readonly sessions: SessionStore, private readonly recovery: RecoveryService) { }
    permissions(): Record<Permission, boolean> {
        return { ...this.flags };
    }
    private required(name: string, args: Record<string, unknown>): Permission[] {
        const permissions: Permission[] = [];
        if (!LOCAL(name) && !CONTROLS.has(name))
            permissions.push('network.local', 'filesystem.project');
        if (name === 'transaction.preview')
            permissions.push('filesystem.project');
        if (this.recovery.editorConnected &&
            ['transaction.begin', 'transaction.commit', 'transaction.recover', 'checkpoint.restore'].includes(name)) {
            permissions.push('network.local');
        }
        if (!READS.has(name) && !CONTROLS.has(name) && !name.startsWith('permissions.')) {
            if (name === 'workflow.run_check')
                permissions.push('runtime.modify', 'process.godot', 'filesystem.project');
            else if (name === 'workflow.snapshot' || LOCAL(name) || name.startsWith('visual.'))
                permissions.push('filesystem.project');
            else if (name.startsWith('runtime.') || name === 'project.run' || name === 'project.run_scene') {
                permissions.push('runtime.modify', 'process.godot', 'filesystem.project');
            }
            else
                permissions.push('editor.modify', 'filesystem.project');
        }
        if (filesystemPathKeys(name).some(key => typeof args[key] === 'string') ||
            Array.isArray(args.paths)) {
            permissions.push('filesystem.project');
        }
        return [...new Set(permissions)];
    }
    async setPermission(value: Permission, enabled: boolean): Promise<object> {
        const permission = PermissionSchema.parse(value);
        const old = this.flags[permission];
        await this.sessions.update(this.session.id, manifest => ({
            ...manifest,
            permissionChanges: [
                ...manifest.permissionChanges,
                { timestamp: new Date().toISOString(), permission, oldValue: old, newValue: enabled }
            ]
        }));
        this.flags[permission] = enabled;
        return { permission, enabled, scope: 'session' };
    }
    private async audit(tool: string, args: Record<string, unknown>, risk: Risk, outcome: string, targets: string[]): Promise<void> {
        const entry = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            tool,
            risk,
            outcome,
            targets,
            transactionId: this.recovery.activeId,
            argumentsHash: createHash('sha256').update(canonical(args)).digest('hex')
        };
        const task = this.auditQueue.then(async () => {
            const dir = await this.sessions.ensureDirectory(this.session.id, 'logs');
            const file = path.join(dir, 'audit.jsonl');
            try {
                if ((await fs.lstat(file)).isSymbolicLink())
                    throw new Error('Linked audit');
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw error;
            }
            const handle = await fs.open(file, 'a');
            try {
                await handle.writeFile(`${JSON.stringify(entry)}\n`);
                await handle.sync();
            }
            finally {
                await handle.close();
            }
        });
        this.auditQueue = task.catch(() => { });
        try {
            await task;
        }
        catch {
            throw new BridgeRpcError('AUDIT_WRITE_FAILED', 'Unable to persist audit record');
        }
    }
    async recordApproval(name: string, args: Record<string, unknown>, assessment: ToolAssessment, outcome: ApprovalAuditOutcome): Promise<void> {
        await this.audit(name, args, 'risky', outcome, assessment.targets);
    }
    async assess(name: string, args: Record<string, unknown>): Promise<ToolAssessment> {
        const permissions = this.required(name, args);
        if (permissions.some(permission => !this.flags[permission])) {
            return {
                risk: 'blocked',
                targets: [],
                permissions,
                fingerprint: createHash('sha256').update(canonical({ name, args, blocked: true })).digest('hex')
            };
        }
        const targets: string[] = [];
        const fingerprints: Record<string, string | null> = {};
        for (const key of filesystemPathKeys(name)) {
            if (typeof args[key] === 'string' && args[key])
                targets.push(args[key] as string);
        }
        if (Array.isArray(args.paths))
            targets.push(...(args.paths as string[]));
        if (['project.settings.set', 'project.input.add_action', 'project.input.remove_action'].includes(name)) {
            targets.push('res://project.godot');
        }
        let extra: unknown = null;
        if (['editor.close_scene', 'scene.reload', 'scene.save'].includes(name)) {
            const state = await this.recovery.editorState();
            extra = state;
            if (typeof state.path === 'string' && state.path)
                targets.push(state.path);
        }
        if (name === 'transaction.commit' || name === 'transaction.preview') {
            const record = await this.recovery.status(String(args.transaction_id));
            if ('id' in record) {
                targets.push(...record.before.map(entry => entry.path));
                extra = { revision: record.revision, after: record.after };
            }
        }
        if (name === 'transaction.recover') {
            const record = await this.recovery.status(String(args.transaction_id), String(args.session_id));
            if ('id' in record) {
                targets.push(...record.before.map(entry => entry.path));
                extra = { revision: record.revision, before: record.before };
            }
        }
        if (name === 'checkpoint.restore') {
            const record = await this.recovery.inspectCheckpoint(String(args.checkpoint_id), args.session_id as string | undefined);
            targets.push(...record.before.map(entry => entry.path));
            extra = record.before;
        }
        for (const target of new Set(targets)) {
            if (READS.has(name))
                await this.recovery.files.resolve(target);
            else
                fingerprints[target] = await this.recovery.files.fingerprint(target);
        }
        let risk: Risk = READS.has(name) || NORMAL_MUTATIONS.has(name) || CONTROLS.has(name) ? 'normal' : 'risky';
        if (['object.call', 'scene.reload', 'editor.close_scene', 'editor.undo', 'editor.redo', 'project.settings.set',
            'transaction.commit', 'transaction.recover', 'checkpoint.restore'].includes(name)) {
            risk = 'risky';
        }
        if (['script.create', 'resource.create', 'resource.save', 'scene.create', 'scene.save_as'].includes(name) &&
            Object.values(fingerprints).some(value => value !== null)) {
            risk = 'risky';
        }
        if (name === 'resource.duplicate' && fingerprints[String(args.target_path)] !== null)
            risk = 'risky';
        if (name === 'scene.save' && args.path && extra && typeof extra === 'object' && 'path' in extra &&
            extra.path !== args.path && fingerprints[String(args.path)] !== null) {
            risk = 'risky';
        }
        if (name.startsWith('permissions.') &&
            (args.enabled === true || name === 'permissions.enable') &&
            DEFAULT_PERMISSIONS[args.permission as Permission] === false) {
            risk = 'risky';
        }
        if (name === 'object.call' && isBlockedReflectiveMethod(args))
            risk = 'blocked';
        const displayTargets = [...new Set(targets)];
        for (const key of ['node_path', 'parent_path', 'source_node_path', 'target_node_path', 'new_parent_path', 'source_root_path']) {
            if (typeof args[key] === 'string')
                displayTargets.push(`${key}:${args[key]}`);
        }
        if (name === 'object.call' && typeof args.method === 'string')
            displayTargets.push(`method:${args.method}`);
        if (name.startsWith('permissions.') && typeof args.permission === 'string')
            displayTargets.push(`permission:${args.permission}`);
        if (name === 'project.settings.set' && typeof args.setting === 'string')
            displayTargets.push(`setting:${args.setting}`);
        if (name === 'animation.add_track' && typeof args.path === 'string')
            displayTargets.push(`track_path:${args.path}`);
        if ((name.startsWith('transaction.') && typeof args.transaction_id === 'string'))
            displayTargets.push(`transaction:${args.transaction_id}`);
        if (name === 'checkpoint.restore' && typeof args.checkpoint_id === 'string')
            displayTargets.push(`checkpoint:${args.checkpoint_id}`);
        if (!displayTargets.length && /^(node|object|scene|editor)\./.test(name))
            displayTargets.push('editor:active_scene');
        return {
            risk,
            targets: [...new Set(displayTargets)],
            permissions: [...new Set(permissions)],
            fingerprint: createHash('sha256')
                .update(canonical({ session: this.session.id, name, args, fingerprints, extra }))
                .digest('hex')
        };
    }
    async execute<T>(name: string, args: Record<string, unknown>, operation: (cleanArgs: Record<string, unknown>) => T | Promise<T>, authorization: ToolAuthorization = {}): Promise<T> {
        const execute = async (): Promise<T> => {
            if (this.closing && !CONTROLS.has(name)) {
                throw new BridgeRpcError('SESSION_CLOSED', 'Session is closing');
            }
            const required = this.required(name, args);
            if (required.some(permission => !this.flags[permission])) {
                await this.audit(name, args, 'blocked', 'denied', []);
                throw new BridgeRpcError('PERMISSION_DENIED', 'Required session permission is disabled', { permissions: required });
            }
            if (name === 'object.call' && isBlockedReflectiveMethod(args)) {
                await this.audit(name, args, 'blocked', 'denied', []);
                throw new BridgeRpcError('SAFETY_VIOLATION', 'This reflective method is blocked');
            }
            const exempt = LOCAL(name) || CONTROLS.has(name) || name === 'editor.close_scene';
            if (!exempt)
                await this.recovery.requireNoBarrier();
            if (this.recovery.activeId && !READS.has(name) && !exempt && !name.startsWith('visual.')) {
                throw new BridgeRpcError('TRANSACTION_ACTIVE', 'Only transaction staging or status is allowed while a file transaction is open');
            }
            const assessment = await this.assess(name, args);
            if (assessment.risk === 'blocked') {
                await this.audit(name, args, 'blocked', 'denied', assessment.targets);
                throw new BridgeRpcError('PERMISSION_DENIED', 'Required session permission is disabled', {
                    permissions: assessment.permissions
                });
            }
            if (assessment.risk === 'risky' && authorization.approvedFingerprint !== assessment.fingerprint) {
                await this.audit(name, args, 'risky', 'approval_required', assessment.targets);
                throw new BridgeRpcError('APPROVAL_REQUIRED', 'This operation requires explicit host/user approval', {
                    tool: name,
                    targets: assessment.targets,
                    risk: 'risky'
                });
            }
            const audited = !READS.has(name);
            if (audited)
                await this.audit(name, args, assessment.risk, 'started', assessment.targets);
            try {
                const result = await operation(args);
                if (audited) {
                    await this.audit(name, args, assessment.risk, result && typeof result === 'object' && 'isError' in result && result.isError ? 'failed' : 'succeeded', assessment.targets);
                }
                return result;
            }
            catch (error) {
                if (audited)
                    await this.audit(name, args, assessment.risk, 'failed', assessment.targets);
                throw error;
            }
        };
        return CONTROLS.has(name) ? execute() : this.gate.run(!READS.has(name), execute);
    }
    async flush(): Promise<void> {
        await this.auditQueue;
    }
    async close(): Promise<void> {
        this.closing = true;
        await this.gate.idle();
        await this.flush();
    }
}
