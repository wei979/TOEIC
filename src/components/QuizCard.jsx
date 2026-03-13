import { useState } from "react";
import { CONSECUTIVE_TO_MEMORIZE } from "../lib/storage.js";

const PART_LABELS = {
  1: "Part 1 照片描述",
  2: "Part 2 應答問題",
  3: "Part 3 簡短對話",
  4: "Part 4 簡短獨白",
  5: "Part 5 單句填空",
  6: "Part 6 短文填空",
  7: "Part 7 閱讀理解",
};

export default function QuizCard({ card, cardProgress, onAnswer }) {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showPassageTranslation, setShowPassageTranslation] = useState(false);

  const questions = card.questions;
  const isGrouped = questions.length > 1;
  const allAnswered = questions.every((q) => selectedAnswers[q.number] != null);

  function handleSelect(qNum, optionIndex) {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qNum]: optionIndex }));
  }

  function handleSubmit() {
    if (!allAnswered) return;
    setSubmitted(true);

    const allCorrect = questions.every((q) => {
      const selected = selectedAnswers[q.number];
      const optionLetter = String.fromCharCode(65 + selected); // 0→A, 1→B, ...
      return optionLetter === q.answer;
    });

    onAnswer(allCorrect);
  }

  function getOptionLetter(idx) {
    return String.fromCharCode(65 + idx);
  }

  function isCorrectOption(q, idx) {
    return getOptionLetter(idx) === q.answer;
  }

  function renderPassage() {
    if (!card.passage) return null;
    return (
      <div className="passage-section">
        <div className="passage-text">{card.passage}</div>
        {card.passageTranslation && (
          <>
            <button
              className="btn-toggle"
              onClick={() => setShowPassageTranslation(!showPassageTranslation)}
            >
              {showPassageTranslation ? "隱藏中文翻譯" : "顯示中文翻譯"}
            </button>
            {showPassageTranslation && (
              <div className="passage-translation">{card.passageTranslation}</div>
            )}
          </>
        )}
        {card.vocabulary && card.vocabulary.length > 0 && showPassageTranslation && (
          <div className="vocabulary-section">
            <strong>重要單字：</strong>
            {card.vocabulary.map((v, i) => (
              <div key={i} className="vocab-item">{v}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderQuestion(q, idx) {
    const selected = selectedAnswers[q.number];

    return (
      <div key={q.number} className="question-block">
        {isGrouped && (
          <div className="question-number">Question {q.number}</div>
        )}
        {q.stem && <div className="question-stem">{q.stem}</div>}

        <div className="options-list">
          {q.options.map((opt, optIdx) => {
            let className = "option";
            if (submitted) {
              if (isCorrectOption(q, optIdx)) {
                className += " correct";
              } else if (selected === optIdx) {
                className += " wrong";
              }
            } else if (selected === optIdx) {
              className += " selected";
            }

            return (
              <button
                key={optIdx}
                className={className}
                onClick={() => handleSelect(q.number, optIdx)}
                disabled={submitted}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {submitted && q.translation && q.translation.length > 0 && (
          <div className="translation-block">
            {q.translation.map((t, i) => (
              <div key={i} className="translation-line">{t}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Image for Part 1
  function renderImage() {
    if (!card.image) return null;
    return (
      <div className="card-image">
        <img src={card.image} alt="Question photo" />
      </div>
    );
  }

  const isReview = cardProgress && cardProgress.status === "seen";
  const consecutiveInfo = cardProgress
    ? `${cardProgress.consecutiveCorrect}/${CONSECUTIVE_TO_MEMORIZE}`
    : `0/${CONSECUTIVE_TO_MEMORIZE}`;

  return (
    <div className="quiz-card">
      <div className="card-header">
        <span className="part-label">{PART_LABELS[card.part]}</span>
        <span className="unit-label">Unit {card.unit}</span>
        {isReview && <span className="review-badge">複習</span>}
        <span className="consecutive-badge" title="連續答對次數">
          {consecutiveInfo}
        </span>
      </div>

      {renderImage()}
      {renderPassage()}

      <div className="questions-container">
        {questions.map((q, idx) => renderQuestion(q, idx))}
      </div>

      {!submitted && (
        <button
          className="btn-submit"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          確認作答
        </button>
      )}

      {submitted && (
        <div className="post-submit">
          <button
            className="btn-toggle"
            onClick={() => setShowTranslation(!showTranslation)}
          >
            {showTranslation ? "隱藏翻譯" : "顯示翻譯"}
          </button>
        </div>
      )}
    </div>
  );
}
