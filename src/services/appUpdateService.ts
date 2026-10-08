/**
 * App Update & Version Verification Service with 7-Day Grace Period
 *
 * Update feed: the project's GitHub Releases page. The newest published,
 * non-draft, non-prerelease release advertises the latest version, the APK to
 * download and the release notes — no backend required. The first time a newer
 * release is seen, a 7-day grace window starts (dismissible prompt); once it
 * expires the app hard-blocks until the user updates.
 */

import { AppVersionConfig, AppUpdateCheckResult } from '../types';
import { CURRENT_APP_VERSION, getActiveAppVersion, isVersionOlderThan } from '../utils/version';

const CACHED_UPDATE_CHECK_KEY = 'chronopulse_last_update_check';
const SIMULATED_GRACE_EXPIRED_KEY = 'chronopulse_simulated_grace_expired';
const POLICY_OVERRIDE_KEY = 'sshedule_update_policy_override';

/** Repo hosting the releases. Overridable at build time if the repo is renamed. */
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || 'mdshakibulislam99/SSchedule';
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Abort a hung request so the startup update check can never stall forever. */
const UPDATE_CHECK_TIMEOUT_MS = 10_000;

/**
 * Baseline policy applied on top of the GitHub release. The required version
 * stays below every real release so updates arrive through the dismissible
 * 7-day flow instead of force-blocking the moment a release ships; the hard
 * block comes from the grace window expiring (or a dev override).
 */
const BASELINE_POLICY: Pick<AppVersionConfig, 'minRequiredVersion' | 'forceUpdate' | 'gracePeriodDays'> = {
  minRequiredVersion: '1.0.0',
  forceUpdate: false,
  gracePeriodDays: 7,
};

/** Subset of the GitHub releases API response this service consumes. */
interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** Map a GitHub release onto the config shape the evaluator already understands. */
const releaseToConfig = (release: GitHubRelease): AppVersionConfig => {
  const latestVersion = (release.tag_name || '').trim().replace(/^v/i, '');
  // Prefer the APK asset so "Update Now" downloads it directly, else the release page.
  const apkAsset = (release.assets || []).find((asset) => /\.apk$/i.test(asset.name || ''));
  const releaseNotes = (release.body || '')
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  return {
    ...BASELINE_POLICY,
    latestVersion,
    downloadUrl: apkAsset?.browser_download_url || release.html_url || '',
    releaseNotes,
  };
};

/** localStorage key that anchors the grace window to a specific target version. */
const graceWindowKey = (version: string): string => `sshedule_update_first_detected_${version}`;

/**
 * Dev-only policy override (Settings sandbox controls). The packaged app has no
 * update backend, so forced-update scenarios are simulated on-device instead.
 */
const readPolicyOverride = (): Partial<AppVersionConfig> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POLICY_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppVersionConfig>) : null;
  } catch {
    return null;
  }
};

const applyPolicyOverride = (config: AppVersionConfig): AppVersionConfig => {
  const override = readPolicyOverride();
  return override ? { ...config, ...override } : config;
};

export const AppUpdateService = {
  /**
   * Check the installed version against the latest GitHub release.
   *
   * No backend involved: the newest published GitHub release is the single
   * source of truth, so shipping a release is what turns the prompt on.
   */
  async checkAppVersion(): Promise<AppUpdateCheckResult> {
    const currentVersion = getActiveAppVersion();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(GITHUB_LATEST_RELEASE_URL, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch version info: HTTP ${response.status}`);
      }

      // Cache the RAW feed (without any dev overlay) so clearing a sandbox
      // override restores the real policy even while offline.
      const config = releaseToConfig((await response.json()) as GitHubRelease);

      // Save last successful check in local cache so the prompt still works offline
      try {
        localStorage.setItem(CACHED_UPDATE_CHECK_KEY, JSON.stringify({ config, timestamp: Date.now() }));
      } catch {
        // storage quota or incognito
      }

      return this.evaluateVersion(currentVersion, applyPolicyOverride(config));
    } catch (err) {
      console.warn('Could not verify app version against GitHub releases:', err);

      // Check if we have cached config that previously marked an update policy
      try {
        const cached = localStorage.getItem(CACHED_UPDATE_CHECK_KEY);
        if (cached) {
          const { config } = JSON.parse(cached);
          if (config && config.latestVersion) {
            return this.evaluateVersion(currentVersion, applyPolicyOverride(config));
          }
        }
      } catch {
        // ignore cache parse errors
      }

      // Safe fallback when completely offline and never fetched a policy: the
      // app itself is the newest known version, so nothing is forced. A dev
      // policy override (if set) still applies so sandbox testing works offline.
      return this.evaluateVersion(
        currentVersion,
        applyPolicyOverride({
          ...BASELINE_POLICY,
          latestVersion: CURRENT_APP_VERSION,
          downloadUrl: '',
          releaseNotes: [],
        }),
      );
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
    const firstDetectedKey = graceWindowKey(latest);
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

    // The grace window applies to ANY newer release (mandatory or not): every
    // update is dismissible for gracePeriodDays, then it hard-blocks the app.
    // If daysRemaining is 0 (grace period over), hard block immediately
    const updateObligation = needsUpdate || isUpdateAvailable;
    const isGracePeriodActive = updateObligation && daysRemaining > 0 && !isSimulatedGraceExpired;
    const isHardBlocked = updateObligation && (daysRemaining <= 0 || isSimulatedGraceExpired);

    return {
      // A hard-blocked client must present as "required" so the modal hides its
      // dismiss button; during the grace window it stays optional (dismissible).
      isUpdateRequired: needsUpdate || isHardBlocked,
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
        ? `Your 7-day update grace period has ended. SSchedule v${latest} is required to continue using the app.`
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
    localStorage.removeItem(graceWindowKey(version));
    localStorage.removeItem(SIMULATED_GRACE_EXPIRED_KEY);
  },

  /**
   * Developer utility: store a local policy override that wins over the GitHub
   * release (used by the Settings sandbox controls since the packaged app has
   * no update backend to POST to).
   */
  setPolicyOverride(override: Partial<AppVersionConfig>): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(POLICY_OVERRIDE_KEY, JSON.stringify(override));
    } catch {
      // storage quota or incognito
    }
  },

  /**
   * Developer utility: drop the local override and restore the GitHub feed.
   */
  clearPolicyOverride(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(POLICY_OVERRIDE_KEY);
  },
};
