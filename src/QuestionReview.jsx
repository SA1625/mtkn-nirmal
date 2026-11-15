
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./QuestionReview.css";

export default function QuestionReview() {
  const [drafts, setDrafts] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);

  const loadDrafts = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("question_import_drafts")
      .select("*")
      .eq("review_status", filter)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setDrafts([]);
    } else {
      setDrafts(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDrafts();
  }, [filter]);

  const approveDraft = async (id) => {
    if (!window.confirm("Approve this question and add it to Question Bank?")) {
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("approve_question_draft", {
      p_draft_id: id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Question approved and added to Question Bank.");
      await loadDrafts();
    }

    setSaving(false);
  };

  const rejectDraft = async (id) => {
    if (!window.confirm("Are you sure you want to reject this question?")) {
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc("reject_question_draft", {
      p_draft_id: id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Question rejected.");
      await loadDrafts();
    }

    setSaving(false);
  };

  const openEditor = (draft) => {
    setEditing({
      ...draft,
      optionsText: Array.isArray(draft.options)
        ? draft.options.join("\n")
        : "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;

    const options =
      editing.question_type === "mcq"
        ? editing.optionsText
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean)
        : null;

    if (
      !editing.question_text.trim() ||
      !editing.correct_answer.trim() ||
      !editing.topic.trim()
    ) {
      setMessage("Question, correct answer and topic are required.");
      return;
    }

    if (
      editing.question_type === "mcq" &&
      (options.length !== 4 || !options.includes(editing.correct_answer.trim()))
    ) {
      setMessage("MCQ must have 4 options and the correct answer must match one option.");
      return;
    }

    if (
      editing.question_type === "true_false" &&
      !["True", "False"].includes(editing.correct_answer.trim())
    ) {
      setMessage("True/False answer must be True or False.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("question_import_drafts")
      .update({
        question_text: editing.question_text.trim(),
        options,
        correct_answer: editing.correct_answer.trim(),
        topic: editing.topic.trim(),
        difficulty: editing.difficulty,
        explanation: editing.explanation?.trim() || null,
        source_question: editing.source_question?.trim() || null,
      })
      .eq("id", editing.id)
      .eq("review_status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Draft updated successfully.");
      setEditing(null);
      await loadDrafts();
    }

    setSaving(false);
  };

  return (
    <main className="review-page">
      <header className="review-header">
        <div>
          <h1>AI QUESTION REVIEW</h1>
          <p>Review, edit and approve AI-generated quiz questions.</p>
        </div>
        <button className="review-refresh" onClick={loadDrafts}>
          Refresh
        </button>
      </header>

      <nav className="review-filters">
        {["pending", "approved", "rejected"].map((item) => (
          <button
            key={item}
            className={filter === item ? "active" : ""}
            onClick={() => {
              setEditing(null);
              setFilter(item);
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </nav>

      {message && <div className="review-message">{message}</div>}

      {loading ? (
        <p className="review-empty">Loading questions...</p>
      ) : drafts.length === 0 ? (
        <p className="review-empty">No {filter} questions found.</p>
      ) : (
        <section className="review-list">
          {drafts.map((draft, index) => (
            <article className="review-card" key={draft.id}>
              <div className="review-card-top">
                <span>QUESTION {index + 1}</span>
                <span>{draft.section === "A" ? "TRUE / FALSE" : "MCQ"}</span>
                <span>{draft.difficulty}</span>
              </div>

              <h3>{draft.question_text}</h3>

              {draft.question_type === "mcq" && (
                <ol className="review-options" type="A">
                  {(draft.options || []).map((option, i) => (
                    <li
                      key={i}
                      className={
                        option === draft.correct_answer ? "correct-option" : ""
                      }
                    >
                      {option}
                      {option === draft.correct_answer && " — Correct answer"}
                    </li>
                  ))}
                </ol>
              )}

              {draft.question_type === "true_false" && (
                <p className="review-answer">
                  Correct answer: <strong>{draft.correct_answer}</strong>
                </p>
              )}

              <div className="review-details">
                <p><strong>Topic:</strong> {draft.topic}</p>
                <p><strong>Source page:</strong> {draft.source_page || "Not identified"}</p>
                {draft.explanation && (
                  <p><strong>Explanation:</strong> {draft.explanation}</p>
                )}
                {draft.source_question && (
                  <div className="source-box">
                    <strong>ORIGINAL SOURCE Q&A</strong>
                    <p>{draft.source_question}</p>
                  </div>
                )}
              </div>

              <div className="review-actions">
                {draft.review_status === "pending" && (
                  <>
                    <button
                      className="edit-draft"
                      onClick={() => openEditor(draft)}
                      disabled={saving}
                    >
                      Edit
                    </button>
                    <button
                      className="approve-draft"
                      onClick={() => approveDraft(draft.id)}
                      disabled={saving}
                    >
                      Approve
                    </button>
                    <button
                      className="reject-draft"
                      onClick={() => rejectDraft(draft.id)}
                      disabled={saving}
                    >
                      Reject
                    </button>
                  </>
                )}
                {draft.review_status !== "pending" && (
                  <span className="review-status">
                    {draft.review_status.toUpperCase()}
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {editing && (
        <div className="review-modal-backdrop">
          <div className="review-modal">
            <h2>EDIT QUESTION</h2>

            <label>Question</label>
            <textarea
              rows="3"
              value={editing.question_text}
              onChange={(e) =>
                setEditing({ ...editing, question_text: e.target.value })
              }
            />

            {editing.question_type === "mcq" && (
              <>
                <label>Four options (one option per line)</label>
                <textarea
                  rows="5"
                  value={editing.optionsText}
                  onChange={(e) =>
                    setEditing({ ...editing, optionsText: e.target.value })
                  }
                />
              </>
            )}

            <label>Correct answer</label>
            {editing.question_type === "true_false" ? (
              <select
                value={editing.correct_answer}
                onChange={(e) =>
                  setEditing({ ...editing, correct_answer: e.target.value })
                }
              >
                <option value="True">True</option>
                <option value="False">False</option>
              </select>
            ) : (
              <input
                value={editing.correct_answer}
                onChange={(e) =>
                  setEditing({ ...editing, correct_answer: e.target.value })
                }
              />
            )}

            <label>Topic</label>
            <input
              value={editing.topic}
              onChange={(e) =>
                setEditing({ ...editing, topic: e.target.value })
              }
            />

            <label>Difficulty</label>
            <select
              value={editing.difficulty}
              onChange={(e) =>
                setEditing({ ...editing, difficulty: e.target.value })
              }
            >
              {["Foundation", "Beginner", "Intermediate", "Moderate", "Advanced", "Expert"].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>

            <label>Explanation</label>
            <textarea
              rows="3"
              value={editing.explanation || ""}
              onChange={(e) =>
                setEditing({ ...editing, explanation: e.target.value })
              }
            />

            <label>Original source Q&A</label>
            <textarea
              rows="4"
              value={editing.source_question || ""}
              onChange={(e) =>
                setEditing({ ...editing, source_question: e.target.value })
              }
            />

            <div className="review-modal-actions">
              <button
                className="edit-draft"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="approve-draft"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
