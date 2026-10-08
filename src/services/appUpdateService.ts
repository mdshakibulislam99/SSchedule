/**
 * App Update & Version Verification Service — permanent, release-independent.
 *
 * Generic lifecycle (works for EVERY future release with zero code changes):
 *   1. Read installed version from CURRENT_APP_VERSION (single source of truth).
 *   2. Fetch GitHub `releases/latest` dynamically (tag_name + APK asset).
 *   3. Generic semver compare (installed < latest => target release).
 *   4. Persist FIRST detection timestamp per target release (never reset by
 *      Later / login / restart / force-close).
 *   5. elapsed < 7 days  => optional popup on app entry ([Update Now][Later]).
 *   6. elapsed >= 7 days => mandatory hard block ([Update Now] only).
 *   7. "Update Now" opens the APK asset from THAT latest release dynamically.
 *   8. After install, installed >= latest => state resolves automatically.
 *
 * Release process for future versions (no update-logic edits needed):
 *   bump version -> build APK -> create GitHub Release -> upload APK -> publish.
 */

import { AppVersionConfig, AppUpdateCheckResult } from '../types';
import { CURRENT_APP_VERSION, getActiveAppVersion } from '../utils/version';
import {
  GRACE_PERIOD_DAYS,
  ReleaseAsset,
  evaluateUpdateLifecycle,
  isInstalledOlderThanLatest,
  normalizeVersion,
  parseReleaseNotes,
  selectApkAsset,
} from './updatePolicy';

/**
 * Namespaced persistence for the update engine. Never reuse generic app keys
 * so update state can never clobber tasks/schedules/settings/auth data.
 */
const UPDATE_STATE_KEY = 'sschedule_update_state';
const UPDATE_SIMULATED_VERSION_KEY = 'sschedule_simulated_version';
const UPDATE_SIMULATED_GRACE_EXPIRED_KEY = 'sschedule_simulated_grace_expired';
const UPDATE_POLICY_OVERRIDE_KEY = 'sschedule_update_policy_override';

/** Legacy keys from before the rebrand — migrated once, then removed. */
const LEGACY_STATE_KEYS = [
  'chronopulse_last_update_check',
  'chronopulse_simulated_grace_expired',
  'sshedule_update_policy_override',
  'chronopulse_simulated_version',
];

/** Repo hosting the releases. Overridable at build time if the repo is renamed. */
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || 'mdshakibulislam99/SSchedule';
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Abort a hung request so the startup update check can never stall forever. */
const UPDATE_CHECK_TIMEOUT_MS = 10_000;

/** Play-store fallback when a release carries no usable download URL. */
const PLAY_STORE_FALLBACK_URL = 'https://play.google.com/store/apps/details?id=com.sschedule.app';

/** Dev-only override shape (Settings sandbox). Never set by production flow. */
interface PolicyOverride {
  latestVersion?: string;
  minRequiredVersion?: string;
  forceUpdate?: boolean;
  gracePeriodDays?: number;
  downloadUrl?: string;
  releasePageUrl?: string | null;
  apkAssetName?: string | null;
  title?: string;
  message?: string;
  releaseNotes?: string[];
  updatedAt?: string;
}

/**
 * Persisted update state. Keyed by TARGET release version so every future
 * release automatically gets its own first-detection timestamp without any
 * code change. Also caches the last known-good release payload so an
 * offline/failed check can re-evaluate the same target instead of going
 * blind — without ever creating a new detection timer while offline.
 */
interface ReleaseDetectionEntry {
  detectedAt: number;
}

interface CachedRelease {
  latestVersion: string;
  downloadUrl: string;
  releasePageUrl: string;
  apkAssetName: string | null;
  releaseNotes: string[];
  updatedAt: string;
  fetchedAt: number;
}

interface UpdatePersistedState {
  releases: Record<string, ReleaseDetectionEntry>;
  lastKnownRelease: CachedRelease | null;
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const emptyState = (): UpdatePersistedState => ({ releases: {}, lastKnownRelease: null });

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  body?: string | null;
  assets?: ReleaseAsset[];
}

