/**
 * SSchedule — Cloud Functions
 *
 * Email OTP for in-app password reset. The app flow is:
 *   1. requestPasswordResetOtp({ email })        -> generates a 6-digit code,
 *      stores its SHA-256 hash in Firestore and emails the code (Resend).
 *   2. verifyPasswordResetOtp({ email, code })   -> checks the code and returns
 *      a short-lived Firebase custom token as proof of verification.
 *   3. The app then signs in with that token (signInWithCustomToken) and calls
 *      updatePassword() client-side, so the new password never touches us.
 *
 * Setup (one time):
 *   cd functions && npm install
 *   firebase functions:secrets:set RESEND_API_KEY   (paste your Resend API key)
 *   firebase deploy --only functions
 *
 * Optional env/secret: OTP_FROM_EMAIL (default: onboarding@resend.dev)
 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");

const {
  Timestamp,
} = require("firebase-admin/firestore");

admin.initializeApp();

const CODE_TTL_MS = 10 * 60 * 1000; // code expires after 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // max 1 new code per email per minute
const MAX_ATTEMPTS = 5; // max wrong guesses per code
const TOKEN_TTL_MS = 5 * 60 * 1000; // verification token good for 5 minutes
const APP_NAME = "SSchedule";
const FROM_EMAIL = process.env.OTP_FROM_EMAIL || "onboarding@resend.dev";

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "The reset service is not configured yet."
    );
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Resend error", res.status, body);
    throw new functions.https.HttpsError(
      "internal",
      "Could not send the email. Please try again."
    );
  }
}

/**
 * Step 1: send a 6-digit reset code to the account's email.
 */
