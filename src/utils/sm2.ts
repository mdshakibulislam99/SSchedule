/**
 * SuperMemo 2 (SM-2) Spaced Repetition Algorithm
 * Computes optimal review intervals for flashcards to maximize retention.
 */

export interface SM2Result {
  repetitions: number;
  interval: number; // in days
  easeFactor: number;
  nextReviewDate: string; // YYYY-MM-DD
  mastered: boolean;
}

/**
 * Calculates updated SM-2 parameters based on recall quality.
 * @param quality 1 = Again/Failed, 3 = Hard, 4 = Good, 5 = Easy
 */
export function calculateSM2(
  quality: number,
  previousRepetitions = 0,
  previousInterval = 1,
  previousEaseFactor = 2.5
): SM2Result {
  let repetitions = previousRepetitions;
  let interval = previousInterval;
  let easeFactor = previousEaseFactor;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.max(1, Math.round(interval * easeFactor));
    }
    repetitions++;
  } else {
    repetitions = 0;
    interval = 1;
  }

  // Update Ease Factor (EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  const nextReviewDate = nextDate.toISOString().split('T')[0];

  return {
    repetitions,
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReviewDate,
    mastered: quality >= 4 && repetitions >= 3,
  };
}

/**
 * Checks if a flashcard is due for review today or overdue.
 */
export function isCardDueForReview(card: { nextReviewDate?: string }): boolean {
  if (!card.nextReviewDate) return true;
  const today = new Date().toISOString().split('T')[0];
  return card.nextReviewDate <= today;
}

/**
 * Text-to-speech for hands-free audio flashcard practice.
 */
export function speakText(text: string): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
