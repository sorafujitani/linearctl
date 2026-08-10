export function unreachable(value: never): never {
  throw new Error(`Unexpected variant: ${String(value)}`);
}
