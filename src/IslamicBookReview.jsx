import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  Save,
  Search,
  BookOpen,
  CheckCircle,
  Clock,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { supabase } from "./supabase";

const DEFAULT_BATCH_ID = "c6b6585b-3590-4f06-bcf2-2eb57f029a48";

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
  answer_text: "",
  topic: "",
  difficulty: "Foundation",
  source_level: "Foundation",
};

const isBookBatch = (batch) =>
  String(batch?.notes || "")
    .toUpperCase()
    .includes("IMPORT_TYPE=ISLAMIC_BOOK_QA");

export default function IslamicBookReview() {
  const navigate = useNavigate();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);

  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [edit, setEdit] = useState(EMPTY_EDIT);

  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(profile?.role)) {
        navigate("/admin-login", { replace: true });
        return;
      }

      setAuthorized(true);

      const { data, error: batchError } = await supabase
        .from("question_import_batches")
        .select(
          "id, file_name, notes, extracted_questions, created_at"
        )
        .eq("id", DEFAULT_BATCH_ID)
        .single();

      if (batchError) throw batchError;

      if (!isBookBatch(data)) {
        throw new Error(
          "The selected batch is not marked as an Islamic book import."
        );
      }

      const extracted = data.extracted_questions;

      const originalItems = Array.isArray(extracted)
        ? extracted
        : Array.isArray(extracted?.items)
          ? extracted.items
          : [];

      setBatch(data);
      setItems(originalItems);
      setSelectedIndices([]);
      setSelectedIndex(null);
    } catch (err) {
      setError(
        err?.message || "Unable to load original book questions."
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const topics = useMemo(() => {
    return [
      ...new Set(
        items
          .map((item) => String(item.topic || "").trim())
          .filter(Boolean)
      ),
    ].sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .map((item, index) => ({
        ...item,
        _index: index,
      }))
      .filter((item) => {
        const searchableText = `
          ${item.question_text || ""}
          ${item.answer_text || ""}
          ${item.topic || ""}
        `.toLowerCase();

        const matchesSearch =
          !search.trim() ||
          searchableText.includes(search.trim().toLowerCase());

        const matchesTopic =
          topicFilter === "all" || item.topic === topicFilter;

        const matchesStatus =
          statusFilter === "all" ||
          (item.review_status || "pending") === statusFilter;

        return matchesSearch && matchesTopic && matchesStatus;
      });
  }, [items, search, topicFilter, statusFilter]);

  const reviewedCount = items.filter(
    (item) => item.review_status === "reviewed"
  ).length;

  const pendingCount = items.length - reviewedCount;

  const pendingFilteredItems = filteredItems.filter(
    (item) => item.review_status !== "reviewed"
  );

  const allVisiblePendingSelected =
    pendingFilteredItems.length > 0 &&
    pendingFilteredItems.every((item) =>
      selectedIndices.includes(item._index)
    );

  const openItem = (index) => {
    const item = items[index];

    if (!item) return;

    setSelectedIndex(index);

    setEdit({
      question_text: item.question_text || "",
      answer_text: item.answer_text || "",
      topic: item.topic || "",
      difficulty: item.difficulty || "Foundation",
      source_level: item.source_level || "Foundation",
    });

    setMessage("");
    setError("");
  };

  const toggleSelectItem = (index) => {
    setSelectedIndices((previous) =>
      previous.includes(index)
        ? previous.filter((value) => value !== index)
        : [...previous, index]
    );
  };

  const toggleSelectAll = () => {
    if (allVisiblePendingSelected) {
      setSelectedIndices((previous) =>
        previous.filter(
          (index) =>
            !pendingFilteredItems.some(
              (item) => item._index === index
            )
        )
      );
    } else {
      setSelectedIndices((previous) => [
        ...new Set([
          ...previous,
          ...pendingFilteredItems.map((item) => item._index),
        ]),
      ]);
    }
  };

  const clearSelection = () => {
    setSelectedIndices([]);
  };

  const saveItemsToDatabase = async (updatedItems) => {
    if (!batch) {
      throw new Error("Book import batch is not loaded.");
    }

    const oldData = batch.extracted_questions;

    const updatedJSON = Array.isArray(oldData)
      ? updatedItems
      : {
          ...(oldData || {}),
          items: updatedItems,
        };

    const { error: updateError } = await supabase
      .from("question_import_batches")
      .update({
        extracted_questions: updatedJSON,
      })
      .eq("id", batch.id);

    if (updateError) throw updateError;

    setItems(updatedItems);

    setBatch((previous) => ({
      ...previous,
      extracted_questions: updatedJSON,
    }));
  };

  const saveItem = async (markReviewed = false) => {
    if (!batch || selectedIndex === null) return;

    if (!edit.question_text.trim()) {
      setError("Question cannot be empty.");
      return;
    }

    if (!edit.answer_text.trim()) {
      setError("Original answer cannot be empty.");
      return;
    }

    if (!edit.topic.trim()) {
      setError("Please enter or assign a topic.");
      return;
    }

    if (!LEVELS.includes(edit.difficulty)) {
      setError("Select a valid difficulty.");
      return;
    }

    if (!LEVELS.includes(edit.source_level)) {
      setError("Select a valid source level.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const updatedItems = [...items];

      updatedItems[selectedIndex] = {
        ...updatedItems[selectedIndex],
        question_text: edit.question_text.trim(),
        answer_text: edit.answer_text.trim(),
        topic: edit.topic.trim(),
        difficulty: edit.difficulty,
        source_level: edit.source_level,
        review_status: markReviewed
          ? "reviewed"
          : updatedItems[selectedIndex].review_status || "pending",
        reviewed_at: markReviewed
          ? new Date().toISOString()
          : updatedItems[selectedIndex].reviewed_at || null,
        source_type: "original_book",
      };

      await saveItemsToDatabase(updatedItems);

      setMessage(
        markReviewed
          ? "Question saved and marked as reviewed."
          : "Question changes saved successfully."
      );

      if (markReviewed) {
        const nextPending = updatedItems.findIndex(
          (item, index) =>
            index !== selectedIndex &&
            item.review_status !== "reviewed"
        );

        if (nextPending !== -1) {
          openItem(nextPending);
        } else {
          setSelectedIndex(null);
        }
      }
    } catch (err) {
      setError(
        err?.message || "Unable to save question changes."
      );
    } finally {
      setSaving(false);
    }
  };

  const bulkMarkReviewed = async () => {
    if (!batch) return;

    const indexes = selectedIndices.filter(
      (index) =>
        items[index] &&
        items[index].review_status !== "reviewed"
    );

    if (!indexes.length) {
      setError("Select at least one pending question first.");
      return;
    }

    const confirmed = window.confirm(
      `Mark ${indexes.length} original Q&A pair(s) as reviewed?`
    );

    if (!confirmed) return;

    setBulkProcessing(true);
    setError("");
    setMessage("");

    try {
      const reviewedAt = new Date().toISOString();
      const selectedSet = new Set(indexes);

      const updatedItems = items.map((item, index) => {
        if (!selectedSet.has(index)) return item;

        return {
          ...item,
          review_status: "reviewed",
          reviewed_at: reviewedAt,
          source_type: "original_book",
        };
      });

      await saveItemsToDatabase(updatedItems);

      setSelectedIndices([]);

      setMessage(
        `${indexes.length} original Q&A pair(s) marked as reviewed successfully.`
      );
    } catch (err) {
      setError(
        err?.message || "Bulk review update failed."
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  if (loading) {
    return (
      <main style={styles.center}>
        <RefreshCw className="spin" size={25} />
        <p>Loading original Islamic book questions...</p>
      </main>
    );
  }

  if (!authorized) return null;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <button
          style={styles.backButton}
          onClick={() => navigate("/admin")}
          type="button"
        >
          <ArrowLeft size={18} />
          Back to Dashboard
        </button>

        <div style={styles.headerTitle}>
          <h1 style={styles.heading}>
            Islamic Book Review Dashboard
          </h1>

          <p style={styles.subheading}>
            Review original Sawal and Jawab extracted from the book.
          </p>
        </div>

        <button
          style={styles.refresh}
          onClick={loadData}
          disabled={loading || saving || bulkProcessing}
          type="button"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.stats}>
        <div style={styles.stat}>
          <BookOpen size={21} />
          <strong>{items.length}</strong>
          <span>Total Original Q&A</span>
        </div>

        <div style={styles.stat}>
          <Clock size={21} />
          <strong>{pendingCount}</strong>
          <span>Pending Review</span>
        </div>

        <div style={styles.stat}>
          <CheckCircle size={21} />
          <strong>{reviewedCount}</strong>
          <span>Reviewed</span>
        </div>
      </section>

      <section style={styles.batch}>
        <strong>Source PDF:</strong>{" "}
        {batch?.file_name || "Islamic book"}
        <br />
        <strong>Batch ID:</strong> {batch?.id}
      </section>

      <section style={styles.filters}>
        <div style={styles.searchBox}>
          <Search size={18} />

          <input
            style={styles.searchInput}
            placeholder="Search question, answer or topic..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <select
          style={styles.select}
          value={topicFilter}
          onChange={(event) => setTopicFilter(event.target.value)}
        >
          <option value="all">All Topics</option>

          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>

        <select
          style={styles.select}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </section>

      <div style={styles.layout}>
        <section style={styles.list}>
          <div style={styles.listHeader}>
            <div>
              <h2 style={styles.sectionHeading}>
                Original Questions ({filteredItems.length})
              </h2>

              <p style={styles.listSubheading}>
                Select questions to mark them reviewed.
              </p>
            </div>
          </div>

          <div style={styles.bulkToolbar}>
            <label style={styles.selectAllLabel}>
              <input
                type="checkbox"
                checked={allVisiblePendingSelected}
                onChange={toggleSelectAll}
                disabled={
                  pendingFilteredItems.length === 0 ||
                  bulkProcessing
                }
              />
              Select All Pending
            </label>

            <span style={styles.selectedCount}>
              {selectedIndices.length} selected
            </span>

            <button
              type="button"
              style={styles.bulkButton}
              onClick={bulkMarkReviewed}
              disabled={
                selectedIndices.length === 0 ||
                bulkProcessing ||
                saving
              }
            >
              <CheckSquare size={16} />
              {bulkProcessing
                ? "Processing..."
                : "Mark Selected Reviewed"}
            </button>

            <button
              type="button"
              style={styles.clearButton}
              onClick={clearSelection}
              disabled={
                selectedIndices.length === 0 || bulkProcessing
              }
            >
              <X size={15} />
              Clear
            </button>
          </div>

          {filteredItems.map((item) => (
            <div
              key={item._index}
              style={styles.questionRow}
            >
              <input
                type="checkbox"
                checked={selectedIndices.includes(item._index)}
                onChange={() => toggleSelectItem(item._index)}
                disabled={
                  item.review_status === "reviewed" ||
                  bulkProcessing
                }
                aria-label={`Select question ${item._index + 1}`}
              />

              <button
                type="button"
                onClick={() => openItem(item._index)}
                style={{
                  ...styles.questionCard,
                  ...(selectedIndex === item._index
                    ? styles.selectedCard
                    : {}),
                }}
              >
                <div style={styles.cardTop}>
                  <strong>Question #{item._index + 1}</strong>

                  <span
                    style={{
                      ...styles.status,
                      background:
                        item.review_status === "reviewed"
                          ? "#dcfce7"
                          : "#fef3c7",
                      color:
                        item.review_status === "reviewed"
                          ? "#166534"
                          : "#92400e",
                    }}
                  >
                    {item.review_status || "pending"}
                  </span>
                </div>

                <p style={styles.cardQuestion}>
                  {item.question_text || "Question text unavailable"}
                </p>

                <small style={styles.cardMeta}>
                  {item.topic || "Topic not assigned"} ·{" "}
                  {item.source_page
                    ? `Page ${item.source_page}`
                    : "Page not recorded"}
                </small>
              </button>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <p style={styles.emptyMessage}>
              No questions match your filters.
            </p>
          )}
        </section>

        <section style={styles.editor}>
          {selectedIndex === null ? (
            <div style={styles.empty}>
              <BookOpen size={38} />
              <h2>Select a question</h2>
              <p>
                Choose an original question from the list to review it.
              </p>
            </div>
          ) : (
            <>
              <div style={styles.editorHeader}>
                <h2 style={styles.sectionHeading}>
                  Edit Original Q&A #{selectedIndex + 1}
                </h2>

                <button
                  type="button"
                  style={styles.closeButton}
                  onClick={() => setSelectedIndex(null)}
                  aria-label="Close editor"
                >
                  <X size={18} />
                </button>
              </div>

              <label style={styles.label}>
                Original Question
              </label>

              <textarea
                style={styles.textarea}
                rows={5}
                value={edit.question_text}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    question_text: event.target.value,
                  })
                }
              />

              <label style={styles.label}>
                Original Answer
              </label>

              <textarea
                style={styles.textarea}
                rows={8}
                value={edit.answer_text}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    answer_text: event.target.value,
                  })
                }
              />

              <label style={styles.label}>Topic</label>

              <input
                style={styles.input}
                value={edit.topic}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    topic: event.target.value,
                  })
                }
                placeholder="Enter the actual book topic"
              />

              <label style={styles.label}>Difficulty</label>

              <select
                style={styles.input}
                value={edit.difficulty}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    difficulty: event.target.value,
                  })
                }
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>

              <label style={styles.label}>Source Level</label>

              <select
                style={styles.input}
                value={edit.source_level}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    source_level: event.target.value,
                  })
                }
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>

              <div style={styles.note}>
                <strong>Important:</strong> The original book answer is
                preserved. Saving or marking reviewed only updates the
                source review record. It does not publish a question
                to the final quiz bank or convert it into MCQ/True-False.
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.saveButton}
                  disabled={saving || bulkProcessing}
                  onClick={() => saveItem(false)}
                >
                  <Save size={17} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  style={styles.reviewButton}
                  disabled={saving || bulkProcessing}
                  onClick={() => saveItem(true)}
                >
                  <CheckCircle size={17} />
                  Save & Mark Reviewed
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "24px",
    background: "#f5f7fb",
    color: "#172033",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
  },
  center: {
    minHeight: "60vh",
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "22px",
  },
  headerTitle: {
    flex: "1 1 260px",
  },
  backButton: {
    display: "flex",
    gap: "7px",
    alignItems: "center",
    padding: "10px 14px",
    border: "1px solid #d8deea",
    borderRadius: "9px",
    background: "#fff",
    cursor: "pointer",
  },
  heading: {
    margin: 0,
    fontSize: "25px",
  },
  subheading: {
    margin: "6px 0 0",
    color: "#64748b",
  },
  refresh: {
    display: "flex",
    gap: "7px",
    alignItems: "center",
    padding: "10px 14px",
    border: 0,
    borderRadius: "9px",
    background: "#e0e7ff",
    color: "#3730a3",
    cursor: "pointer",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
    gap: "14px",
    marginBottom: "18px",
  },
  stat: {
    display: "grid",
    gap: "7px",
    padding: "18px",
    borderRadius: "12px",
    background: "#fff",
    boxShadow: "0 2px 8px #0f172a0a",
  },
  batch: {
    padding: "14px",
    borderRadius: "10px",
    background: "#fff",
    overflowWrap: "anywhere",
    lineHeight: 1.8,
    marginBottom: "18px",
  },
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "18px",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: "1 1 260px",
    background: "#fff",
    padding: "0 12px",
    border: "1px solid #dbe2ed",
    borderRadius: "9px",
  },
  searchInput: {
    width: "100%",
    padding: "12px 0",
    border: 0,
    outline: 0,
    minWidth: 0,
  },
  select: {
    minWidth: "160px",
    padding: "11px",
    border: "1px solid #dbe2ed",
    borderRadius: "9px",
    background: "#fff",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(280px,0.9fr) minmax(320px,1.3fr)",
    gap: "18px",
    alignItems: "start",
  },
  list: {
    padding: "16px",
    background: "#fff",
    borderRadius: "12px",
    maxHeight: "78vh",
    overflowY: "auto",
    minWidth: 0,
  },
  listHeader: {
    marginBottom: "12px",
  },
  sectionHeading: {
    margin: "0 0 8px",
    fontSize: "18px",
  },
  listSubheading: {
    margin: 0,
    color: "#64748b",
    fontSize: "12px",
  },
  bulkToolbar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "9px",
    padding: "12px",
    marginBottom: "14px",
    border: "1px solid #e2e8f0",
    borderRadius: "9px",
    background: "#f8fafc",
  },
  selectAllLabel: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  selectedCount: {
    color: "#475569",
    fontSize: "12px",
    marginLeft: "auto",
  },
  bulkButton: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "9px 11px",
    border: 0,
    borderRadius: "8px",
    background: "#15803d",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  clearButton: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "9px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#fff",
    color: "#475569",
    fontSize: "12px",
    cursor: "pointer",
  },
  questionRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    marginBottom: "9px",
  },
  questionCard: {
    display: "block",
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    padding: "13px",
    border: "1px solid #e2e8f0",
    borderRadius: "9px",
    background: "#fff",
    cursor: "pointer",
  },
  selectedCard: {
    border: "2px solid #2563eb",
    background: "#eff6ff",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "center",
  },
  status: {
    padding: "4px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  cardQuestion: {
    lineHeight: 1.5,
    margin: "10px 0",
    color: "#334155",
  },
  cardMeta: {
    color: "#64748b",
  },
  editor: {
    padding: "20px",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 2px 8px #0f172a0a",
    minWidth: 0,
  },
  editorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  closeButton: {
    display: "grid",
    placeItems: "center",
    width: "34px",
    height: "34px",
    border: "1px solid #dbe2ed",
    borderRadius: "8px",
    background: "#fff",
    cursor: "pointer",
  },
  empty: {
    minHeight: "300px",
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
    color: "#64748b",
    textAlign: "center",
  },
  emptyMessage: {
    color: "#64748b",
    textAlign: "center",
    padding: "20px",
  },
  label: {
    display: "block",
    margin: "15px 0 7px",
    fontWeight: 700,
    fontSize: "13px",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    resize: "vertical",
    font: "inherit",
    lineHeight: 1.6,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#fff",
  },
  note: {
    marginTop: "17px",
    padding: "12px",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: "8px",
    color: "#92400e",
    lineHeight: 1.5,
    fontSize: "13px",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    border: 0,
    borderRadius: "8px",
    background: "#1d4ed8",
    color: "#fff",
    cursor: "pointer",
  },
  reviewButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "12px 16px",
    border: 0,
    borderRadius: "8px",
    background: "#15803d",
    color: "#fff",
    cursor: "pointer",
  },
  error: {
    padding: "12px",
    marginBottom: "14px",
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: "8px",
  },
  success: {
    padding: "12px",
    marginBottom: "14px",
    background: "#dcfce7",
    color: "#166534",
    borderRadius: "8px",
  },
};