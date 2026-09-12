import type { RecoveryRecord } from '@godot-mcp/protocol';
import { BridgeRpcError } from '../bridge/rpc-router.js';
type State = RecoveryRecord['state'];

/** Includes replay after a crash between a durable record and journal cleanup. */
const transitions = {
  open: ['applying', 'rolled_back', 'rolling_back'],
  applying: ['committed', 'rolling_back', 'recovery_required'],
  committed: ['rolling_back', 'recovery_required'],
  rolling_back: ['rolling_back', 'rolled_back', 'recovery_required'],
  rolled_back: ['rolling_back'],
  recovery_required: ['rolling_back', 'recovery_required'],
  snapshot: [],
} satisfies Record<State, readonly State[]>;

export function setRecoveryState(record: RecoveryRecord, next: State): void {
  if (!(transitions[record.state] as readonly State[]).includes(next)) {
    throw new BridgeRpcError(
      'INVALID_RECOVERY_STATE',
      `Invalid recovery transition: ${record.state} -> ${next}`,
    );
  }
  record.state = next;
}
