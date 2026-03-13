/**
 * LocalStorage manager for quiz progress.
 *
 * Progress shape per card:
 * {
 *   status: "unseen" | "seen" | "memorized",
 *   consecutiveCorrect: number,
 *   totalAttempts: number,
 *   lastSeen: number (timestamp)
 * }
 */

const STORAGE_KEY = "toeic-progress";
const CONSECUTIVE_TO_MEMORIZE = 2;

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getCardProgress(cardId) {
  const progress = loadProgress();
  return progress[cardId] || {
    status: "unseen",
    consecutiveCorrect: 0,
    totalAttempts: 0,
    lastSeen: null,
  };
}

export function getAllProgress() {
  return loadProgress();
}

/**
 * Record a quiz attempt for a card.
 * @param {string} cardId
 * @param {boolean} allCorrect - whether ALL questions in the card were answered correctly
 * @returns {object} updated card progress
 */
export function recordAttempt(cardId, allCorrect) {
  const progress = loadProgress();
  const card = progress[cardId] || {
    status: "unseen",
    consecutiveCorrect: 0,
    totalAttempts: 0,
    lastSeen: null,
  };

  card.totalAttempts += 1;
  card.lastSeen = Date.now();
  card.status = "seen";

  if (allCorrect) {
    card.consecutiveCorrect += 1;
    if (card.consecutiveCorrect >= CONSECUTIVE_TO_MEMORIZE) {
      card.status = "memorized";
    }
  } else {
    card.consecutiveCorrect = 0;
  }

  progress[cardId] = card;
  saveProgress(progress);
  return card;
}

/**
 * Compute overall stats from progress and card list.
 */
export function computeStats(cards) {
  const progress = loadProgress();
  let unseen = 0;
  let seen = 0;
  let memorized = 0;

  for (const card of cards) {
    const p = progress[card.id];
    if (!p || p.status === "unseen") unseen++;
    else if (p.status === "memorized") memorized++;
    else seen++;
  }

  return {
    total: cards.length,
    unseen,
    seen,
    memorized,
    percent: cards.length > 0 ? ((memorized / cards.length) * 100).toFixed(1) : "0.0",
  };
}

export function resetAllProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

export { CONSECUTIVE_TO_MEMORIZE };
