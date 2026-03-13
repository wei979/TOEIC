import { useState, useEffect, useCallback } from "react";
import QuizCard from "./components/QuizCard.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import { computeStats, recordAttempt, getCardProgress, resetAllProgress } from "./lib/storage.js";
import { pickNextCard } from "./lib/quizEngine.js";

export default function App() {
  const [cards, setCards] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [currentCard, setCurrentCard] = useState(null);
  const [cardProgress, setCardProgress] = useState(null);
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null); // null | "correct" | "wrong"
  const [loading, setLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // key to force QuizCard remount on next card
  const [cardKey, setCardKey] = useState(0);

  useEffect(() => {
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data) => {
        setCards(data.cards);
        setMetadata(data.metadata);
        setStats(computeStats(data.cards));
        setLoading(false);
      });
  }, []);

  const nextCard = useCallback(() => {
    if (cards.length === 0) return;
    const card = pickNextCard(cards, currentCard?.id);
    setCurrentCard(card);
    setCardProgress(card ? getCardProgress(card.id) : null);
    setResult(null);
    setCardKey((k) => k + 1);
  }, [cards, currentCard?.id]);

  // Pick first card after load
  useEffect(() => {
    if (!loading && cards.length > 0 && !currentCard) {
      nextCard();
    }
  }, [loading, cards, currentCard, nextCard]);

  function handleAnswer(allCorrect) {
    const updated = recordAttempt(currentCard.id, allCorrect);
    setCardProgress(updated);
    setResult(allCorrect ? "correct" : "wrong");
    setStats(computeStats(cards));
  }

  function handleReset() {
    resetAllProgress();
    setStats(computeStats(cards));
    setShowResetConfirm(false);
    setCurrentCard(null);
    setResult(null);
    setTimeout(() => nextCard(), 50);
  }

  if (loading) {
    return (
      <div className="app-loading">
        <h2>載入題庫中...</h2>
      </div>
    );
  }

  const allMemorized = currentCard === null && stats?.memorized === stats?.total;

  return (
    <div className="app">
      <header className="app-header">
        <h1>TOEIC 題庫背誦系統</h1>
        {stats && <ProgressBar stats={stats} />}
      </header>

      <main className="app-main">
        {allMemorized ? (
          <div className="all-done">
            <h2>全部背誦完成！</h2>
            <p>恭喜你已背誦全部 {stats.total} 張卡片！</p>
          </div>
        ) : currentCard ? (
          <>
            <QuizCard
              key={cardKey}
              card={currentCard}
              cardProgress={cardProgress}
              onAnswer={handleAnswer}
            />
            {result && (
              <div className={`result-banner ${result}`}>
                <span>{result === "correct" ? "答對了！" : "答錯了，再加油！"}</span>
                {cardProgress?.status === "memorized" && (
                  <span className="memorized-msg"> 已記住此卡片！</span>
                )}
                <button className="btn-next" onClick={nextCard}>
                  下一題
                </button>
              </div>
            )}
          </>
        ) : null}
      </main>

      <footer className="app-footer">
        {!showResetConfirm ? (
          <button className="btn-reset" onClick={() => setShowResetConfirm(true)}>
            重置進度
          </button>
        ) : (
          <div className="reset-confirm">
            <span>確定要重置所有進度嗎？</span>
            <button className="btn-danger" onClick={handleReset}>確定重置</button>
            <button className="btn-cancel" onClick={() => setShowResetConfirm(false)}>取消</button>
          </div>
        )}
      </footer>
    </div>
  );
}