function sanitizeDetectedAt(value: unknown, nowMs: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value > nowMs + 3_600_000) return null;
  return Math.floor(value);
}

function loadState(nowMs: number): UpdatePersistedState {
  const state = emptyState();
  if (!isBrowser()) return state;
  try {
    const prefix = 'sshedule_update_first_detected_';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const version = normalizeVersion(key.slice(prefix.length));
      if (!version) {
        localStorage.removeItem(key);
        continue;
      }
      const at = sanitizeDetectedAt(Number(localStorage.getItem(key)), nowMs);
      if (at !== null && state.releases[version] === undefined) {
        state.releases[version] = { detectedAt: at };
      }
      localStorage.removeItem(key);
    }
  } catch {
    // storage scan must never break the check
  }
  try {
    const raw = localStorage.getItem(UPDATE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UpdatePersistedState>;
      if (parsed && typeof parsed === 'object') {
        const releases = parsed.releases;
        if (releases && typeof releases === 'object') {
          for (const [version, entry] of Object.entries(releases)) {
            const clean = normalizeVersion(version);
            const at = sanitizeDetectedAt(entry?.detectedAt, nowMs);
            if (clean && at !== null && state.releases[clean] === undefined) {
              state.releases[clean] = { detectedAt: at };
            }
          }
        }
        const cached = parsed.lastKnownRelease;
        if (cached && typeof cached.latestVersion === 'string' && cached.latestVersion.trim()) {
          state.lastKnownRelease = {
            latestVersion: normalizeVersion(cached.latestVersion),
            downloadUrl: typeof cached.downloadUrl === 'string' ? cached.downloadUrl : '',
            releasePageUrl: typeof cached.releasePageUrl === 'string' ? cached.releasePageUrl : '',
            apkAssetName: typeof cached.apkAssetName === 'string' ? cached.apkAssetName : null,
            releaseNotes: Array.isArray(cached.releaseNotes)
              ? cached.releaseNotes.filter((n): n is string => typeof n === 'string')
              : [],
            updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
            fetchedAt: typeof cached.fetchedAt === 'number' ? cached.fetchedAt : nowMs,
          };
        }
      }
    }
  } catch {
    return emptyState();
  }
  try {
    for (const key of LEGACY_STATE_KEYS) localStorage.removeItem(key);
  } catch {
    // ignore
  }
  return state;
}

function saveState(state: UpdatePersistedState): void {
  if (!isBrowser()) return;
  try {
    const versions = Object.keys(state.releases).sort((a, b) => {
      const atA = state.releases[a]?.detectedAt ?? 0;
      const atB = state.releases[b]?.detectedAt ?? 0;
      return atA - atB;
    });
    const trimmed: UpdatePersistedState['releases'] = {};
    for (const v of versions.slice(-25)) trimmed[v] = state.releases[v];
    const payload = JSON.stringify({ releases: trimmed, lastKnownRelease: state.lastKnownRelease });
    localStorage.setItem(UPDATE_STATE_KEY, payload);
  } catch {
    // quota/incognito — session-only
  }
}

