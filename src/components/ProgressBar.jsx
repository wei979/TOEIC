export default function ProgressBar({ stats }) {
  const { total, unseen, seen, memorized, percent } = stats;

  return (
    <div className="progress-bar-container">
      <div className="progress-main">
        <span className="progress-text">
          已背誦 <strong>{memorized}</strong> / {total} [{percent}%]
        </span>
        <div className="progress-track">
          <div
            className="progress-fill memorized"
            style={{ width: `${(memorized / total) * 100}%` }}
          />
          <div
            className="progress-fill seen"
            style={{ width: `${(seen / total) * 100}%` }}
          />
        </div>
      </div>
      <div className="progress-detail">
        <span className="tag tag-unseen">未出現 {unseen}</span>
        <span className="tag tag-seen">練習中 {seen}</span>
        <span className="tag tag-memorized">已背誦 {memorized}</span>
      </div>
    </div>
  );
}
