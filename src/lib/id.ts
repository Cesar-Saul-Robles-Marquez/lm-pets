export function makeId(prefix: string = "id"): string {
  // Good enough for local-only IDs.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