function readSimulatedGraceExpired(): boolean {
  if (!isBrowser()) return false;
  try {
    return localStorage.getItem(UPDATE_SIMULATED_GRACE_EXPIRED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Fetch the latest published GitHub release with a hard timeout. */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub releases API returned HTTP ${response.status}`);
    }
    return (await response.json()) as GitHubRelease;
  } finally {
    clearTimeout(timeout);
  }
}

/** Map a GitHub release onto the resolved config. Fully generic. */
function releaseToConfig(release: GitHubRelease): AppVersionConfig {
  const latestVersion = normalizeVersion(release.tag_name || '');
  const apkAsset = selectApkAsset(release.assets);
  const apkUrl = typeof apkAsset?.browser_download_url === 'string' ? apkAsset.browser_download_url : '';
  const releasePageUrl = typeof release.html_url === 'string' ? release.html_url : '';
  const downloadUrl = apkUrl || releasePageUrl || PLAY_STORE_FALLBACK_URL;
  return {
    latestVersion,
    minRequiredVersion: latestVersion,
    forceUpdate: false,
    gracePeriodDays: GRACE_PERIOD_DAYS,
    downloadUrl,
    releasePageUrl,
    apkAssetName: apkAsset?.name ?? null,
    releaseNotes: parseReleaseNotes(release.body),
    updatedAt: release.published_at || new Date().toISOString(),
  };
}

/** Read the dev sandbox override (Settings screen only). Never throws. */
function readPolicyOverride(): PolicyOverride | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(UPDATE_POLICY_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PolicyOverride;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function upToDateResult(currentVersion: string, latestVersion: string): AppUpdateCheckResult {
  return {
    isUpdateRequired: false,
    isUpdateAvailable: false,
    isGracePeriodActive: false,
    isHardBlocked: false,
    daysRemaining: GRACE_PERIOD_DAYS,
    gracePeriodDays: GRACE_PERIOD_DAYS,
    deadlineDate: new Date().toISOString(),
    currentVersion,
    minRequiredVersion: latestVersion || currentVersion,
    latestVersion,
    downloadUrl: PLAY_STORE_FALLBACK_URL,
    title: 'App Up to Date',
    message: 'You are running the latest version.',
    releaseNotes: [],
  };
}

export const AppUpdateService = {
  /**
   * Check the installed version against the latest GitHub release.
   *
   * Universal lifecycle (zero release-specific values):
   *   installed >= latest        -> normal app, no popup
   *   installed < latest, day<7   -> optional popup on app entry
   *   installed < latest, day>=7  -> mandatory hard block
   * A dev sandbox override (Settings screen) may substitute the latest
   * release for testing; production never sets one.
   */
  async checkAppVersion(): Promise<AppUpdateCheckResult> {
    const currentVersion = getActiveAppVersion();
    const nowMs = Date.now();
    const state = loadState(nowMs);
    const simulatedGraceExpired = readSimulatedGraceExpired();

    const applyOverride = (config: AppVersionConfig): AppVersionConfig => {
      const override = readPolicyOverride();
      if (!override) return config;
      return {
        ...config,
        latestVersion: override.latestVersion ? normalizeVersion(override.latestVersion) : config.latestVersion,
        downloadUrl: override.downloadUrl ?? config.downloadUrl,
        releasePageUrl: override.releasePageUrl ?? config.releasePageUrl,
        apkAssetName: override.apkAssetName ?? config.apkAssetName,
        releaseNotes: override.releaseNotes ?? config.releaseNotes,
        updatedAt: override.updatedAt ?? config.updatedAt,
      };
    };

    const evaluateTarget = (
      latestVersion: string,
      downloadUrl: string,
      releaseNotes: string[],
      updatedAt: string,
      createDetection: boolean,
    ): AppUpdateCheckResult => {
      const target = normalizeVersion(latestVersion);
      if (!target || !isInstalledOlderThanLatest(currentVersion, target)) {
        pruneResolvedEntries(state, currentVersion);
        saveState(state);
        return upToDateResult(currentVersion, target || currentVersion);
      }
      let detectedAt = state.releases[target]?.detectedAt ?? null;
      if (detectedAt === null && createDetection) {
        detectedAt = nowMs;
        state.releases[target] = { detectedAt };
        saveState(state);
      } else if (detectedAt === null) {
        detectedAt = nowMs;
      }
      const lifecycle = evaluateUpdateLifecycle({
        currentVersion,
        latestVersion: target,
        detectedAtMs: detectedAt,
        nowMs,
        simulatedGraceExpired,
      });
      const deadlineDate = new Date(lifecycle.deadlineMs as number).toISOString();
      return {
        isUpdateRequired: lifecycle.isUpdateRequired,
        isUpdateAvailable: lifecycle.isUpdateAvailable,
        isGracePeriodActive: lifecycle.isGracePeriodActive,
        isHardBlocked: lifecycle.isHardBlocked,
        daysRemaining: lifecycle.daysRemaining,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        deadlineDate,
        currentVersion,
        minRequiredVersion: target,
        latestVersion: target,
        downloadUrl: downloadUrl || PLAY_STORE_FALLBACK_URL,
        title: lifecycle.isHardBlocked
          ? 'Update Required — Grace Period Expired'
          : lifecycle.isGracePeriodActive
            ? `Update Available (${lifecycle.daysRemaining} ${lifecycle.daysRemaining === 1 ? 'day' : 'days'} left)`
            : 'New Update Available',
        message: lifecycle.isHardBlocked
          ? `Your 7-day update grace period has ended. SSchedule v${target} is required to continue using the app.`
          : lifecycle.isGracePeriodActive
            ? `A new version (v${target}) is available. You have ${lifecycle.daysRemaining} ${lifecycle.daysRemaining === 1 ? 'day' : 'days'} remaining to update before this version stops working.`
            : 'A new version with performance improvements is available.',
        releaseNotes,
      };
    };
    try {
      const config = applyOverride(releaseToConfig(await fetchLatestRelease()));
      // Cache the last known-good release (no dev overlay) so an offline
      // check can re-evaluate the SAME target without creating a new timer.
      state.lastKnownRelease = {
        latestVersion: config.latestVersion,
        downloadUrl: config.downloadUrl,
        releasePageUrl: config.releasePageUrl || '',
        apkAssetName: config.apkAssetName ?? null,
        releaseNotes: config.releaseNotes || [],
        updatedAt: config.updatedAt || new Date().toISOString(),
        fetchedAt: nowMs,
      };
      saveState(state);
      return evaluateTarget(
        config.latestVersion,
        config.downloadUrl,
        config.releaseNotes || [],
        config.updatedAt || new Date().toISOString(),
        true,
      );
    } catch (err) {
      console.warn('Could not verify app version against GitHub releases:', err);

      // Offline/failure: re-evaluate the last known-good target from
      // persisted state WITHOUT creating a new detection timestamp.
      // Exception: an already-expired mandatory deadline still hard-blocks.
      const cached = state.lastKnownRelease;
      if (cached && cached.latestVersion) {
        const override = readPolicyOverride();
        const latestVersion = override?.latestVersion
          ? normalizeVersion(override.latestVersion)
          : cached.latestVersion;
        return evaluateTarget(
          latestVersion,
          override?.downloadUrl ?? cached.downloadUrl,
          override?.releaseNotes ?? cached.releaseNotes,
          override?.updatedAt ?? cached.updatedAt,
          false,
        );
      }

      // Never fetched a release: the app itself is the newest known version,
      // so nothing is forced. A dev override still applies for sandbox tests.
      const override = readPolicyOverride();
      if (override?.latestVersion) {
        return evaluateTarget(
          normalizeVersion(override.latestVersion),
          override.downloadUrl || PLAY_STORE_FALLBACK_URL,
          override.releaseNotes || [],
          override.updatedAt || new Date().toISOString(),
          true,
        );
      }
      pruneResolvedEntries(state, currentVersion);
      saveState(state);
      return upToDateResult(currentVersion, currentVersion);
    }
  },

  /**
   * Generic evaluator kept for Settings/tests. Delegates to the same
   * lifecycle math: installed >= latest -> up-to-date; else grace/required
   * from the persisted per-release first-detection timestamp.
   */
  evaluateVersion(currentVersion: string, config: AppVersionConfig): AppUpdateCheckResult {
    const nowMs = Date.now();
    const state = loadState(nowMs);
    const target = normalizeVersion(config.latestVersion || '');
    if (!target || !isInstalledOlderThanLatest(currentVersion, target)) {
      pruneResolvedEntries(state, currentVersion);
      saveState(state);
      return upToDateResult(currentVersion, target || currentVersion);
    }
    let detectedAt = state.releases[target]?.detectedAt ?? null;
    if (detectedAt === null) {
      detectedAt = nowMs;
      state.releases[target] = { detectedAt };
      saveState(state);
    }
    const lifecycle = evaluateUpdateLifecycle({
      currentVersion,
      latestVersion: target,
      detectedAtMs: detectedAt,
      nowMs,
      simulatedGraceExpired: readSimulatedGraceExpired(),
    });
    const deadlineDate = new Date(lifecycle.deadlineMs as number).toISOString();
    return {
      isUpdateRequired: lifecycle.isUpdateRequired,
      isUpdateAvailable: lifecycle.isUpdateAvailable,
      isGracePeriodActive: lifecycle.isGracePeriodActive,
      isHardBlocked: lifecycle.isHardBlocked,
      daysRemaining: lifecycle.daysRemaining,
      gracePeriodDays: GRACE_PERIOD_DAYS,
      deadlineDate,
      currentVersion,
      minRequiredVersion: target,
      latestVersion: target,
      downloadUrl: config.downloadUrl || PLAY_STORE_FALLBACK_URL,
      title: lifecycle.isHardBlocked
        ? 'Update Required — Grace Period Expired'
        : lifecycle.isGracePeriodActive
          ? `Update Available (${lifecycle.daysRemaining} ${lifecycle.daysRemaining === 1 ? 'day' : 'days'} left)`
          : config.title || 'New Update Available',
      message: lifecycle.isHardBlocked
        ? `Your 7-day update grace period has ended. SSchedule v${target} is required to continue using the app.`
        : lifecycle.isGracePeriodActive
          ? `A new version (v${target}) is available. You have ${lifecycle.daysRemaining} ${lifecycle.daysRemaining === 1 ? 'day' : 'days'} remaining to update before this version stops working.`
          : config.message || 'A new version with performance improvements is available.',
      releaseNotes: config.releaseNotes || [],
    };
  },

  /**
   * Developer helper to simulate the 7-day grace period having expired
   */
  setSimulatedGraceExpired(expired: boolean): void {
    if (!isBrowser()) return;
    try {
      if (expired) {
        localStorage.setItem(UPDATE_SIMULATED_GRACE_EXPIRED_KEY, 'true');
      } else {
        localStorage.removeItem(UPDATE_SIMULATED_GRACE_EXPIRED_KEY);
      }
    } catch {
      // ignore
    }
  },

  isSimulatedGraceExpired(): boolean {
    return readSimulatedGraceExpired();
  },

  /**
   * Reset the first detected timestamp for testing fresh 7 days
   */
  resetGracePeriod(version: string): void {
    if (!isBrowser()) return;
    try {
      const nowMs = Date.now();
      const state = loadState(nowMs);
      const target = normalizeVersion(version);
      if (target && state.releases[target]) {
        delete state.releases[target];
        saveState(state);
      }
      localStorage.removeItem(UPDATE_SIMULATED_GRACE_EXPIRED_KEY);
    } catch {
      // ignore
    }
  },

  /**
   * Developer utility: store a local policy override that wins over the GitHub
   * release (used by the Settings sandbox controls since the packaged app has
   * no update backend to POST to).
   */
  setPolicyOverride(override: PolicyOverride): void {
    if (!isBrowser()) return;
    try {
      localStorage.setItem(UPDATE_POLICY_OVERRIDE_KEY, JSON.stringify(override));
    } catch {
      // storage quota or incognito
    }
  },

  /**
   * Developer utility: drop the local override and restore the GitHub feed.
   */
  clearPolicyOverride(): void {
    if (!isBrowser()) return;
    try {
      localStorage.removeItem(UPDATE_POLICY_OVERRIDE_KEY);
    } catch {
      // ignore
    }
  },
};

/**
 * Drop detection entries for releases the installed build already satisfies
 * (installed >= target). Runs only when a check resolves to up-to-date, so an
 * in-grace target is never pruned early.
 */
function pruneResolvedEntries(state: UpdatePersistedState, currentVersion: string): void {
  const current = normalizeVersion(currentVersion);
  for (const version of Object.keys(state.releases)) {
    if (!isInstalledOlderThanLatest(current, version)) {
      delete state.releases[version];
    }
  }
  const cached = state.lastKnownRelease;
  if (cached && !isInstalledOlderThanLatest(current, cached.latestVersion)) {
    state.lastKnownRelease = null;
  }
}
