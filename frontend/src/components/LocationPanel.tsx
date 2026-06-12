import { useEffect, useState } from 'react';
import { fetchCheckins, submitCheckin } from '../api';
import type { CheckInRecord, Location } from '../types';
import { BUSYNESS_LABELS, pinColor } from '../types';

interface Props {
  location: Location;
  onClose: () => void;
}

const BUSYNESS_COLORS = ['#22c55e', '#eab308', '#ef4444'];

export function LocationPanel({ location, onClose }: Props) {
  const [checkins, setCheckins] = useState<CheckInRecord[]>([]);
  const [loadingCheckins, setLoadingCheckins] = useState(true);

  // Form state
  const [selectedBusyness, setSelectedBusyness] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingCheckins(true);
    fetchCheckins(location.id)
      .then(setCheckins)
      .catch(() => setCheckins([]))
      .finally(() => setLoadingCheckins(false));
  }, [location.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedBusyness === null && !comment.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitCheckin({
        location_id: location.id,
        arrived_minutes_ago: 0,
        ...(selectedBusyness !== null && { busyness: selectedBusyness }),
        ...(comment.trim() && { comment: comment.trim() }),
      });
      setSubmitted(true);
      // reload checkins
      const fresh = await fetchCheckins(location.id);
      setCheckins(fresh);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const color = pinColor(location.display_wait_minutes);
  const colorHex = color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : '#ef4444';

  const commentsOnly = checkins.filter((c) => c.comment);
  const [showAllComments, setShowAllComments] = useState(false);
  const PREVIEW_COUNT = 3;
  const visibleComments = showAllComments ? commentsOnly : commentsOnly.slice(0, PREVIEW_COUNT);

  return (
    <div className="panel">
      <div className="panel-header">
        <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="panel-wait" style={{ color: colorHex }}>
          {location.display_wait_minutes}
          <span className="panel-wait-unit">min</span>
        </div>
      </div>

      <div className="panel-body">
        <h2 className="panel-name">{location.name}</h2>
        <p className="panel-address">{location.address}</p>

        <div className="panel-meta">
          {location.community_report_count > 0 && (
            <span className="meta-chip">
              {location.community_report_count} community report{location.community_report_count !== 1 ? 's' : ''}
            </span>
          )}
          {location.busyness_index !== null && (
            <span className="meta-chip" style={{ color: BUSYNESS_COLORS[Math.round(location.busyness_index)] }}>
              {BUSYNESS_LABELS[Math.round(location.busyness_index)]}
            </span>
          )}
        </div>

        {/* Community comments */}
        {loadingCheckins && (
          <div className="comments-loading">Loading reports…</div>
        )}

        {!loadingCheckins && commentsOnly.length === 0 && (
          <div className="comments-empty">
            No comments yet — be the first to leave a heads-up.
          </div>
        )}

        {!loadingCheckins && commentsOnly.length > 0 && (
          <div className="panel-comments">
            <h3>
              From the community
              <span className="comment-count">{commentsOnly.length}</span>
            </h3>
            <div className="comment-feed">
              {visibleComments.map((c) => (
                <div key={c.checkin_id} className="comment-card">
                  <div className="comment-header">
                    {c.busyness !== null && (
                      <span
                        className="comment-busyness"
                        style={{ color: BUSYNESS_COLORS[c.busyness] }}
                      >
                        {BUSYNESS_LABELS[c.busyness]}
                      </span>
                    )}
                    <span className="comment-time">{timeAgo(c.submitted_at)}</span>
                  </div>
                  <p className="comment-text">{c.comment}</p>
                </div>
              ))}
            </div>
            {commentsOnly.length > PREVIEW_COUNT && (
              <button
                className="comments-toggle"
                onClick={() => setShowAllComments((v) => !v)}
              >
                {showAllComments
                  ? 'Show less'
                  : `Show all ${commentsOnly.length} comments`}
              </button>
            )}
          </div>
        )}

        {/* Report form */}
        <div className="panel-report">
          <h3>Add a report</h3>
          {submitted ? (
            <div className="report-thanks">
              Thanks for helping your community 🙏
              <button className="btn-ghost small" onClick={() => { setSubmitted(false); setSelectedBusyness(null); setComment(''); }}>
                Add another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="form-label">How full is the ER right now?</p>
              <div className="busyness-options">
                {BUSYNESS_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`busyness-chip${selectedBusyness === i ? ' selected' : ''}`}
                    style={selectedBusyness === i ? { borderColor: BUSYNESS_COLORS[i], color: BUSYNESS_COLORS[i] } : {}}
                    onClick={() => setSelectedBusyness(selectedBusyness === i ? null : i)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="form-label" htmlFor="comment-box">
                Leave a heads-up <span className="optional">(optional)</span>
              </label>
              <textarea
                id="comment-box"
                className="comment-input"
                placeholder="e.g. Parking lot is full, bring ID..."
                maxLength={280}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <div className="char-count">{comment.length}/280</div>

              {submitError && <p className="form-error">{submitError}</p>}

              <button
                type="submit"
                className="btn-primary full-width"
                disabled={submitting || (selectedBusyness === null && !comment.trim())}
              >
                {submitting ? 'Submitting…' : 'Submit anonymously'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
