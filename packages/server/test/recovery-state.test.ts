import {expect,it} from 'vitest';
import type {RecoveryRecord} from '@godot-mcp/protocol';
import {setRecoveryState} from '../src/recovery/recovery-state.js';
it('rejects skipping publication while allowing recovery of durable intermediate states',()=>{
 const record={state:'open'} as RecoveryRecord;
 expect(()=>setRecoveryState(record,'committed')).toThrow();expect(record.state).toBe('open');
 setRecoveryState(record,'applying');setRecoveryState(record,'committed');
 setRecoveryState(record,'rolling_back');setRecoveryState(record,'rolled_back');
 expect(()=>setRecoveryState(record,'applying')).toThrow();
 // A crash after recording rollback, before clearing the journal, is recoverable.
 setRecoveryState(record,'rolling_back');setRecoveryState(record,'recovery_required');
 setRecoveryState(record,'rolling_back');setRecoveryState(record,'rolled_back');
 const checkpoint={state:'snapshot'} as RecoveryRecord;
 expect(()=>setRecoveryState(checkpoint,'applying')).toThrow();
});
