/** User-facing text for a thrown value. Unknown throws stay generic. */
export function errorMessage(error: unknown, fallback = "An unexpected error occurred."): string {
  return error instanceof Error ? error.message : fallback;
}
