export const MIN_REFRESH_SPIN_MS = 450;

/**
 * Runs an async refresh task while ensuring the circular refresh indicator
 * remains spinning long enough (~450ms) to be clearly visible to the user
 * even when responses complete quickly.
 */
export async function withMinSpin<T>(
  task: () => Promise<T>,
  minMs: number = MIN_REFRESH_SPIN_MS,
): Promise<T> {
  const [result] = await Promise.all([
    task(),
    new Promise<void>((resolve) => setTimeout(resolve, minMs)),
  ]);
  return result;
}
