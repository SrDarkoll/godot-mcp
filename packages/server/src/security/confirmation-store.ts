import { randomUUID } from 'node:crypto';

/** Single-use, short-lived approvals bound to an exact fingerprint. */
export class ConfirmationStore {
  private readonly entries = new Map<string, { fingerprint: string; expires: number }>();
  consume(token: unknown, fingerprint: string): boolean {
    if (typeof token !== 'string') return false;
    const stored = this.entries.get(token);
    this.entries.delete(token);
    return !!stored && stored.expires >= Date.now() && stored.fingerprint === fingerprint;
  }
  issue(fingerprint: string): string {
    for (const [key, value] of this.entries)
      if (value.expires < Date.now()) this.entries.delete(key);
    if (this.entries.size >= 128) this.entries.delete(this.entries.keys().next().value!);
    const token = randomUUID();
    this.entries.set(token, { fingerprint, expires: Date.now() + 300000 });
    return token;
  }
}
