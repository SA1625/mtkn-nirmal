import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Filter,
  CheckSquare,
} from "lucide-react";
import { supabase } from "./supabase";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

const EMPTY_EDIT = {
  question_text: "",
  question_type: "true_false",
  section: "A",
  options: ["", "", "", ""],
  correct_answer: "True",
  topic: "",
  difficulty: "Foundation",
  explanation: "",
  eligible_levels: ["Foundation"],
};

export default function QuestionReview() {
  const navigate = useNavigate();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [drafts, setDrafts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");

  const [selectedDraft, setSelectedDraft] = useState(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [edit, setEdit] = useState(EMPTY_EDIT);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: batchData, error: batchError } = await supabase
        .from("question_import_batches")
        .select("id, file_name, status, created_at")
        .order("created_at", { ascending: false });

      if (batchError) throw batchError;

      const { data: draftData, error: draftError } = await supabase
        .from("question_import_drafts")
        .select("*")
        .order("created_at", { ascending: false });

      if (draftError) throw draftError;

      setBatches(batchData || []);
      setDrafts(draftData || []);
    } catch (err) {
      setError(err.message || "Unable to load question drafts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        !["admin", "super_admin"].includes(profile.role)
      ) {
        navigate("/admin-login", { replace: true });
        return;
      }

      setAuthorized(true);
      await loadData();
    };

    checkAdmin();
  }, [navigate]);

  const filteredDrafts = useMemo(() => {
    const term = search.toLowerCase();

    return drafts.filter((draft) => {
      const matchesStatus =
        statusFilter === "all" || draft.review_status === statusFilter;

      const matchesBatch =
        selectedBatch === "all" || draft.batch_id === selectedBatch;

      const matchesSearch =
        (draft.question_text || "").toLowerCase().includes(term) ||
        (draft.topic || "").toLowerCase().includes(term);

      return matchesStatus && matchesBatch && matchesSearch;
    });
  }, [drafts, statusFilter, selectedBatch, search]);

  const pendingFilteredDrafts = useMemo(
    () => filteredDrafts.filter((draft) => draft.review_status === "pending"),
    [filteredDrafts]
  );

  const selectedPendingIds = useMemo(
    () => selectedDraftIds.filter((id) => drafts.some((draft) => draft.id === id && draft.review_status === "pending")),
    [selectedDraftIds, drafts]
  );

  const allVisiblePendingSelected =
    pendingFilteredDrafts.length > 0 &&
    pendingFilteredDrafts.every((draft) => selectedDraftIds.includes(draft.id));

  const toggleDraftSelection = (id) => {
    setSelectedDraftIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const toggleSelectAllPending = () => {
    const visibleIds = pendingFilteredDrafts.map((draft) => draft.id);
    if (allVisiblePendingSelected) {
      setSelectedDraftIds((previous) => previous.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedDraftIds((previous) => [...new Set([...previous, ...visibleIds])]);
    }
  };

  const bulkApproveSelected = async () => {
    const ids = selectedPendingIds;
    if (!ids.length) {
      setError("Select at least one pending question first.");
      return;
    }
    if (!window.confirm(`Approve ${ids.length} selected question(s) and add them to the approved question bank? Review the content before confirming.`)) return;

    setBulkProcessing(true);
    setBulkProgress(`Approving 0 of ${ids.length}...`);
    setError("");
    setMessage("");
    let approved = 0;
    const failures = [];

    try {
      // Small concurrent groups keep the bulk action responsive without flooding Supabase.
      for (let start = 0; start < ids.length; start += 5) {
        const group = ids.slice(start, start + 5);
        const results = await Promise.all(group.map(async (id) => {
          const { error: rpcError } = await supabase.rpc("approve_question_draft", {
            p_draft_id: id,
          });
          return { id, error: rpcError };
        }));

        for (const result of results) {
          if (result.error) failures.push({ id: result.id, message: result.error.message });
          else approved += 1;
        }
        setBulkProgress(`Processed ${Math.min(start + group.length, ids.length)} of ${ids.length}...`);
      }

      setSelectedDraftIds([]);
      setMessage(`${approved} question(s) approved.${failures.length ? ` ${failures.length} failed; refresh and review those drafts again.` : ""}`);
      if (failures.length) {
        setError(failures.slice(0, 3).map((item) => item.message).join(" · "));
      }
      await loadData();
    } catch (err) {
      setError(err.message || "Bulk approval failed.");
    } finally {
      setBulkProcessing(false);
      setBulkProgress("");
    }
  };

  const bulkRejectSelected = async () => {
    const ids = selectedPendingIds;
    if (!ids.length) {
      setError("Select at least one pending question first.");
      return;
    }
    if (!window.confirm(`Reject ${ids.length} selected pending question(s)? This will not delete them.`)) return;

    setBulkProcessing(true);
    setError("");
    setMessage("");
    try {
      const { error: rejectError } = await supabase
        .from("question_import_drafts")
        .update({ review_status: "rejected", reviewed_at: new Date().toISOString() })
        .in("id", ids)
        .eq("review_status", "pending");
      if (rejectError) throw rejectError;

      setSelectedDraftIds([]);
      setMessage(`${ids.length} question(s) rejected. They remain in the review history.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Bulk rejection failed.");
    } finally {
      setBulkProcessing(false);
    }
  };

  const counts = useMemo(
    () => ({
      total: drafts.length,
      pending: drafts.filter((d) => d.review_status === "pending").length,
      approved: drafts.filter((d) => d.review_status === "approved").length,
      rejected: drafts.filter((d) => d.review_status === "rejected").length,
    }),
    [drafts]
  );

  const openDraft = (draft) => {
    setSelectedDraft(draft);

    setEdit({
      question_text: draft.question_text || "",
      question_type: draft.question_type || "true_false",
      section: draft.section || "A",
      options: Array.isArray(draft.options)
        ? [...draft.options, "", "", "", ""].slice(0, 4)
        : ["", "", "", ""],
      correct_answer: draft.correct_answer || "True",
      topic: draft.topic || "",
      difficulty: draft.difficulty || "Foundation",
      explanation: draft.explanation || "",
      eligible_levels:
        Array.isArray(draft.eligible_levels) &&
        draft.eligible_levels.length > 0
          ? [...draft.eligible_levels]
          : [draft.difficulty || "Foundation"],
    });

    setMessage("");
    setError("");
  };

  const closeDraft = () => {
    setSelectedDraft(null);
    setEdit(EMPTY_EDIT);
  };

  const changeQuestionType = (type) => {
    setEdit((previous) => ({
      ...previous,
      question_type: type,
      section: type === "true_false" ? "A" : "B",
      options: ["", "", "", ""],
      correct_answer: type === "true_false" ? "True" : "",
    }));
  };

  const updateOption = (index, value) => {
    setEdit((previous) => {
      const options = [...previous.options];
      options[index] = value;

      return { ...previous, options };
    });
  };

  const toggleLevel = (level) => {
    setEdit((previous) => {
      const exists = previous.eligible_levels.includes(level);

      return {
        ...previous,
        eligible_levels: exists
          ? previous.eligible_levels.filter((item) => item !== level)
          : [...previous.eligible_levels, level],
      };
    });
  };

  const validateEdit = () => {
    if (!edit.question_text.trim()) {
      throw new Error("Question text is required.");
    }

    if (!edit.topic.trim()) {
      throw new Error("Topic is required.");
    }

    if (!LEVELS.includes(edit.difficulty)) {
      throw new Error("Select a valid difficulty.");
    }

    if (edit.eligible_levels.length === 0) {
      throw new Error("Select at least one eligible examination level.");
    }

    if (edit.question_type === "mcq") {
      const options = edit.options.map((option) => option.trim());

      if (options.some((option) => !option)) {
        throw new Error("Enter all four MCQ options.");
      }

      if (new Set(options.map((option) => option.toLowerCase())).size !== 4) {
        throw new Error("All four MCQ options must be different.");
      }

      if (!options.includes(edit.correct_answer.trim())) {
        throw new Error("Correct answer must match one of the options.");
      }
    } else if (!["True", "False"].includes(edit.correct_answer)) {
      throw new Error("Select True or False as the correct answer.");
    }
  };

  const saveDraft = async () => {
    if (!selectedDraft) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      validateEdit();

      const payload = {
        question_text: edit.question_text.trim(),
        question_type: edit.question_type,
        section: edit.question_type === "true_false" ? "A" : "B",
        options:
          edit.question_type === "mcq"
            ? edit.options.map((option) => option.trim())
            : null,
        correct_answer: edit.correct_answer.trim(),
        topic: edit.topic.trim(),
        difficulty: edit.difficulty,
        explanation: edit.explanation.trim() || null,
        eligible_levels: edit.eligible_levels,
      };

      const { error: updateError } = await supabase
        .from("question_import_drafts")
        .update(payload)
        .eq("id", selectedDraft.id)
        .eq("review_status", "pending");

      if (updateError) throw updateError;

      setMessage("Question changes saved successfully.");

      await loadData();

      setSelectedDraft((previous) =>
        previous ? { ...previous, ...payload } : null
      );
    } catch (err) {
      setError(err.message || "Unable to save question.");
    } finally {
      setSaving(false);
    }
  };

  const approveDraft = async () => {
    if (!selectedDraft) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      validateEdit();

      const payload = {
        question_text: edit.question_text.trim(),
        question_type: edit.question_type,
        section: edit.question_type === "true_false" ? "A" : "B",
        options:
          edit.question_type === "mcq"
            ? edit.options.map((option) => option.trim())
            : null,
        correct_answer: edit.correct_answer.trim(),
        topic: edit.topic.trim(),
        difficulty: edit.difficulty,
        explanation: edit.explanation.trim() || null,
        eligible_levels: edit.eligible_levels,
      };

      const { error: updateError } = await supabase
        .from("question_import_drafts")
        .update(payload)
        .eq("id", selectedDraft.id)
        .eq("review_status", "pending");

      if (updateError) throw updateError;

      const { error: approveError } = await supabase.rpc(
        "approve_question_draft",
        { p_draft_id: selectedDraft.id }
      );

      if (approveError) throw approveError;

      setMessage("Question approved and added to the question bank.");

      closeDraft();
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to approve question.");
    } finally {
      setSaving(false);
    }
  };

  const rejectDraft = async () => {
    if (!selectedDraft) return;

    if (!window.confirm("Reject this question draft?")) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { error: rejectError } = await supabase
        .from("question_import_drafts")
        .update({
          review_status: "rejected",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedDraft.id)
        .eq("review_status", "pending");

      if (rejectError) throw rejectError;

      setMessage("Question rejected.");

      closeDraft();
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to reject question.");
    } finally {
      setSaving(false);
    }
  };

  const batchName = (batchId) =>
    batches.find((batch) => batch.id === batchId)?.file_name ||
    "Imported PDF";

  if (!authorized) {
    return (
      <main style={styles.page}>
        <p>Checking administrator access...</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <button style={styles.back} onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Back to Admin Dashboard
        </button>

        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>ADMINISTRATION</span>
            <h1 style={styles.heading}>AI QUESTION REVIEW</h1>
            <p style={styles.subheading}>
              Review, correct, classify and approve imported questions.
            </p>
          </div>

          <button
            style={styles.secondaryButton}
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={17} /> Refresh
          </button>
        </header>

        <div style={styles.stats}>
          <div style={styles.stat}>
            <span>Total Drafts</span>
            <strong>{counts.total}</strong>
          </div>
          <div style={styles.stat}>
            <span>Pending Review</span>
            <strong>{counts.pending}</strong>
          </div>
          <div style={styles.stat}>
            <span>Approved</span>
            <strong>{counts.approved}</strong>
          </div>
          <div style={styles.stat}>
            <span>Rejected</span>
            <strong>{counts.rejected}</strong>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {message && <div style={styles.success}>{message}</div>}

        <section style={styles.filters}>
          <div style={styles.filterTitle}>
            <Filter size={18} /> FILTER QUESTIONS
          </div>

          <input
            style={styles.input}
            placeholder="Search question or topic..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            style={styles.input}
            value={selectedBatch}
            onChange={(event) => setSelectedBatch(event.target.value)}
          >
            <option value="all">All imported PDFs</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.file_name}
              </option>
            ))}
          </select>

          <select
            style={styles.input}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All Statuses</option>
          </select>
        </section>

        {selectedDraft ? (
          <section style={styles.editor}>
            <div style={styles.editorHeader}>
              <div>
                <span style={styles.eyebrow}>QUESTION EDITOR</span>
                <h2 style={styles.editorTitle}>Review Question</h2>
              </div>

              <button style={styles.secondaryButton} onClick={closeDraft}>
                <XCircle size={17} /> Close
              </button>
            </div>

            <p style={styles.source}>
              Source: {batchName(selectedDraft.batch_id)}
              {selectedDraft.source_page
                ? ` · Page ${selectedDraft.source_page}`
                : ""}
              {selectedDraft.source_question
                ? ` · Source question: ${selectedDraft.source_question}`
                : ""}
            </p>

            <label style={styles.label}>Question Type</label>
            <select
              style={styles.input}
              value={edit.question_type}
              onChange={(event) => changeQuestionType(event.target.value)}
              disabled={selectedDraft.review_status !== "pending"}
            >
              <option value="true_false">True / False</option>
              <option value="mcq">Multiple Choice</option>
            </select>

            <label style={styles.label}>Question Text</label>
            <textarea
              style={styles.textarea}
              rows={4}
              value={edit.question_text}
              onChange={(event) =>
                setEdit({ ...edit, question_text: event.target.value })
              }
              disabled={selectedDraft.review_status !== "pending"}
            />

            {edit.question_type === "mcq" && (
              <>
                <label style={styles.label}>Four Options</label>

                {edit.options.map((option, index) => (
                  <input
                    key={index}
                    style={styles.input}
                    value={option}
                    placeholder={`Option ${index + 1}`}
                    onChange={(event) =>
                      updateOption(index, event.target.value)
                    }
                    disabled={selectedDraft.review_status !== "pending"}
                  />
                ))}
              </>
            )}

            <label style={styles.label}>Correct Answer</label>

            {edit.question_type === "true_false" ? (
              <select
                style={styles.input}
                value={edit.correct_answer}
                onChange={(event) =>
                  setEdit({ ...edit, correct_answer: event.target.value })
                }
                disabled={selectedDraft.review_status !== "pending"}
              >
                <option value="True">True</option>
                <option value="False">False</option>
              </select>
            ) : (
              <select
                style={styles.input}
                value={edit.correct_answer}
                onChange={(event) =>
                  setEdit({ ...edit, correct_answer: event.target.value })
                }
                disabled={selectedDraft.review_status !== "pending"}
              >
                <option value="">Select correct option</option>
                {edit.options.map((option, index) => (
                  <option key={index} value={option} disabled={!option.trim()}>
                    {option.trim() || `Option ${index + 1}`}
                  </option>
                ))}
              </select>
            )}

            <label style={styles.label}>Topic</label>
            <input
              style={styles.input}
              value={edit.topic}
              onChange={(event) =>
                setEdit({ ...edit, topic: event.target.value })
              }
              disabled={selectedDraft.review_status !== "pending"}
            />

            <label style={styles.label}>Primary Difficulty</label>
            <select
              style={styles.input}
              value={edit.difficulty}
              onChange={(event) =>
                setEdit({ ...edit, difficulty: event.target.value })
              }
              disabled={selectedDraft.review_status !== "pending"}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <label style={styles.label}>Eligible Examination Levels</label>
            <p style={styles.help}>
              Select every level where this question is suitable. A question
              can be eligible for more than one level.
            </p>

            <div style={styles.levelGrid}>
              {LEVELS.map((level) => (
                <label key={level} style={styles.levelOption}>
                  <input
                    type="checkbox"
                    checked={edit.eligible_levels.includes(level)}
                    onChange={() => toggleLevel(level)}
                    disabled={selectedDraft.review_status !== "pending"}
                  />
                  {level}
                </label>
              ))}
            </div>

            <label style={styles.label}>Explanation</label>
            <textarea
              style={styles.textarea}
              rows={3}
              value={edit.explanation}
              onChange={(event) =>
                setEdit({ ...edit, explanation: event.target.value })
              }
              disabled={selectedDraft.review_status !== "pending"}
            />

            {selectedDraft.review_status === "pending" ? (
              <div style={styles.actions}>
                <button
                  style={styles.secondaryButton}
                  onClick={saveDraft}
                  disabled={saving}
                >
                  <Save size={17} /> Save Changes
                </button>

                <button
                  style={styles.rejectButton}
                  onClick={rejectDraft}
                  disabled={saving}
                >
                  <XCircle size={17} /> Reject
                </button>

                <button
                  style={styles.approveButton}
                  onClick={approveDraft}
                  disabled={saving}
                >
                  <CheckCircle size={17} /> Approve Question
                </button>
              </div>
            ) : (
              <p style={styles.help}>
                This question has already been {selectedDraft.review_status}.
              </p>
            )}
          </section>
        ) : (
          <section style={styles.listSection}>
            <h2 style={styles.sectionHeading}>
              <BookOpen size={20} /> QUESTION DRAFTS
            </h2>

            {statusFilter !== "approved" && statusFilter !== "rejected" && (
              <div style={styles.bulkToolbar}>
                <label style={styles.selectAllLabel}>
                  <input
                    type="checkbox"
                    checked={allVisiblePendingSelected}
                    onChange={toggleSelectAllPending}
                    disabled={bulkProcessing || pendingFilteredDrafts.length === 0}
                  />
                  <CheckSquare size={17} /> Select All Pending ({pendingFilteredDrafts.length} visible)
                </label>
                <span style={styles.selectedCount}>{selectedPendingIds.length} selected</span>
                <div style={styles.bulkActions}>
                  <button style={styles.approveButton} onClick={bulkApproveSelected} disabled={bulkProcessing || selectedPendingIds.length === 0}>
                    <CheckCircle size={16} /> {bulkProcessing ? (bulkProgress || "Processing...") : "Approve Selected"}
                  </button>
                  <button style={styles.rejectButton} onClick={bulkRejectSelected} disabled={bulkProcessing || selectedPendingIds.length === 0}>
                    <XCircle size={16} /> Reject Selected
                  </button>
                  <button style={styles.secondaryButton} onClick={() => setSelectedDraftIds([])} disabled={bulkProcessing || selectedDraftIds.length === 0}>
                    Clear Selection
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p>Loading question drafts...</p>
            ) : filteredDrafts.length === 0 ? (
              <div style={styles.empty}>
                No questions found for the selected filters.
              </div>
            ) : (
              <div style={styles.list}>
                {filteredDrafts.map((draft, index) => (
                  <article key={draft.id} style={styles.questionCard}>
                    <div style={styles.cardTop}>
                      <div style={styles.cardTopLeft}>
                        {draft.review_status === "pending" && (
                          <input
                            type="checkbox"
                            aria-label={`Select question ${index + 1}`}
                            checked={selectedDraftIds.includes(draft.id)}
                            onChange={() => toggleDraftSelection(draft.id)}
                            disabled={bulkProcessing}
                          />
                        )}
                        <span style={styles.number}>
                          QUESTION {index + 1}
                        </span>
                      </div>
                      <span
                        style={{
                          ...styles.status,
                          ...(draft.review_status === "approved"
                            ? styles.approvedStatus
                            : draft.review_status === "rejected"
                              ? styles.rejectedStatus
                              : styles.pendingStatus),
                        }}
                      >
                        {(draft.review_status || "pending").toUpperCase()}
                      </span>
                    </div>

                    <h3 style={styles.questionText}>{draft.question_text}</h3>

                    <p style={styles.meta}>
                      {draft.question_type === "mcq"
                        ? "MULTIPLE CHOICE"
                        : "TRUE / FALSE"}
                      {" · "}
                      {draft.difficulty}
                      {" · "}
                      {draft.topic || "Unclassified topic"}
                    </p>

                    <p style={styles.meta}>
                      Eligible levels:{" "}
                      {(draft.eligible_levels || [draft.difficulty]).join(
                        ", "
                      )}
                    </p>

                    <p style={styles.source}>
                      {batchName(draft.batch_id)}
                      {draft.source_page
                        ? ` · Page ${draft.source_page}`
                        : ""}
                    </p>

                    <button
                      style={styles.secondaryButton}
                      onClick={() => openDraft(draft)}
                    >
                      {draft.review_status === "pending"
                        ? "Review Question"
                        : "View Question"}
                    </button>
                  </article>
                ))}
              </div>
            )}

            <div style={styles.pagination}>
              <span>
                Showing {filteredDrafts.length} of {drafts.length} drafts
              </span>
              <div>
                <button
                  style={styles.iconButton}
                  disabled
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  style={styles.iconButton}
                  disabled
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7f5",
    padding: "24px 16px 60px",
    color: "#17251d",
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
  },
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    border: 0,
    background: "transparent",
    padding: "8px 0",
    cursor: "pointer",
    color: "#315b43",
    fontWeight: 600,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    margin: "28px 0",
  },
  eyebrow: {
    color: "#a27b35",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "1.5px",
  },
  heading: {
    fontSize: "clamp(24px, 4vw, 34px)",
    margin: "6px 0",
    color: "#17452e",
  },
  subheading: {
    color: "#69766d",
    margin: 0,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: "12px",
    marginBottom: "22px",
  },
  stat: {
    background: "#fff",
    padding: "18px",
    borderRadius: "12px",
    border: "1px solid #e2e9e3",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  filters: {
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "12px",
    padding: "18px",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
    marginBottom: "22px",
  },
  filterTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#315b43",
    fontWeight: 800,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #d6dfd7",
    borderRadius: "8px",
    background: "#fff",
    marginBottom: "10px",
    fontSize: "14px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #d6dfd7",
    borderRadius: "8px",
    background: "#fff",
    marginBottom: "10px",
    resize: "vertical",
    font: "inherit",
  },
  label: {
    display: "block",
    fontWeight: 700,
    fontSize: "14px",
    margin: "12px 0 7px",
  },
  listSection: {
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "12px",
    padding: "20px",
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    color: "#17452e",
  },
  list: {
    display: "grid",
    gap: "12px",
  },
  questionCard: {
    border: "1px solid #e1e8e1",
    borderRadius: "10px",
    padding: "16px",
  },
  bulkToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    padding: "14px",
    margin: "14px 0 18px",
    background: "#f6faf6",
    border: "1px solid #dfe9df",
    borderRadius: "10px",
  },
  selectAllLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 700,
    color: "#315b43",
    cursor: "pointer",
  },
  selectedCount: { color: "#69766d", fontSize: "13px", fontWeight: 700 },
  bulkActions: { display: "flex", gap: "8px", flexWrap: "wrap" },
  cardTopLeft: { display: "flex", alignItems: "center", gap: "10px" },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
  },
  number: {
    color: "#8a958d",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1px",
  },
  status: {
    fontSize: "10px",
    fontWeight: 800,
    borderRadius: "20px",
    padding: "5px 9px",
  },
  pendingStatus: {
    background: "#fff4d8",
    color: "#805d15",
  },
  approvedStatus: {
    background: "#e0f3e5",
    color: "#23613a",
  },
  rejectedStatus: {
    background: "#fbe5e5",
    color: "#9a3030",
  },
  questionText: {
    fontSize: "16px",
    lineHeight: 1.5,
    margin: "12px 0",
  },
  meta: {
    fontSize: "12px",
    color: "#66746a",
    lineHeight: 1.5,
  },
  source: {
    fontSize: "12px",
    color: "#8a958d",
    overflowWrap: "anywhere",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    background: "#fff",
    border: "1px solid #cbd8ce",
    color: "#315b43",
    padding: "10px 14px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 700,
  },
  editor: {
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "12px",
    padding: "22px",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  editorTitle: {
    color: "#17452e",
    margin: "5px 0 12px",
  },
  help: {
    color: "#718077",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  levelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "10px",
    margin: "10px 0 18px",
  },
  levelOption: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#f5f8f5",
    border: "1px solid #e0e8e0",
    borderRadius: "8px",
    padding: "10px",
    fontSize: "13px",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "20px",
  },
  approveButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: "#174d32",
    color: "#fff",
    border: 0,
    borderRadius: "8px",
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  rejectButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: "#fff",
    color: "#a13232",
    border: "1px solid #e2baba",
    borderRadius: "8px",
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  error: {
    background: "#fff0f0",
    color: "#9c2929",
    border: "1px solid #f0d0d0",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "14px",
  },
  success: {
    background: "#edf7ef",
    color: "#23613a",
    border: "1px solid #cfe5d3",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "14px",
  },
  empty: {
    padding: "35px 10px",
    textAlign: "center",
    color: "#7b887e",
  },
  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    color: "#718077",
    fontSize: "13px",
    marginTop: "20px",
  },
  iconButton: {
    border: "1px solid #d6dfd7",
    background: "#fff",
    borderRadius: "7px",
    padding: "7px",
    marginLeft: "5px",
  },
};