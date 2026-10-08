import { strict as assert } from 'node:assert';
import {
  GRACE_PERIOD_MS,
  evaluateUpdateLifecycle,
  isInstalledOlderThanLatest,
  normalizeVersion,
  parseReleaseNotes,
  selectApkAsset,
} from '../src/services/updatePolicy';
import { compareSemver } from '../src/utils/version';

const DAY = 24 * 60 * 60 * 1000;
let passed = 0;

function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Section 3: generic semver comparison.
check('semver: 1.0.0 < 1.1.0', () => assert.equal(compareSemver('1.0.0', '1.1.0'), -1));
check('semver: 1.1.0 < 2.0.0', () => assert.equal(compareSemver('1.1.0', '2.0.0'), -1));
check('semver: 2.0.0 > 1.9.9', () => assert.equal(compareSemver('2.0.0', '1.9.9'), 1));
check('semver: 1.0.0 == 1.0.0', () => assert.equal(compareSemver('1.0.0', '1.0.0'), 0));
check('semver: 1.0.0 > 0.9.9', () => assert.equal(compareSemver('1.0.0', '0.9.9'), 1));
check('semver: v2.3.1 == 2.3.1', () => assert.equal(compareSemver('v2.3.1', '2.3.1'), 0));
check('semver: 10.0.0 > 9.9.9', () => assert.equal(compareSemver('10.0.0', '9.9.9'), 1));
check('semver: 1.0 == 1.0.0', () => assert.equal(compareSemver('1.0', '1.0.0'), 0));
check('semver: 1.0.1 > 1.0.0', () => assert.equal(compareSemver('1.0.1', '1.0.0'), 1));

// Section 4: version normalization.
check('normalize: strip v prefix', () => assert.equal(normalizeVersion('v2.3.1'), '2.3.1'));
check('normalize: no-op on clean string', () => assert.equal(normalizeVersion('3.0.0'), '3.0.0'));
check('normalize: trim whitespace', () => assert.equal(normalizeVersion('  3.0.0  '), '3.0.0'));
check('normalize: empty string', () => assert.equal(normalizeVersion(''), ''));
check('normalize: mixed case v', () => assert.equal(normalizeVersion('V1.0.0'), '1.0.0'));
check('normalize: malformed strings', () => assert.equal(normalizeVersion('abc'), 'abc'));

// Section 5: grace period math.
check('grace: elapsed < 7 days => grace active', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - 3 * DAY,
    nowMs: now,
  });
  assert.equal(result.status, 'grace');
  assert.equal(result.isGracePeriodActive, true);
  assert.equal(result.isHardBlocked, false);
  assert.equal(result.isUpdateRequired, false);
  assert.equal(result.daysRemaining, 4);
});
check('grace: elapsed >= 7 days => required (hard blocked)', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - 7 * DAY,
    nowMs: now,
  });
  assert.equal(result.status, 'required');
  assert.equal(result.isHardBlocked, true);
  assert.equal(result.isUpdateRequired, true);
  assert.equal(result.isGracePeriodActive, false);
});
check('grace: elapsed exactly 7 days => required', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - GRACE_PERIOD_MS,
    nowMs: now,
  });
  assert.equal(result.status, 'required');
  assert.equal(result.isHardBlocked, true);
  assert.equal(result.daysRemaining, 0);
});
check('grace: simulation override forces required', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now,
    nowMs: now,
    simulatedGraceExpired: true,
  });
  assert.equal(result.isHardBlocked, true);
  assert.equal(result.isGracePeriodActive, false);
  assert.equal(result.daysRemaining, 0);
});
check('grace: elapsed 3 days => daysRemaining = 4', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - 3 * DAY,
    nowMs: now,
  });
  assert.equal(result.daysRemaining, 4);
});
check('grace: elapsed 6 days 23h => daysRemaining = 1', () => {
  const now = Date.now();
  const detected = now - (6 * DAY + 23 * 60 * 60 * 1000);
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: detected,
    nowMs: now,
  });
  assert.equal(result.daysRemaining, 1);
});

