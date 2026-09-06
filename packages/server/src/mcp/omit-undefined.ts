type OptionalKeys<T extends Record<string, unknown>> = {
  [K in keyof T]-?: {} extends Pick<T,K> ? K : never
}[keyof T];

type RequiredKeys<T extends Record<string, unknown>> = Exclude<keyof T,OptionalKeys<T>>;

export type OmitUndefinedValues<T extends Record<string, unknown>> =
  { [K in RequiredKeys<T>]: T[K] } &
  { [K in OptionalKeys<T>]?: Exclude<T[K],undefined> };

/**
 * Normalize parsed MCP arguments for exactOptionalPropertyTypes.
 * Optional schema fields may be represented by TypeScript as `key?: T | undefined`.
 * Downstream tool contracts use `key?: T`, so remove present-but-undefined entries at
 * the MCP boundary instead of weakening those contracts.
 *
 * Required keys stay required even when their value type is `unknown`; MCP JSON cannot
 * carry JavaScript `undefined`, so filtering it is only relevant to optional parser fields.
 */
export function omitUndefinedValues<T extends Record<string, unknown>>(value:T):OmitUndefinedValues<T>{
  return Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined)) as OmitUndefinedValues<T>;
}