exports.requestPasswordResetOtp = functions.https.onCall(async (data) => {
  const email = String((data && data.email) || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new functions.https.HttpsError("invalid-argument", "Enter a valid email address.");
  }

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    throw new functions.https.HttpsError("not-found", "No account found with this email.");
  }

  const ref = admin.firestore().collection("resetCodes").doc(email);
  const now = Date.now();
  const snap = await ref.get();
  if (snap.exists) {
    const rec = snap.data() || {};
    if (now - (rec.createdAt || 0) < RESEND_COOLDOWN_MS && !rec.consumed) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "You already have a code on the way. Check your inbox, or try again in a minute."
      );
    }
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await ref.set({
    email,
    uid: user.uid,
    codeHash: sha256(code),
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    consumed: false,
  });

  await sendEmail(
    email,
    `Your ${APP_NAME} reset code`,
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 8px;color:#4338ca">${APP_NAME}</h2>
      <p style="margin:0 0 16px">Your one-time password reset code is:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef2ff;border-radius:12px;padding:16px;text-align:center;color:#4338ca">${code}</div>
      <p style="color:#64748b;font-size:13px;margin-top:16px">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
    </div>`
  );

  return { ok: true };
});

/**
 * Step 2: verify the code. Returns a short-lived Firebase custom token that
 * proves the user verified their email, so the app can finish the reset.
 */
exports.verifyPasswordResetOtp = functions.https.onCall(async (data) => {
  const email = String((data && data.email) || "").trim().toLowerCase();
  const code = String((data && data.code) || "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new functions.https.HttpsError("invalid-argument", "Enter the 6-digit code from the email.");
  }

  const ref = admin.firestore().collection("resetCodes").doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("failed-precondition", "No active code for this email. Request a new one.");
  }
  const rec = snap.data() || {};
  const now = Date.now();

  if (rec.consumed || now > (rec.expiresAt || 0)) {
    throw new functions.https.HttpsError("failed-precondition", "This code has expired. Request a new one.");
  }
  if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
    await ref.update({ consumed: true });
    throw new functions.https.HttpsError("resource-exhausted", "Too many wrong attempts. Request a new code.");
  }
  if (sha256(code) !== rec.codeHash) {
    await ref.update({ attempts: (rec.attempts || 0) + 1 });
    throw new functions.https.HttpsError("permission-denied", "Incorrect code. Check the email and try again.");
  }

  const token = await admin.auth().createCustomToken(
    `${email}|password-reset`,
    { email, action: "password-reset" },
    TOKEN_TTL_MS
  );
  await ref.update({ consumed: true, verifiedAt: now });

  return { ok: true, email, token };

/**
 * ---------------------------------------------------------------------------
 * Web Push (FCM) — powers iPhone Home-Screen PWA notifications.
 * ---------------------------------------------------------------------------
 * The client mirrors its computed reminder list into the top-level
 * `scheduledPushes` collection (doc id `{uid}_{reminderId}`). A scheduled
 * function below fires each reminder at its `fireAt` time over FCM Web Push,
 * so notifications arrive even when the PWA is closed (iOS gives no background
 * execution to web apps — only the OS push service can wake it).
 */

const SCHEDULED_PUSHES = "scheduledPushes";
const FCM_TOKENS = "fcmTokens";
// Web Push payloads must be flat string maps for FCM data messages.
const toStringMap = (obj) => {
  const out = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }
  return out;
};

/**
 * Send one data-only FCM message to a set of registration tokens. Data-only is
 * deliberate: iOS WebKit requires the service worker's own `push` handler to
 * call showNotification(), which our public/sw.js does.
 * Returns the MessagingResult so the caller can prune dead tokens.
 */
async function sendWebPush(tokens, { title, body, data }) {
  if (!tokens.length) return null;
  return admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title,
      body,
      url: "/",
      ...toStringMap(data),
    },
  });
}

// Remove tokens FCM reports as invalid so we stop targeting dead installs.
async function pruneInvalidTokens(uid, tokens, responses) {
  const dead = [];
  responses.forEach((res, i) => {
    const code = res.error && res.error.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      dead.push(tokens[i]);
    }
  });
  if (!dead.length) return;
  const snap = await admin.firestore().collection("users").doc(uid).collection(FCM_TOKENS).get();
  const toDelete = snap.docs.filter((d) => dead.includes(d.data().token));
  await Promise.all(toDelete.map((d) => d.ref.delete()));
}

async function tokensForUser(uid) {
  const snap = await admin.firestore().collection("users").doc(uid).collection(FCM_TOKENS).get();
  return snap.docs.map((d) => d.data().token).filter(Boolean);
}

/**
 * Callable: send a one-off test push to the signed-in user's devices.
 * Lets the settings screen verify the whole pipeline immediately.
 */
exports.sendTestPush = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in to send a test push.");
  }
  const uid = context.auth.uid;
  const tokens = await tokensForUser(uid);
  if (!tokens.length) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "No registered device. Enable push notifications on your device first."
    );
  }

  const result = await sendWebPush(tokens, {
    title: "✅ SSchedule Push Test",
    body: "Push notifications are working on this device.",
    data: { tag: "test-push" },
  });
  await pruneInvalidTokens(uid, tokens, result.responses || []);
  return { sent: result.successCount || 0 };
});

/**
 * Scheduled: every minute, fire any due reminders over FCM Web Push.
 * Query is a single-field range on `fireAt` (auto-indexed); `sent === false` is
 * filtered in memory so no composite index is required.
 */
exports.dispatchDuePushes = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Timestamp.now();

    const due = await db
      .collection(SCHEDULED_PUSHES)
      .where("fireAt", "<=", now)
      .limit(500)
      .get();

    const pending = due.docs.filter((d) => d.data().sent === false);
    if (pending.empty) return null;

    // Group by user so we fetch each user's tokens once.
    const byUser = new Map();
    for (const docSnap of pending) {
      const d = docSnap.data();
      if (!d.uid) continue;
      if (!byUser.has(d.uid)) byUser.set(d.uid, []);
      byUser.get(d.uid).push({ ref: docSnap.ref, data: d });
    }

    for (const [uid, items] of byUser) {
      const tokens = await tokensForUser(uid);
      if (!tokens.length) {
        // No devices — mark as sent so we don't retry forever.
        await Promise.all(items.map((it) => it.ref.update({ sent: true, sentAt: now })));
        continue;
      }
      for (const item of items) {
        const result = await sendWebPush(tokens, {
          title: item.data.title || "SSchedule",
          body: item.data.body || "",
          data: { ...(item.data.extra || {}), reminderId: String(item.data.reminderId ?? "") },
        });
        await pruneInvalidTokens(uid, tokens, result.responses || []);
        await item.ref.update({ sent: true, sentAt: now });
      }
    }
    return null;
  });

});
