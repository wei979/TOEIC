/**
 * Quiz Engine - handles card selection with scheduling rules.
 *
 * Rules:
 * 1. Every 20th card → force a "memorized" card for re-verification
 * 2. Alternate 1:1 between unseen and seen cards (when seen cards exist)
 * 3. Review picks the oldest-seen card (most likely to be forgotten)
 *
 * Fallback: if forced pool is empty, fall back to any available pool.
 */

import { getAllProgress } from "./storage.js";

const MAX_CONSECUTIVE_UNSEEN = 1;
const MEMORIZED_REVIEW_INTERVAL = 20;

/**
 * Pick the next card to show.
 * @param {Array} cards - all cards from questions.json
 * @param {object} context - session context
 * @param {string|null} context.currentCardId - card to avoid picking again
 * @param {number} context.consecutiveUnseenCount - how many unseen cards shown in a row
 * @param {number} context.totalShownCount - total cards shown this session
 * @returns {object|null} selected card, or null if all memorized
 */
export function pickNextCard(cards, context = {}) {
  const {
    currentCardId = null,
    consecutiveUnseenCount = 0,
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

  // Rule 2: Alternate 1:1 — after 1 unseen, force a seen card
  if (consecutiveUnseenCount >= MAX_CONSECUTIVE_UNSEEN && seen.length > 0) {
    return pickOldest(seen, progress);
  }

  // Default: pick unseen, fall back to seen
  if (unseen.length > 0) {
    return pickUnseenCard(unseen);
  }

  if (seen.length > 0) {
    return pickOldest(seen, progress);
  }

  return null;
}

/**
 * Pick the oldest-seen card from a pool (most likely to be forgotten).
 * Deterministic: always picks the card with the oldest lastSeen timestamp.
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

export { MAX_CONSECUTIVE_UNSEEN, MEMORIZED_REVIEW_INTERVAL };
