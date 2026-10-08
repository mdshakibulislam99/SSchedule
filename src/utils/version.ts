/**
 * SSchedule - App Version and Semver Utility
 */

export const CURRENT_APP_VERSION = '3.0.0';
export const CURRENT_BUILD_NUMBER = 9;

/**
 * Compare two semver strings (e.g., '1.0.0' vs '1.0.1')
 * Returns:
 *  -1 if v1 < v2 (v1 is older than v2)
 *   0 if v1 === v2
 *   1 if v1 > v2 (v1 is newer than v2)
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '').trim().replace(/^v/i, '');
  const clean2 = (v2 || '').trim().replace(/^v/i, '');

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const length = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < length; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }

  return 0;
}

/**
 * Check if the current app version meets or exceeds the required version.
 */
export function isVersionOlderThan(current: string, target: string): boolean {
  return compareSemver(current, target) < 0;
}

const SIMULATED_VERSION_KEY = 'chronopulse_simulated_version';

/**
 * Developer helper to simulate an older version for testing force-update flows
 */
export function getActiveAppVersion(): string {
  if (typeof window !== 'undefined') {
    const simulated = localStorage.getItem(SIMULATED_VERSION_KEY);
    if (simulated) return simulated;
  }
  return CURRENT_APP_VERSION;
}

export function setSimulatedAppVersion(version: string | null): void {
  if (typeof window === 'undefined') return;
  if (!version) {
    localStorage.removeItem(SIMULATED_VERSION_KEY);
  } else {
    localStorage.setItem(SIMULATED_VERSION_KEY, version);
  }
}
