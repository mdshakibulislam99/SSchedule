/**
 * App Update & Version Verification Service with 7-Day Grace Period
 */

import { AppVersionConfig, AppUpdateCheckResult } from '../types';
import { apiUrl } from '../lib/api';
import { CURRENT_APP_VERSION, getActiveAppVersion, isVersionOlderThan } from '../utils/version';

const CACHED_UPDATE_CHECK_KEY = 'chronopulse_last_update_check';
const SIMULATED_GRACE_EXPIRED_KEY = 'chronopulse_simulated_grace_expired';

export const AppUpdateService = {
  /**
   * Check if the current app version meets remote requirements
   */
  async checkAppVersion(): Promise<AppUpdateCheckResult> {
    const currentVersion = getActiveAppVersion();

    try {
      const response = await fetch(apiUrl('/api/app-version'), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch version info: HTTP ${response.status}`);
      }

      const config: AppVersionConfig = await response.json();

      // Save last successful check in local cache
      try {
        localStorage.setItem(CACHED_UPDATE_CHECK_KEY, JSON.stringify({ config, timestamp: Date.now() }));
      } catch {
        // storage quota or incognito
      }

      return this.evaluateVersion(currentVersion, config);
    } catch (err) {
      console.warn('Could not verify app version against remote server:', err);

      // Check if we have cached config that previously marked an update policy
      try {
        const cached = localStorage.getItem(CACHED_UPDATE_CHECK_KEY);
        if (cached) {
          const { config } = JSON.parse(cached);
          if (config && config.minRequiredVersion) {
            return this.evaluateVersion(currentVersion, config);
          }
        }
      } catch {
        // ignore cache parse errors
      }

      // Safe fallback when completely offline without past restrictions
      return {
        isUpdateRequired: false,
        isUpdateAvailable: false,
        isGracePeriodActive: false,
        isHardBlocked: false,
        daysRemaining: 7,
        gracePeriodDays: 7,
        deadlineDate: new Date().toISOString(),
        currentVersion,
        minRequiredVersion: currentVersion,
        latestVersion: currentVersion,
        downloadUrl: 'https://play.google.com/store/apps/details?id=com.sschedule.app',
        title: 'SShedule Up to Date',
        message: 'You are running the latest version.',
        releaseNotes: [],
      };
    }
  },

  /**
   * Evaluates installed version against remote policy and calculates 7-day grace period
   */
  evaluateVersion(currentVersion: string, config: AppVersionConfig): AppUpdateCheckResult {
    // Fall back to the running build's own version, not a hardcoded string, so
    // these defaults never drift out of sync after a release bump.
    const minRequired = config.minRequiredVersion || CURRENT_APP_VERSION;
    const latest = config.latestVersion || CURRENT_APP_VERSION;
    const gracePeriodDays = typeof config.gracePeriodDays === 'number' && config.gracePeriodDays >= 0 ? config.gracePeriodDays : 7;

    // Check version discrepancies
    const isBelowMin = isVersionOlderThan(currentVersion, minRequired);
    const isBelowLatest = isVersionOlderThan(currentVersion, latest);

    // Is an update flagged either because it's below minimum or remote forceUpdate is requested
    const needsUpdate = isBelowMin || (config.forceUpdate && isBelowLatest);
    const isUpdateAvailable = isBelowLatest;

    // If no update is required or available, everything is green
    if (!needsUpdate && !isUpdateAvailable) {
      return {
        isUpdateRequired: false,
        isUpdateAvailable: false,
        isGracePeriodActive: false,
        isHardBlocked: false,
        daysRemaining: gracePeriodDays,
        gracePeriodDays,
        deadlineDate: new Date().toISOString(),
        currentVersion,
        minRequiredVersion: minRequired,
        latestVersion: latest,
        downloadUrl: config.downloadUrl || 'https://play.google.com/store/apps/details?id=com.sschedule.app',
        title: 'App Up to Date',
        message: 'You are running the latest version.',
        releaseNotes: config.releaseNotes || [],
      };
    }

    // --- Grace Period Calculation ---
    // Key by the target version so every new version release gets its own fresh 7-day window
    const firstDetectedKey = `sshedule_update_first_detected_${latest}`;
    let firstDetectedAt = Date.now();

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(firstDetectedKey);
      if (stored) {
        firstDetectedAt = Number(stored) || Date.now();
      } else {
        localStorage.setItem(firstDetectedKey, String(firstDetectedAt));
      }
    }

    const graceDurationMs = gracePeriodDays * 24 * 60 * 60 * 1000;
    const deadlineTime = firstDetectedAt + graceDurationMs;
    const deadlineDate = new Date(deadlineTime).toISOString();

    const now = Date.now();
    const msRemaining = deadlineTime - now;
    let daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

    // Check for developer simulation override
    const isSimulatedGraceExpired =
      typeof window !== 'undefined' && localStorage.getItem(SIMULATED_GRACE_EXPIRED_KEY) === 'true';

    if (isSimulatedGraceExpired) {
      daysRemaining = 0;
    }

    // If daysRemaining is 0 (grace period over), hard block immediately
    const isGracePeriodActive = needsUpdate && daysRemaining > 0 && !isSimulatedGraceExpired;
    const isHardBlocked = needsUpdate && (daysRemaining <= 0 || isSimulatedGraceExpired);

    return {
      isUpdateRequired: needsUpdate,
      isUpdateAvailable,
      isGracePeriodActive,
      isHardBlocked,
      daysRemaining,
      gracePeriodDays,
      deadlineDate,
      currentVersion,
      minRequiredVersion: minRequired,
      latestVersion: latest,
      downloadUrl: config.downloadUrl || 'https://play.google.com/store/apps/details?id=com.sschedule.app',
      title: isHardBlocked
        ? 'Update Required — Grace Period Expired'
        : isGracePeriodActive
        ? `Update Available (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left)`
        : config.title || 'New Update Available',
      message: isHardBlocked
        ? `Your 7-day update grace period has ended. SShedule v${latest} is required to continue using the app.`
        : isGracePeriodActive
        ? `A new version (v${latest}) is available. You have ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining to update before this version stops working.`
        : config.message || 'A new version with performance improvements is available.',
      releaseNotes: config.releaseNotes || [],
    };
  },

  /**
   * Developer helper to simulate the 7-day grace period having expired
   */
  setSimulatedGraceExpired(expired: boolean): void {
    if (typeof window === 'undefined') return;
    if (expired) {
      localStorage.setItem(SIMULATED_GRACE_EXPIRED_KEY, 'true');
    } else {
      localStorage.removeItem(SIMULATED_GRACE_EXPIRED_KEY);
    }
  },

  isSimulatedGraceExpired(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIMULATED_GRACE_EXPIRED_KEY) === 'true';
  },

  /**
   * Reset the first detected timestamp for testing fresh 7 days
   */
  resetGracePeriod(version: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`chronopulse_update_first_detected_${version}`);
    localStorage.removeItem(SIMULATED_GRACE_EXPIRED_KEY);
  },

  /**
   * Admin / developer utility to update the remote version requirements
   */
  async updateRemotePolicy(params: Partial<AppVersionConfig>): Promise<boolean> {
    try {
      const response = await fetch(apiUrl('/api/app-version'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return response.ok;
    } catch (err) {
      console.error('Failed to update remote version policy:', err);
      return false;
    }
  },
};
