export function errorMessage(caughtError: unknown): string {
  return String(caughtError instanceof Error ? caughtError.message : caughtError);
}
