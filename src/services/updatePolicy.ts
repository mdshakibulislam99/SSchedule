import { compareSemver } from '../utils/version';

export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const GRACE_PERIOD_DAYS = 7;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type UpdateLifecycleStatus = 'up-to-date' | 'grace' | 'required';

export interface UpdateLifecycleInput {
  currentVersion: string;
  latestVersion: string;
  detectedAtMs: number | null;
  nowMs: number;
  simulatedGraceExpired?: boolean;
}


export interface UpdateLifecycleResult {
  status: UpdateLifecycleStatus;
  isUpdateAvailable: boolean;
  isGracePeriodActive: boolean;
  isHardBlocked: boolean;
  isUpdateRequired: boolean;
  elapsedMs: number;
  daysRemaining: number;
  deadlineMs: number | null;
}

export interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

export function normalizeVersion(version: string): string {
  return (version || '').trim().replace(/^v/i, '');
}

export function isInstalledOlderThanLatest(current: string, latest: string): boolean {
  return compareSemver(normalizeVersion(current), normalizeVersion(latest)) < 0;
}


export function selectApkAsset(assets: ReleaseAsset[] | undefined | null): ReleaseAsset | null {
  const list = Array.isArray(assets) ? assets : [];
  const apks = list.filter((a) => typeof a?.name === 'string' && /\.apk$/i.test(a.name as string));
  if (apks.length === 0) return null;
  const nonDebug = apks.filter((a) => !/(debug|symbols?|sources?)/i.test(a.name || ''));
  const pool = nonDebug.length > 0 ? nonDebug : apks;
  const releaseFlavoured = pool.filter((a) => /release/i.test(a.name || ''));
  const finalists = releaseFlavoured.length > 0 ? releaseFlavoured : pool;
  const withSize = finalists.filter((a) => typeof a.size === 'number' && (a.size as number) > 0);
  if (withSize.length > 0) {
    let best = withSize[0];
    for (const a of withSize) {
      const s = a.size as number;
      const bs = best.size as number;
      if (s > bs) best = a;
      else if (s === bs && (a.name || '') < (best.name || '')) best = a;
    }
    return best;
  }
  const sorted = [...finalists].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return sorted[0];
}

export function parseReleaseNotes(body: string | null | undefined): string[] {
  return (body || '').split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
}

export function evaluateUpdateLifecycle(input: UpdateLifecycleInput): UpdateLifecycleResult {
  const simulatedGraceExpired = input.simulatedGraceExpired === true;
  if (!isInstalledOlderThanLatest(input.currentVersion, input.latestVersion)) {
    return {
      status: 'up-to-date',
      isUpdateAvailable: false,
      isGracePeriodActive: false,
      isHardBlocked: false,
      isUpdateRequired: false,
      elapsedMs: 0,
      daysRemaining: GRACE_PERIOD_DAYS,
      deadlineMs: null,
    };
  }
  const firstDetectedAt =
    typeof input.detectedAtMs === 'number' && Number.isFinite(input.detectedAtMs)
      ? input.detectedAtMs
      : input.nowMs;
  const elapsedMs = Math.max(0, input.nowMs - firstDetectedAt);
  const deadlineMs = firstDetectedAt + GRACE_PERIOD_MS;
  let daysRemaining = Math.max(0, Math.ceil((deadlineMs - input.nowMs) / MS_PER_DAY));
  if (simulatedGraceExpired) daysRemaining = 0;
  const expired = elapsedMs >= GRACE_PERIOD_MS || simulatedGraceExpired;
  if (expired) {
    return {
      status: 'required',
      isUpdateAvailable: true,
      isGracePeriodActive: false,
      isHardBlocked: true,
      isUpdateRequired: true,
      elapsedMs,
      daysRemaining: 0,
      deadlineMs,
    };
  }
  return {
    status: 'grace',
    isUpdateAvailable: true,
    isGracePeriodActive: true,
    isHardBlocked: false,
    isUpdateRequired: false,
    elapsedMs,
    daysRemaining,
    deadlineMs,
  };
}