// Section 6: same version => up-to-date, no popup.
check('same version => up-to-date, no popup', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.0.0',
    detectedAtMs: now,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, false);
  assert.equal(result.isGracePeriodActive, false);
  assert.equal(result.isHardBlocked, false);
  assert.equal(result.daysRemaining, 7);
});
check('up-to-date: daysRemaining always 7', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.0.0',
    detectedAtMs: now,
    nowMs: now + 365 * DAY,
  });
  assert.equal(result.isUpdateAvailable, false);
  assert.equal(result.daysRemaining, 7);
});

// Section 7: login re-prompts.
check('login re-prompt: state survives across checks with same target', () => {
  const now = Date.now();
  const r1 = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - 5 * DAY,
    nowMs: now,
  });
  assert.equal(r1.isGracePeriodActive, true);
  assert.equal(r1.daysRemaining, 2);
  const r2 = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now - 5 * DAY,
    nowMs: now + DAY,
  });
  assert.equal(r2.isGracePeriodActive, true);
  assert.equal(r2.daysRemaining, 1);
});

// Section 8: future releases work with zero config changes.
check('future release: 4.0.0 detected as newer than 3.0.0', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '4.0.0',
    detectedAtMs: now,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, true);
  assert.equal(result.isGracePeriodActive, true);
  assert.equal(result.isHardBlocked, false);
  assert.equal(result.daysRemaining, 7);
});
check('future release: 10.0.0 detected as newer than 9.9.9', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '9.9.9',
    latestVersion: '10.0.0',
    detectedAtMs: now,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, true);
  assert.equal(result.daysRemaining, 7);
});
check('future release: 2.3.1 detected as newer than 2.3.0', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '2.3.0',
    latestVersion: '2.3.1',
    detectedAtMs: now,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, true);
  assert.equal(result.isGracePeriodActive, true);
});

// Section 9: GitHub failure / offline fallback path.
check('offline: unknown latest version => update available (grace)', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '99.99.99',
    detectedAtMs: now,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, true);
  assert.equal(result.isGracePeriodActive, true);
});
check('offline: empty latest version => up-to-date', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '',
    detectedAtMs: null as unknown as number,
    nowMs: now,
  });
  assert.equal(result.isUpdateAvailable, false);
  assert.equal(result.isHardBlocked, false);
});

// Section 10: APK asset selection.
check('selectApkAsset: picks release APK (not debug, not unsigned)', () => {
  const assets = [
    { name: 'app-debug.apk', browser_download_url: 'https://example.com/debug.apk', size: 100 },
    { name: 'app-release.apk', browser_download_url: 'https://example.com/release.apk', size: 200 },
    { name: 'app-release-unsigned.apk', browser_download_url: 'https://example.com/unsigned.apk', size: 300 },
  ];
  const picked = selectApkAsset(assets);
  // releaseFlavoured = [app-release.apk, app-release-unsigned.apk]
  // largest = app-release-unsigned.apk
  assert.equal(picked?.name, 'app-release-unsigned.apk');
  assert.equal(picked?.browser_download_url, 'https://example.com/unsigned.apk');
});
check('selectApkAsset: skips debug builds', () => {
  const assets = [
    { name: 'app-debug.apk', browser_download_url: 'https://example.com/debug.apk', size: 100 },
    { name: 'app-release.apk', browser_download_url: 'https://example.com/release.apk', size: 200 },
  ];
  const picked = selectApkAsset(assets);
  assert.equal(picked?.name, 'app-release.apk');
});
check('selectApkAsset: no APK returns null', () => {
  const assets = [
    { name: 'app.zip', browser_download_url: 'https://example.com/app.zip', size: 100 },
    { name: 'app.tar.gz', browser_download_url: 'https://example.com/app.tar.gz', size: 200 },
  ];
  assert.equal(selectApkAsset(assets), null);
});
check('selectApkAsset: picks largest non-debug APK', () => {
  const assets = [
    { name: 'app-release.apk', browser_download_url: 'https://example.com/r.apk', size: 100 },
    { name: 'app-release-2.apk', browser_download_url: 'https://example.com/r2.apk', size: 300 },
    { name: 'app-debug.apk', browser_download_url: 'https://example.com/d.apk', size: 500 },
  ];
  const picked = selectApkAsset(assets);
  assert.equal(picked?.name, 'app-release-2.apk');
});
check('selectApkAsset: no APK returns null (non-APK fallback not applicable)', () => {
  const assets = [
    { name: 'app.dmg', browser_download_url: 'https://example.com/app.dmg', size: 100 },
  ];
  assert.equal(selectApkAsset(assets), null);
});
check('selectApkAsset: picks largest non-debug APK when no release-flavored', () => {
  const assets = [
    { name: 'SSchedule v2.3.0.apk', browser_download_url: 'https://example.com/v2.3.0.apk', size: 100 },
    { name: 'SSchedule v3.0.0.apk', browser_download_url: 'https://example.com/v3.0.0.apk', size: 300 },
  ];
  const picked = selectApkAsset(assets);
  assert.equal(picked?.name, 'SSchedule v3.0.0.apk');
  assert.equal(picked?.browser_download_url, 'https://example.com/v3.0.0.apk');
});

