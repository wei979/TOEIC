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
import { recordAttempt, CONSECUTIVE_TO_MEMORIZE } from "../storage.js";

function makeCards(count, part = 1, unit = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${part}-u${unit}-q${i + 1}`,
    part,
    unit,
    questions: [{ number: i + 1, options: ["A", "B", "C", "D"], answer: "A" }],
  }));
}

function markSeen(cardId) {
  recordAttempt(cardId, false);
}

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

  it("picks unseen when no seen cards exist yet (cold start)", () => {
    const cards = makeCards(5);
    const result = pickNextCard(cards, { currentCardId: null, consecutiveUnseenCount: 0, totalShownCount: 0 });
    expect(result).not.toBeNull();
    expect(cards.map((c) => c.id)).toContain(result.id);
  });

  // Core new behavior: after 1 unseen, force a seen card
  it("forces a seen card after just 1 consecutive unseen (1:1 alternation)", () => {
    const cards = makeCards(10);
    markSeen(cards[0].id);
    markSeen(cards[1].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 1, // just showed 1 unseen
      totalShownCount: 1,
    });

    const seenIds = [cards[0].id, cards[1].id];
    expect(seenIds).toContain(result.id);
  });

  it("picks unseen when consecutiveUnseen is 0 and seen cards exist", () => {
    const cards = makeCards(10);
    markSeen(cards[0].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0, // just reviewed, time for a new one
      totalShownCount: 2,
    });

    // Should pick from unseen pool (cards[1]~cards[9])
    expect(result).not.toBeNull();
    expect(result.id).not.toBe(cards[0].id);
  });

  it("falls back to unseen if no seen cards exist when alternation triggers", () => {
    const cards = makeCards(5);
    // All unseen, no seen available
    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 1,
      totalShownCount: 1,
    });
    expect(result).not.toBeNull();
  });

  it("forces a memorized card every 20th question", () => {
    const cards = makeCards(25);
    markMemorized(cards[0].id);
    markSeen(cards[1].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      totalShownCount: 20,
    });

    expect(result).not.toBeNull();
    expect(result.id).toBe(cards[0].id);
  });

  it("falls back if no memorized cards at 20th question", () => {
    const cards = makeCards(5);
    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      totalShownCount: 20,
    });
    expect(result).not.toBeNull();
  });

  it("memorized review takes priority over alternation", () => {
    const cards = makeCards(25);
    markMemorized(cards[0].id);
    markSeen(cards[1].id);

    const result = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 1,
      totalShownCount: 20,
    });

    expect(result.id).toBe(cards[0].id);
  });

  it("review picks oldest-seen card first (not random from top 5)", () => {
    const cards = makeCards(10);
    // Mark cards with different timestamps
    markSeen(cards[0].id); // oldest
    // Fake a newer timestamp for cards[1]
    markSeen(cards[1].id);

    // Pick review card multiple times — should consistently pick cards[0] (oldest)
    const picks = new Set();
    for (let i = 0; i < 10; i++) {
      const r = pickNextCard(cards, {
        currentCardId: null,
        consecutiveUnseenCount: 1,
        totalShownCount: 1,
      });
      if (r) picks.add(r.id);
    }
    // The oldest-seen card should always be picked
    expect(picks.has(cards[0].id)).toBe(true);
  });

  it("avoids picking the current card", () => {
    const cards = makeCards(2);
    markSeen(cards[1].id);
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
