import { createHash } from 'node:crypto';
import { AuditLog } from './audit-log.js';
import { ConfirmationStore } from './confirmation-store.js';
import { canonical } from './canonical.js';
import {validateArgumentBudget} from './argument-budget.js';
import { SessionTelemetry } from '../session/telemetry.js';
import { scanSessionStorage } from '../session/session-storage.js';
import {
  DEFAULT_PERMISSIONS,
  PermissionSchema,
  type Permission,
  type Risk,
} from '@godot-mcp/protocol';
import type { Session } from '../session/session.js';
import type { SessionStore } from '../session/session-store.js';
import type { RecoveryService } from '../recovery/recovery-service.js';
import { BridgeRpcError } from '../bridge/rpc-router.js';
import { OperationGate } from './operation-gate.js';
import { blockedReflection as blockedMethod } from './reflection-policy.js';
import { getToolDefinition, requiredToolPermissions } from '../tools/tool-catalog.js';
interface Assessment {
  risk: Risk;
  targets: string[];
  fingerprint: string;
  permissions: Permission[];
}
export class ToolPolicy {
  private readonly telemetry = new SessionTelemetry();
  connectionChanged(connected: boolean): void {
    this.telemetry.connectionChanged(connected);
  }
  async metrics(quotaBytes = 1024 ** 3) {
    const { files: _, ...storage } = await scanSessionStorage(
      this.sessions,
      this.session.id,
      quotaBytes,
    );
    const advisories = [
      ...(storage.quotaExceeded ? ['SESSION_STORAGE_QUOTA_EXCEEDED'] : []),
      ...(storage.truncated ? ['SESSION_STORAGE_SCAN_TRUNCATED'] : []),
      ...(storage.skippedLinks ? ['SESSION_STORAGE_LINKS_SKIPPED'] : []),
    ];
    return {
      sessionId: this.session.id,
      sampledAt: new Date().toISOString(),
      ...this.telemetry.snapshot(),
      queue: this.gate.snapshot(),
      storage,
      advisories,
    };
  }
  private closing = false;
  private readonly flags = { ...DEFAULT_PERMISSIONS };
  private readonly gate = new OperationGate();
  private readonly confirmations = new ConfirmationStore();
  private readonly auditLog: AuditLog;
  constructor(
    private readonly session: Session,
    private readonly sessions: SessionStore,
    private readonly recovery: RecoveryService,
  ) {
    this.auditLog = new AuditLog(sessions, session.id);
  }
  permissions(): Record<Permission, boolean> {
    return { ...this.flags };
  }
  private required(name: string, args: Record<string, unknown>): Permission[] {
    return requiredToolPermissions(name, args, this.recovery.editorConnected);
  }
  async setPermission(value: Permission, enabled: boolean): Promise<object> {
    const permission = PermissionSchema.parse(value);
    const old = this.flags[permission];
    await this.sessions.update(this.session.id, (m) => ({
      ...m,
      permissionChanges: [
        ...m.permissionChanges,
        { timestamp: new Date().toISOString(), permission, oldValue: old, newValue: enabled },
      ],
    }));
    this.flags[permission] = enabled;
    return { permission, enabled, scope: 'session' };
  }
  private async audit(
    tool: string,
    args: Record<string, unknown>,
    risk: Risk,
    outcome: string,
    targets: string[],
  ): Promise<void> {
    await this.auditLog.append({
      tool,
      risk,
      outcome,
      targets,
      transactionId: this.recovery.activeId,
      argumentsHash: createHash('sha256').update(canonical(args)).digest('hex'),
    });
  }
  async assess(name: string, args: Record<string, unknown>): Promise<Assessment> {
    validateArgumentBudget(args);
    const permissions = this.required(name, args);
    if (permissions.some((p) => !this.flags[p]))
      return {
        risk: 'blocked',
        targets: [],
        permissions,
        fingerprint: createHash('sha256')
          .update(canonical({ name, args, blocked: true }))
          .digest('hex'),
      };
    const targets: string[] = [];
    const fingerprints: Record<string, string | null> = {};
    for (const key of ['path', 'resource_path', 'script_path', 'source_path', 'target_path'])
      if (typeof args[key] === 'string' && args[key]) targets.push(args[key] as string);
    if (Array.isArray(args.paths)) targets.push(...(args.paths as string[]));
    if (
      ['project.settings.set', 'project.input.add_action', 'project.input.remove_action'].includes(
        name,
      )
    )
      targets.push('res://project.godot');
    let extra: unknown = null;
    if (['editor.close_scene', 'scene.reload', 'scene.save'].includes(name)) {
      const state = await this.recovery.editorState();
      extra = state;
      if (typeof state.path === 'string' && state.path) targets.push(state.path);
    }
    if (name === 'transaction.commit' || name === 'transaction.preview') {
      const record = await this.recovery.status(String(args.transaction_id));
      if ('id' in record) {
        targets.push(...record.before.map((e) => e.path));
        extra = { revision: record.revision, after: record.after };
      }
    }
    if (name === 'transaction.recover') {
      const record = await this.recovery.status(
        String(args.transaction_id),
        String(args.session_id),
      );
      if ('id' in record) {
        targets.push(...record.before.map((e) => e.path));
        extra = { revision: record.revision, before: record.before };
      }
    }
    if (name === 'checkpoint.restore') {
      const record = await this.recovery.inspectCheckpoint(
        String(args.checkpoint_id),
        args.session_id as string | undefined,
      );
      targets.push(...record.before.map((e) => e.path));
      extra = record.before;
    }
    for (const target of new Set(targets)) {
      if (getToolDefinition(name).readOnly || name === 'project.validate') await this.recovery.files.resolve(target);
      else fingerprints[target] = await this.recovery.files.fingerprint(target);
    }
    let risk: Risk = getToolDefinition(name).risk;
    if (
      [
        'script.create',
        'resource.create',
        'resource.save',
        'scene.create',
        'scene.save_as',
      ].includes(name) &&
      Object.values(fingerprints).some((v) => v !== null)
    )
      risk = 'risky';
    if (name === 'resource.duplicate' && fingerprints[String(args.target_path)] !== null)
      risk = 'risky';
    if (
      name === 'scene.save' &&
      args.path &&
      extra &&
      typeof extra === 'object' &&
      'path' in extra &&
      extra.path !== args.path &&
      fingerprints[String(args.path)] !== null
    )
      risk = 'risky';
    if (
      name.startsWith('permissions.') &&
      (args.enabled === true || name === 'permissions.enable') &&
      DEFAULT_PERMISSIONS[args.permission as Permission] === false
    )
      risk = 'risky';
    if (name === 'object.call' && blockedMethod(args)) risk = 'blocked';
    const displayTargets = [...new Set(targets)];
    for (const key of [
      'node_path',
      'parent_path',
      'source_node_path',
      'target_node_path',
      'new_parent_path',
    ])
      if (typeof args[key] === 'string') displayTargets.push(`${key}:${args[key]}`);
    if (!displayTargets.length && /^(node|object|scene|editor)\./.test(name))
      displayTargets.push('editor:active_scene');
    return {
      risk,
      targets: displayTargets,
      permissions: [...new Set(permissions)],
      fingerprint: createHash('sha256')
        .update(canonical({ session: this.session.id, name, args, fingerprints, extra }))
        .digest('hex'),
    };
  }
  async execute<T>(
    name: string,
    input: Record<string, unknown>,
    operation: (args: Record<string, unknown>) => Promise<T>,
  ): Promise<T> {
    const { confirmation, ...args } = input;
    validateArgumentBudget(input);
    const started = performance.now();
    let queueMs = 0;
    const execute = async () => {
      queueMs = performance.now() - started;
      if (this.closing && !getToolDefinition(name).control)
        throw new BridgeRpcError('SESSION_CLOSED', 'Session is closing');
      const required = this.required(name, args);
      if (required.some((p) => !this.flags[p])) {
        await this.audit(name, args, 'blocked', 'denied', []);
        throw new BridgeRpcError('PERMISSION_DENIED', 'Required session permission is disabled', {
          permissions: required,
        });
      }
      if (name === 'object.call') {
        if (blockedMethod(args)) {
          await this.audit(name, args, 'blocked', 'denied', []);
          throw new BridgeRpcError('SAFETY_VIOLATION', 'This reflective method is blocked');
        }
      }
      const definition = getToolDefinition(name);
      const exempt = definition.barrierExempt;
      if (!exempt) await this.recovery.requireNoBarrier();
      if (this.recovery.activeId && !definition.allowedDuringTransaction)
        throw new BridgeRpcError(
          'TRANSACTION_ACTIVE',
          'Only transaction staging or status is allowed while a file transaction is open',
        );
      const assessment = await this.assess(name, args);
      if (assessment.risk === 'blocked') {
        await this.audit(name, args, 'blocked', 'denied', assessment.targets);
        throw new BridgeRpcError('PERMISSION_DENIED', 'Required session permission is disabled', {
          permissions: assessment.permissions,
        });
      }
      if (assessment.risk === 'risky') {
        if (!this.confirmations.consume(confirmation, assessment.fingerprint)) {
          const token = this.confirmations.issue(assessment.fingerprint);
          await this.audit(name, args, 'risky', 'confirmation_required', assessment.targets);
          throw new BridgeRpcError(
            'CONFIRMATION_REQUIRED',
            'Review the operation and resubmit with its confirmation token',
            { tool: name, targets: assessment.targets, risk: 'risky', confirmationToken: token },
          );
        }
      }
      const audited = !getToolDefinition(name).readOnly;
      if (audited) await this.audit(name, args, assessment.risk, 'started', assessment.targets);
      try {
        const result = await operation(args);
        if (audited)
          await this.audit(
            name,
            args,
            assessment.risk,
            result && typeof result === 'object' && 'isError' in result && result.isError
              ? 'failed'
              : 'succeeded',
            assessment.targets,
          );
        return result;
      } catch (error) {
        if (audited) await this.audit(name, args, assessment.risk, 'failed', assessment.targets);
        throw error;
      }
    };
    try {
      const result = await (getToolDefinition(name).control
        ? execute()
        : this.gate.run(!getToolDefinition(name).readOnly, execute));
      this.telemetry.record(
        name,
        performance.now() - started,
        queueMs,
        !(result && typeof result === 'object' && 'isError' in result && result.isError),
      );
      return result;
    } catch (error) {
      this.telemetry.record(name, performance.now() - started, queueMs, false);
      throw error;
    }
  }
  async flush(): Promise<void> {
    await this.auditLog.flush();
  }
  async close(): Promise<void> {
    this.closing = true;
    await this.gate.idle();
    await this.flush();
  }
}