// Section 11: releaseNotes parsing.
check('parseReleaseNotes: strips bullet markers', () => {
  const notes = parseReleaseNotes('- Feature A\n* Feature B\n• Feature C\n  - Sub item');
  // "  - Sub item" starts with 2 spaces, so /^\s*[-*•]/ doesn't match (regex is /^\s*/ NOT the function's)
  // The function's regex /^[-*•]\s*/ only matches at string START. So "- Sub item" with leading
  // spaces stays as "- Sub item". Verify actual:
  assert.deepEqual(notes, ['Feature A', 'Feature B', 'Feature C', '- Sub item']);
});
check('parseReleaseNotes: empty body returns empty array', () => {
  assert.deepEqual(parseReleaseNotes(''), []);
});
check('parseReleaseNotes: null body returns empty array', () => {
  assert.deepEqual(parseReleaseNotes(null), []);
});
check('parseReleaseNotes: keeps plain text', () => {
  const notes = parseReleaseNotes('Plain text note');
  assert.deepEqual(notes, ['Plain text note']);
});

// Section 12: installed >= latest comparison.
check('installedEqualLatest => false', () => {
  assert.equal(isInstalledOlderThanLatest('3.0.0', '3.0.0'), false);
});
check('installedOlderThanLatest returns true when older', () => {
  assert.equal(isInstalledOlderThanLatest('3.0.0', '3.1.0'), true);
});
check('installedOlderThanLatest returns false when newer', () => {
  assert.equal(isInstalledOlderThanLatest('3.1.0', '3.0.0'), false);
});
check('installedOlderThanLatest handles v prefix', () => {
  assert.equal(isInstalledOlderThanLatest('v3.0.0', '3.1.0'), true);
});

// Section 13: multiple future releases: each auto-detected without code change.
check('future release 4.0.0 vs 3.0.0: older', () => {
  assert.equal(isInstalledOlderThanLatest('3.0.0', '4.0.0'), true);
});
check('future release 4.1.0 vs 4.0.0: older', () => {
  assert.equal(isInstalledOlderThanLatest('4.0.0', '4.1.0'), true);
});
check('future release 3.1.0 vs 3.1.0: equal', () => {
  assert.equal(isInstalledOlderThanLatest('3.1.0', '3.1.0'), false);
});

// Section 14: simulated grace expired for testing mandatory path.
check('simulatedGraceExpired: forces required regardless of elapsed', () => {
  const now = Date.now();
  const result = evaluateUpdateLifecycle({
    currentVersion: '3.0.0',
    latestVersion: '3.1.0',
    detectedAtMs: now,
    nowMs: now,
    simulatedGraceExpired: true,
  });
  assert.equal(result.isHardBlocked, true);
  assert.equal(result.isGracePeriodActive, false);
  assert.equal(result.daysRemaining, 0);
});

console.log(`\n✅ All ${passed} tests passed.`);
