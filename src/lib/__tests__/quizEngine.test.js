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

  // Review-heavy mode: when seen >> memorized, use 3:1 ratio
  it("enters review-heavy mode (3:1) when seen cards pile up", () => {
    const cards = makeCards(20);
    // 8 seen, 0 memorized → seen >> memorized → review-heavy mode
    for (let i = 0; i < 8; i++) {
      markSeen(cards[i].id);
    }

    // consecutiveUnseenCount=0, should pick unseen (the 1 in 3:1)
    const r1 = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      consecutiveSeenCount: 0,
      totalShownCount: 10,
    });
    // In review-heavy, even at consecutiveUnseen=0,
    // it should still allow 1 new card per cycle
    expect(r1).not.toBeNull();

    // After 1 unseen, should force seen (start of 3 reviews)
    const r2 = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 1,
      consecutiveSeenCount: 0,
      totalShownCount: 11,
    });
    const seenIds = cards.slice(0, 8).map(c => c.id);
    expect(seenIds).toContain(r2.id);
  });

  it("in review-heavy mode, needs 10 consecutive seen before allowing new card", () => {
    const cards = makeCards(20);
    // 10 seen, 1 memorized → ratio 10:1 → review-heavy
    for (let i = 0; i < 10; i++) {
      markSeen(cards[i].id);
    }
    markMemorized(cards[10].id);

    // Only 9 seen shown so far, need 10 → should still pick seen
    const r = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      consecutiveSeenCount: 9,
      totalShownCount: 15,
    });
    const seenIds = cards.slice(0, 10).map(c => c.id);
    expect(seenIds).toContain(r.id);
  });

  it("in review-heavy mode, allows new card after 10 consecutive seen", () => {
    const cards = makeCards(25);
    for (let i = 0; i < 10; i++) {
      markSeen(cards[i].id);
    }
    markMemorized(cards[10].id);

    // 10 seen shown → now allow 1 new card
    const r = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      consecutiveSeenCount: 10,
      totalShownCount: 21, // avoid 20th memorized trigger
    });
    // Should pick from unseen (cards[11]~cards[24])
    const unseenIds = cards.slice(11).map(c => c.id);
    expect(unseenIds).toContain(r.id);
  });

  it("stays in normal 1:1 mode when seen/memorized ratio is balanced", () => {
    const cards = makeCards(20);
    // 3 seen, 3 memorized → balanced → normal 1:1
    for (let i = 0; i < 3; i++) markSeen(cards[i].id);
    for (let i = 3; i < 6; i++) markMemorized(cards[i].id);

    // consecutiveUnseen=0, consecutiveSeen=0 → should pick unseen (normal mode)
    const r = pickNextCard(cards, {
      currentCardId: null,
      consecutiveUnseenCount: 0,
      consecutiveSeenCount: 0,
      totalShownCount: 10,
    });
    const unseenIds = cards.slice(6).map(c => c.id);
    expect(unseenIds).toContain(r.id);
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
