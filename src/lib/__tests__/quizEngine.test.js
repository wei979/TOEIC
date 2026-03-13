import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const mockStorage = {};
const localStorageMock = {
  getItem: vi.fn((key) => mockStorage[key] || null),
  setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key) => { delete mockStorage[key]; }),
};
vi.stubGlobal("localStorage", localStorageMock);

import { pickNextCard } from "../quizEngine.js";
import { recordAttempt, resetAllProgress, CONSECUTIVE_TO_MEMORIZE } from "../storage.js";

// Helper: create mock cards
function makeCards(count, part = 1, unit = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${part}-u${unit}-q${i + 1}`,
    part,
    unit,
    questions: [{ number: i + 1, options: ["A", "B", "C", "D"], answer: "A" }],
  }));
}

// Helper: mark a card as "seen" (answered once incorrectly)
function markSeen(cardId) {
  recordAttempt(cardId, false);
}

// Helper: mark a card as "memorized" (answer correctly CONSECUTIVE_TO_MEMORIZE times)
function markMemorized(cardId) {
  for (let i = 0; i < CONSECUTIVE_TO_MEMORIZE; i++) {
    recordAttempt(cardId, true);
  }
}

describe("pickNextCard — scheduling rules", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  it("returns null when all cards are memorized", () => {
    const cards = makeCards(3);
    cards.forEach((c) => markMemorized(c.id));
    const result = pickNextCard(cards, { currentCardId: null, consecutiveUnseenCount: 0, totalShownCount: 0 });
    expect(result).toBeNull();
  });

  it("picks an unseen card when available and no scheduling constraint", () => {
    const cards = makeCards(5);
    const result = pickNextCard(cards, { currentCardId: null, consecutiveUnseenCount: 0, totalShownCount: 1 });
    expect(result).not.toBeNull();
    // Should be one of the cards
    expect(cards.map((c) => c.id)).toContain(result.id);
  });

  it("forces a 'seen' card after 5 consecutive unseen cards", () => {
    const cards = makeCards(10);
    // Mark cards 0-2 as "seen"
    markSeen(cards[0].id);
    markSeen(cards[1].id);
    markSeen(cards[2].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 5, // already shown 5 unseen in a row
      totalShownCount: 5,
    });

    expect(result).not.toBeNull();
    // Should pick one of the seen cards (cards[0], cards[1], cards[2])
    const seenIds = [cards[0].id, cards[1].id, cards[2].id];
    expect(seenIds).toContain(result.id);
  });

  it("falls back to unseen if no 'seen' cards exist when consecutive limit hit", () => {
    const cards = makeCards(5);
    // All cards are unseen, no seen cards available
    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 5,
      totalShownCount: 5,
    });
    // Should still return a card (fallback to unseen)
    expect(result).not.toBeNull();
  });

  it("forces a 'memorized' card every 20th question", () => {
    const cards = makeCards(25);
    // Mark card 0 as memorized
    markMemorized(cards[0].id);
    // Mark some as seen so there are options
    markSeen(cards[1].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      totalShownCount: 20, // 20th card → trigger memorized review
    });

    expect(result).not.toBeNull();
    expect(result.id).toBe(cards[0].id); // only memorized card
  });

  it("falls back if no memorized cards exist at 20th question", () => {
    const cards = makeCards(5);
    // No memorized cards, should fall back
    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      totalShownCount: 20,
    });
    expect(result).not.toBeNull();
  });

  it("memorized review takes priority over consecutive-unseen rule", () => {
    const cards = makeCards(25);
    markMemorized(cards[0].id);
    markSeen(cards[1].id);

    // Both rules trigger: totalShown=20 AND consecutiveUnseen=5
    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 5,
      totalShownCount: 20,
    });

    // Memorized review should take priority
    expect(result.id).toBe(cards[0].id);
  });

  it("avoids picking the current card", () => {
    const cards = makeCards(2);
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      const r = pickNextCard(cards, {
        currentCardId: cards[0].id,
        consecutiveUnseenCount: 0,
        totalShownCount: i,
      });
      if (r) results.add(r.id);
    }
    expect(results.has(cards[0].id)).toBe(false);
  });
});
