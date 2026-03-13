/**
 * Quiz Engine - handles card selection logic.
 *
 * Strategy:
 * - Pick from "unseen" pool: random part → random unit → random card
 * - Mix in "seen" (not yet memorized) cards for review
 * - ~60% chance new card, ~40% chance review (if review cards exist)
 */

import { getAllProgress } from "./storage.js";

const REVIEW_PROBABILITY = 0.4;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick the next card to show.
 * @param {Array} cards - all cards from questions.json
 * @param {string|null} currentCardId - card to avoid picking again immediately
 * @returns {object|null} selected card, or null if all memorized
 */
export function pickNextCard(cards, currentCardId = null) {
  const progress = getAllProgress();

  const unseen = [];
  const seen = [];

  for (const card of cards) {
    if (card.id === currentCardId) continue;
    const p = progress[card.id];
    if (!p || p.status === "unseen") {
      unseen.push(card);
    } else if (p.status === "seen") {
      seen.push(card);
    }
    // skip "memorized" cards
  }

  if (unseen.length === 0 && seen.length === 0) {
    return null; // all memorized!
  }

  // Decide: new card or review?
  const doReview = seen.length > 0 && (unseen.length === 0 || Math.random() < REVIEW_PROBABILITY);

  if (doReview) {
    // Pick review card: prioritize oldest seen / lowest consecutive correct
    const sorted = seen.sort((a, b) => {
      const pa = progress[a.id] || {};
      const pb = progress[b.id] || {};
      // Lower consecutive correct first, then older lastSeen
      if (pa.consecutiveCorrect !== pb.consecutiveCorrect) {
        return pa.consecutiveCorrect - pb.consecutiveCorrect;
      }
      return (pa.lastSeen || 0) - (pb.lastSeen || 0);
    });
    // Pick from top 5 candidates randomly for variety
    const candidates = sorted.slice(0, Math.min(5, sorted.length));
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Pick new card: random part → random unit → random card
  const byPart = {};
  for (const card of unseen) {
    const key = card.part;
    if (!byPart[key]) byPart[key] = [];
    byPart[key].push(card);
  }

  const parts = Object.keys(byPart);
  const randomPart = parts[Math.floor(Math.random() * parts.length)];
  const partCards = byPart[randomPart];

  // Group by unit within the selected part
  const byUnit = {};
  for (const card of partCards) {
    const key = card.unit;
    if (!byUnit[key]) byUnit[key] = [];
    byUnit[key].push(card);
  }

  const units = Object.keys(byUnit);
  const randomUnit = units[Math.floor(Math.random() * units.length)];
  const unitCards = byUnit[randomUnit];

  return unitCards[Math.floor(Math.random() * unitCards.length)];
}
