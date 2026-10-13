# Storage Map — Drive-first mapping phase

Target storage map (from context):
- User login & identity .......... Firebase Auth
- Account status / essential metadata ............ Firestore
- Sync signals / minimal revisions .............. Firestore
- Tasks, schedules, deadlines ................... Google Drive
- Notes, study progress, courses ................ Google Drive
- AI chat history + attachments ................. Google Drive
- Uploaded files, pdfs, images, docs ............ Google Drive
- File content indexes / chunks / embeddings .... Google Drive
- Recovery snapshots / data manifests ........... Google Drive
- Temporary working copies / offline edits ...... Local app storage

## 1. Active write paths, audited

### Firestore (legacy, to be reduced)
1. `src/lib/firebase.ts:286`  syncUserProfileToFirestore -> `users/{uid}` .............. KEEP (identity + essential account metadata)
2. `src/lib/firebase.ts:424`  syncTasksToFirestore -> `users/{uid}/tasks` ............. MOVE to Drive
3. `src/lib/firebase.ts:438`  syncScheduleToFirestore -> `users/{uid}/schedule` ...... MOVE to Drive
4. `src/lib/firebase.ts:452`  syncCoursesToFirestore -> `users/{uid}/courses` ........ MOVE to Drive
5. `src/lib/firebase.ts:466`  syncResourcesToFirestore -> `users/{uid}/resources` .... MOVE to Drive
6. `src/lib/firebase.ts:483`  syncGoogleCalendarStateToFirestore -> `integrations/googleCalendar`  KEEP (integrations state = sync signal)
7. `src/lib/firebase.ts:498`  syncGoogleDriveStateToFirestore -> `integrations/googleDrive`  KEEP (integration state = sync signal)
8. `src/lib/firebase.ts:509`  deleteTaskFromFirestore -> `users/{uid}/tasks/{id}` ..... MOVE to Drive
9. `src/lib/firebase.ts:517`  deleteCourseFromFirestore -> `users/{uid}/courses/{id}` . MOVE to Drive
10. `src/services/offlineSyncService.ts:381,398,404,412`  offline queue flush to Firestore -> move to Drive/local-queue only for pilot accounts
11. `src/services/webPushService.ts:177,212,259,281`  fcmTokens + scheduledPushes -> KEEP (identity + sync signals; Firestore rules deny everything else)

### Drive (new pilot)
1. `src/services/driveService.ts` — folder tree / manifest / partition files (already written)
2. `src/services/taskPilotService.ts` — tasks -> Drive (already wired)
3. `src/services/collectionPilotService.ts` — generic collections (defined, NOT wired)
4. `src/lib/googleDrive.ts` — OAuth connect/reconnect/disconnect + token caching

### Local storage
1. `src/utils/storage.ts` StudyStorage — all user data + offline queue + offline edits (default path for non-pilot and skip)
2. `src/services/offlineSyncService.ts` — offline queue (local, repopulated on each session)
3. `src/services/webPushService.ts` — fcmTokens (local + synced once to Firestore)

## 2. Drive partitioning entities / keys

COLLECTION_MAPPINGS (src/types/driveStorage.ts) maps every Firestore collection to a Drive folder:
- tasks ----> data/tasks (partitioned)
- schedule -> data/schedules (partitioned)
- goals ----> data/goals (partitioned)
- courses --> data/courses (partitioned)
- resources -> data/resources (partitioned)
- files ----> data/files (partitioned) [metadata only; binaries under files/originals, files/attachments, files/imported]
- notes ----> data/notes (partitioned)
- research -> data/research (partitioned)
- aiMemory -> data/ai-memory (partitioned)
- conversations -> data/conversations (partitioned)
- messages -> data/messages (per-entity-folder)
- notifications -> data/notifications (partitioned)
- quizzes ----> data/quizzes (partitioned)
- flashcards -> data/flashcards (partitioned)
- annotations -> data/annotations (partitioned)
- settings -> data/settings (single-document)
- reminders -> data/reminders (partitioned)

Partition key derivation (drivePartition.ts):
- partitionId = partitionId(collection, index)  where index = floor(start / PARTITION_TARGET_RECORDS)
- stable record id = the existing app record id (task-*, conv-*, file-*, ...) — never minted new
- tombstones use deletedAt + a new revision; conflicts go to _system/conflicts/<collection>__<id>.json
- sync checkpoints (only ids + revision, never payload) live in _system/sync-checkpoints/
- manifest.json (ids + counts + checksums) in _system/, never payload

## 3. Stale Firestore docs to reconcile

- Old Firestore-only docs for pilot accounts: NOT migrated on connect (intentional). They remain in Firestore as divergent copies; the pilot reads only Drive. Later re-auth triggers a one-time verification that compares counts; mismatches surface a reconnect prompt.
- Firestore='users/{uid}/sync-signals' documents already exist (from earlier pilot experiments) — these are the minimal signals ({entityType, recordId, revision, updatedAt, op}) and are VALID in the new schema; no action needed, they are simply ignored by Drive reads.
- Firestore='users/{uid}/tasks' records for pilot accounts are stale by design — not copied into Drive. Recoverable from Firestore; the new baseline is Drive.

## 4. Migration policy

Exact policy for old Firestore-only docs and new Drive keys:
- On connect (pilot): Drive structure initializes; no Firestore doc is read/copied. Old Firestore docs are left as-is.
- One-time verification (after re-auth, or on first launch for an existing pilot account): counts are compared per collection. Any mismatch is reported as 'stale Firestore docs' and prompts a reconnect + re-sync. The user chooses 're-sync from Drive' (authoritative) or 'keep local + delete remote'.
- New Drive key derivation is deterministic from the mapped collection + index; no external id minting (partitionId and record id reuse app ids).
- Migration is an explicit, opt-in, device-by-device operation; no automatic migration of payload.
