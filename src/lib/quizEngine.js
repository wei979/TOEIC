/**
 * Quiz Engine - handles card selection with scheduling rules.
 *
 * Modes:
 * - Normal (1:1): alternate unseen → seen → unseen → seen
 * - Review-heavy (3:1): when seen >> memorized, do 3 seen → 1 unseen
 *
 * Rules:
 * 1. Every 20th card → force a "memorized" card for re-verification
 * 2. If review-heavy mode: need 3 consecutive seen before 1 new card
 * 3. If normal mode: alternate 1:1 between unseen and seen
 * 4. Review always picks the oldest-seen card first
 *
 * Review-heavy triggers when: seen >= 6 AND seen > memorized * 2
 */

import { getAllProgress } from "./storage.js";

const MAX_CONSECUTIVE_UNSEEN = 1;
const MEMORIZED_REVIEW_INTERVAL = 20;
const REVIEW_HEAVY_THRESHOLD = 6;
const REVIEW_HEAVY_RATIO = 2;
const REVIEW_HEAVY_SEEN_REQUIRED = 10;

/**
 * Pick the next card to show.
 * @param {Array} cards - all cards from questions.json
 * @param {object} context - session context
 * @param {string|null} context.currentCardId - card to avoid picking again
 * @param {number} context.consecutiveUnseenCount - how many unseen cards shown in a row
 * @param {number} context.consecutiveSeenCount - how many seen cards shown in a row
 * @param {number} context.totalShownCount - total cards shown this session
 * @returns {object|null} selected card, or null if all memorized
 */
export function pickNextCard(cards, context = {}) {
  const {
    currentCardId = null,
    consecutiveUnseenCount = 0,
    consecutiveSeenCount = 0,
    totalShownCount = 0,
  } = context;

  const progress = getAllProgress();

  const unseen = [];
  const seen = [];
  const memorized = [];

  for (const card of cards) {
    if (card.id === currentCardId) continue;
    const p = progress[card.id];
    if (!p || p.status === "unseen") {
      unseen.push(card);
    } else if (p.status === "seen") {
      seen.push(card);
    } else if (p.status === "memorized") {
      memorized.push(card);
    }
  }

  // All done: no unseen or seen cards left
  if (unseen.length === 0 && seen.length === 0) {
    if (totalShownCount > 0 && totalShownCount % MEMORIZED_REVIEW_INTERVAL === 0 && memorized.length > 0) {
      return pickOldest(memorized, progress);
    }
    return null;
  }

  // Rule 1: Every 20th card, force a memorized card for review
  if (totalShownCount > 0 && totalShownCount % MEMORIZED_REVIEW_INTERVAL === 0 && memorized.length > 0) {
    return pickOldest(memorized, progress);
  }

  // Determine mode: review-heavy or normal
  const isReviewHeavy = seen.length >= REVIEW_HEAVY_THRESHOLD &&
    seen.length > (memorized.length + 1) * REVIEW_HEAVY_RATIO;

  if (isReviewHeavy) {
    // Review-heavy mode (3:1): need 3 consecutive seen before allowing 1 new
    if (consecutiveSeenCount >= REVIEW_HEAVY_SEEN_REQUIRED && unseen.length > 0) {
      return pickUnseenCard(unseen);
    }
    if (seen.length > 0) {
      return pickOldest(seen, progress);
    }
    if (unseen.length > 0) {
      return pickUnseenCard(unseen);
    }
  } else {
    // Normal mode (1:1): after 1 unseen, force a seen card
    if (consecutiveUnseenCount >= MAX_CONSECUTIVE_UNSEEN && seen.length > 0) {
      return pickOldest(seen, progress);
    }
    if (unseen.length > 0) {
      return pickUnseenCard(unseen);
    }
    if (seen.length > 0) {
      return pickOldest(seen, progress);
    }
  }

  return null;
}

/**
 * Pick the oldest-seen card from a pool (most likely to be forgotten).
 */
function pickOldest(pool, progress) {
  const sorted = [...pool].sort((a, b) => {
    const pa = progress[a.id] || {};
    const pb = progress[b.id] || {};
    return (pa.lastSeen || 0) - (pb.lastSeen || 0);
  });
  return sorted[0];
}

/**
 * Pick an unseen card: random part → random unit → random card.
 */
function pickUnseenCard(unseen) {
  const byPart = {};
  for (const card of unseen) {
    if (!byPart[card.part]) byPart[card.part] = [];
    byPart[card.part].push(card);
  }

  const parts = Object.keys(byPart);
  const randomPart = parts[Math.floor(Math.random() * parts.length)];
  const partCards = byPart[randomPart];

  const byUnit = {};
  for (const card of partCards) {
    if (!byUnit[card.unit]) byUnit[card.unit] = [];
    byUnit[card.unit].push(card);
  }

  const units = Object.keys(byUnit);
  const randomUnit = units[Math.floor(Math.random() * units.length)];
  const unitCards = byUnit[randomUnit];

  return unitCards[Math.floor(Math.random() * unitCards.length)];
}

export {
  MAX_CONSECUTIVE_UNSEEN,
  MEMORIZED_REVIEW_INTERVAL,
  REVIEW_HEAVY_THRESHOLD,
  REVIEW_HEAVY_RATIO,
  REVIEW_HEAVY_SEEN_REQUIRED,
};
