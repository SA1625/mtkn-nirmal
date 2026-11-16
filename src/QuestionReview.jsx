
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Save,
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
  options: ["", "", "", ""],
  correct_answer: "True",
  topic: "",
  difficulty: "Foundation",
  source_level: "",
  explanation: "",
  eligible_levels: ["Foundation"],
};

const isIslamicBookBatch = (batch) =>
  String(batch?.notes || "")
    .toUpperCase()
    .includes("IMPORT_TYPE=ISLAMIC_BOOK_QA");

export default function QuestionReview() {
  const navigate = useNavigate();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  const [drafts, setDrafts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");

  const [selectedDraft, setSelectedDraft] = useState(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);

  const [edit, setEdit] = useState(EMPTY_EDIT);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // -------------------------------------------------------
  // LOAD DATABASE DATA
  // -------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [batchResult, draftResult] = await Promise.all([

        supabase
          .from("question_import_batches")
          .select("id, file_name, status, created_at, notes")
          .order("created_at", { ascending: false }),

        supabase
          .from("question_import_drafts")
          .select("*")
          .order("created_at", { ascending: false }),

      ]);

      if (batchResult.error) throw batchResult.error;
      if (draftResult.error) throw draftResult.error;

      setBatches(batchResult.data || []);
      setDrafts(draftResult.data || []);

    } catch (err) {
      setError(err.message || "Unable to load question drafts.");
    } finally {
      setLoading(false);
    }

  }, []);

  // -------------------------------------------------------
  // ADMIN AUTHORIZATION
  // -------------------------------------------------------

  useEffect(() => {
    let active = true;

    const checkAdmin = async () => {
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

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError) throw profileError;

        if (
          !profile ||
          !["admin", "super_admin"].includes(profile.role)
        ) {
          navigate("/admin-login", { replace: true });
          return;
        }

        if (active) {
          setAuthorized(true);
          await loadData();
        }

      } catch (err) {
        if (active) {
          setError(
            err.message || "Unable to verify administrator access."
          );
        }
      }
    };

    checkAdmin();

    return () => {
      active = false;
    };

  }, [navigate, loadData]);

  // -------------------------------------------------------
  // FILTERED QUESTIONS
  // -------------------------------------------------------

  const filteredDrafts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return drafts.filter((draft) => {

      const matchesStatus =
        statusFilter === "all" ||
        draft.review_status === statusFilter;

      const matchesBatch =
        selectedBatch === "all" ||
        draft.batch_id === selectedBatch;

      const matchesSearch =
        String(draft.question_text || "")
          .toLowerCase()
          .includes(term) ||

        String(draft.topic || "")
          .toLowerCase()
          .includes(term) ||

        String(draft.source_level || "")
          .toLowerCase()
          .includes(term);

      return matchesStatus && matchesBatch && matchesSearch;

    });

  }, [drafts, statusFilter, selectedBatch, search]);

  const pendingFilteredDrafts = useMemo(
    () =>
      filteredDrafts.filter(
        (draft) => draft.review_status === "pending"
      ),
    [filteredDrafts]
  );

  const selectedPendingDrafts = useMemo(
    () =>
      drafts.filter(
        (draft) =>
          selectedDraftIds.includes(draft.id) &&
          draft.review_status === "pending"
      ),
    [drafts, selectedDraftIds]
  );

  const allVisiblePendingSelected =
    pendingFilteredDrafts.length > 0 &&
    pendingFilteredDrafts.every(
      (draft) => selectedDraftIds.includes(draft.id)
    );

  const counts = useMemo(
    () => ({
      total: drafts.length,
      pending: drafts.filter(
        (item) => item.review_status === "pending"
      ).length,
      approved: drafts.filter(
        (item) => item.review_status === "approved"
      ).length,
      rejected: drafts.filter(
        (item) => item.review_status === "rejected"
      ).length,
    }),
    [drafts]
  );

  // -------------------------------------------------------
  // BATCH HELPERS
  // -------------------------------------------------------

  const batchFor = (batchId) =>
    batches.find((batch) => batch.id === batchId);

  const batchName = (batchId) =>
    batchFor(batchId)?.file_name || "Imported PDF";

  const isIslamicDraft = (draft) =>
    isIslamicBookBatch(batchFor(draft?.batch_id));

  // -------------------------------------------------------
  // SELECT ALL
  // -------------------------------------------------------

  const toggleDraftSelection = (id) => {
    setSelectedDraftIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const toggleSelectAllPending = () => {
    const visibleIds = pendingFilteredDrafts.map(
      (draft) => draft.id
    );

    if (allVisiblePendingSelected) {
      setSelectedDraftIds((previous) =>
        previous.filter((id) => !visibleIds.includes(id))
      );
    } else {
      setSelectedDraftIds((previous) =>
        [...new Set([...previous, ...visibleIds])]
      );
    }
  };

  // -------------------------------------------------------
  // OPEN QUESTION EDITOR
  // -------------------------------------------------------

  const openDraft = (draft) => {
    setSelectedDraft(draft);

    setEdit({

      question_text: draft.question_text || "",

      question_type: draft.question_type || "true_false",

      options: Array.isArray(draft.options)
        ? [...draft.options, "", "", "", ""].slice(0, 4)
        : ["", "", "", ""],

      correct_answer: draft.correct_answer || "True",

      topic: draft.topic || "",

      difficulty: draft.difficulty || "Foundation",

      source_level: draft.source_level || "",

      explanation: draft.explanation || "",

      eligible_levels:
        Array.isArray(draft.eligible_levels) &&
        draft.eligible_levels.length
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

  // -------------------------------------------------------
  // QUESTION TYPE
  // -------------------------------------------------------

  const changeQuestionType = (type) => {
    setEdit((previous) => ({
      ...previous,
      question_type: type,
      options: ["", "", "", ""],
      correct_answer:
        type === "true_false" ? "True" : "",
    }));
  };

  const updateOption = (index, value) => {
    setEdit((previous) => {
      const options = [...previous.options];
      options[index] = value;

      return { ...previous, options };
    });
  };

  // -------------------------------------------------------
  // ELIGIBLE LEVELS
  // -------------------------------------------------------

  const toggleEligibleLevel = (level) => {
    setEdit((previous) => {
      const included =
        previous.eligible_levels.includes(level);

      return {
        ...previous,

        eligible_levels: included
          ? previous.eligible_levels.filter(
              (item) => item !== level
            )
          : [...previous.eligible_levels, level],
      };
    });
  };

  // -------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------

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

    if (
      edit.source_level &&
      !LEVELS.includes(edit.source_level)
    ) {
      throw new Error("Select a valid original source level.");
    }

    if (
      isIslamicDraft(selectedDraft) &&
      !LEVELS.includes(edit.source_level)
    ) {
      throw new Error(
        "Select the original source level for this Islamic book question."
      );
    }

    if (edit.eligible_levels.length === 0) {
      throw new Error(
        "Select at least one eligible examination level."
      );
    }

    if (edit.question_type === "mcq") {

      const options = edit.options.map(
        (option) => option.trim()
      );

      if (options.some((option) => !option)) {
        throw new Error("Enter all four MCQ options.");
      }

      if (
        new Set(
          options.map((option) => option.toLowerCase())
        ).size !== 4
      ) {
        throw new Error(
          "All four MCQ options must be different."
        );
      }

      if (!options.includes(edit.correct_answer.trim())) {
        throw new Error(
          "Correct answer must match one of the options."
        );
      }

    } else if (
      !["True", "False"].includes(edit.correct_answer)
    ) {

      throw new Error(
        "Select True or False as the correct answer."
      );

    }
  };

  const buildPayload = () => ({

    question_text: edit.question_text.trim(),

    question_type: edit.question_type,

    section:
      edit.question_type === "true_false" ? "A" : "B",

    options:
      edit.question_type === "mcq"
        ? edit.options.map((option) => option.trim())
        : null,

    correct_answer: edit.correct_answer.trim(),

    topic: edit.topic.trim(),

    difficulty: edit.difficulty,

    source_level: edit.source_level || null,

    explanation:
      edit.explanation.trim() || null,

    eligible_levels: edit.eligible_levels,

  });

  // -------------------------------------------------------
  // SAVE QUESTION
  // -------------------------------------------------------

  const saveDraft = async () => {
    if (!selectedDraft) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      validateEdit();

      const payload = buildPayload();

      const { error: updateError } = await supabase
        .from("question_import_drafts")
        .update(payload)
        .eq("id", selectedDraft.id)
        .eq("review_status", "pending");

      if (updateError) throw updateError;

      setSelectedDraft((previous) =>
        previous ? { ...previous, ...payload } : null
      );

      setMessage(
        "Question changes and source classification saved."
      );

      await loadData();

    } catch (err) {
      setError(err.message || "Unable to save question.");
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------
  // APPROVE ONE QUESTION
  // -------------------------------------------------------

  const approveDraft = async () => {
    if (!selectedDraft) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      validateEdit();

      const payload = buildPayload();

      const { error: updateError } = await supabase
        .from("question_import_drafts")
        .update(payload)
        .eq("id", selectedDraft.id)
        .eq("review_status", "pending");

      if (updateError) throw updateError;

      const { error: approveError } =
        await supabase.rpc(
          "approve_question_draft",
          {
            p_draft_id: selectedDraft.id,
          }
        );

      if (approveError) throw approveError;

      closeDraft();

      setMessage(
        "Question approved and added to the question bank."
      );

      await loadData();

    } catch (err) {
      setError(
        err.message || "Unable to approve question."
      );
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------
  // REJECT ONE QUESTION
  // -------------------------------------------------------

  const rejectDraft = async () => {
    if (!selectedDraft) return;

    if (
      !window.confirm(
        "Reject this question draft? It will remain in review history."
      )
    ) {
      return;
    }

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

      closeDraft();

      setMessage(
        "Question rejected. It remains in review history."
      );

      await loadData();

    } catch (err) {
      setError(
        err.message || "Unable to reject question."
      );
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------
  // BULK APPROVE
  // -------------------------------------------------------

  const bulkApproveSelected = async () => {
    const rows = selectedPendingDrafts;

    if (!rows.length) {
      setError(
        "Select at least one pending question first."
      );
      return;
    }

    const unclassified = rows.filter(
      (draft) =>
        isIslamicDraft(draft) &&
        !LEVELS.includes(draft.source_level)
    );

    if (unclassified.length) {
      setError(
        `${unclassified.length} selected Islamic book question(s) have no Original Source Level. Open each question, assign its level, save, then approve.`
      );
      return;
    }

    if (
      !window.confirm(
        `Approve ${rows.length} selected question(s)? Please ensure each question and answer has been reviewed.`
      )
    ) {
      return;
    }

    setBulkProcessing(true);

    setBulkProgress(
      `Approving 0 of ${rows.length}...`
    );

    setError("");
    setMessage("");

    let approved = 0;
    const failures = [];

    try {
      const ids = rows.map((item) => item.id);

      for (
        let start = 0;
        start < ids.length;
        start += 5
      ) {

        const group = ids.slice(start, start + 5);

        const results = await Promise.all(
          group.map(async (id) => {

            const { error: rpcError } =
              await supabase.rpc(
                "approve_question_draft",
                {
                  p_draft_id: id,
                }
              );

            return { id, error: rpcError };

          })
        );

        for (const result of results) {

          if (result.error) {
            failures.push(result.error.message);
          } else {
            approved += 1;
          }

        }

        setBulkProgress(
          `Processed ${Math.min(
            start + group.length,
            ids.length
          )} of ${ids.length}...`
        );

      }

      setSelectedDraftIds([]);

      setMessage(
        `${approved} question(s) approved.${
          failures.length
            ? ` ${failures.length} failed.`
            : ""
        }`
      );

      if (failures.length) {
        setError(failures.slice(0, 3).join(" · "));
      }

      await loadData();

    } catch (err) {
      setError(
        err.message || "Bulk approval failed."
      );
    } finally {
      setBulkProcessing(false);
      setBulkProgress("");
    }
  };

  // -------------------------------------------------------
  // BULK REJECT
  // -------------------------------------------------------

  const bulkRejectSelected = async () => {
    const ids = selectedPendingDrafts.map(
      (draft) => draft.id
    );

    if (!ids.length) {
      setError(
        "Select at least one pending question first."
      );
      return;
    }

    if (
      !window.confirm(
        `Reject ${ids.length} selected pending question(s)? They will not be deleted.`
      )
    ) {
      return;
    }

    setBulkProcessing(true);
    setError("");
    setMessage("");

    try {
      const { error: rejectError } = await supabase
        .from("question_import_drafts")
        .update({
          review_status: "rejected",
          reviewed_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("review_status", "pending");

      if (rejectError) throw rejectError;

      setSelectedDraftIds([]);

      setMessage(
        `${ids.length} question(s) rejected. They remain in review history.`
      );

      await loadData();

    } catch (err) {
      setError(
        err.message || "Bulk rejection failed."
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------

  if (!authorized) {
    return (
      <main style={styles.page}>
        <p>Checking administrator access...</p>

        {error && (
          <p style={styles.error}>{error}</p>
        )}
      </main>
    );
  }

  return (
    <main style={styles.page}>

      <div style={styles.container}>

        <button
          style={styles.backButton}
          onClick={() => navigate("/admin")}
        >
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>


        <header style={styles.header}>

          <div>
            <span style={styles.eyebrow}>
              ADMINISTRATION
            </span>

            <h1 style={styles.heading}>
              QUESTION REVIEW & CLASSIFICATION
            </h1>

            <p style={styles.subheading}>
              Review the original question, answer, type and source level before approval.
            </p>
          </div>

          <button
            style={styles.secondaryButton}
            onClick={loadData}
            disabled={loading || bulkProcessing}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

        </header>


        <div style={styles.stats}>

          {[
            ["Total Drafts", counts.total],
            ["Pending Review", counts.pending],
            ["Approved", counts.approved],
            ["Rejected", counts.rejected],
          ].map(([label, value]) => (

            <div style={styles.stat} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>

          ))}

        </div>


        {error && (
          <div style={styles.error}>{error}</div>
        )}

        {message && (
          <div style={styles.success}>{message}</div>
        )}


        <section style={styles.filters}>

          <div style={styles.filterTitle}>
            <Filter size={18} />
            FILTER QUESTIONS
          </div>

          <input
            style={styles.input}
            placeholder="Search question, topic or level..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            style={styles.input}
            value={selectedBatch}
            onChange={(event) =>
              setSelectedBatch(event.target.value)
            }
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
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All Statuses</option>
          </select>

        </section>


        {selectedDraft ? (

          // ===============================================
          // QUESTION EDITOR
          // ===============================================

          <section style={styles.editor}>

            <div style={styles.editorHeader}>

              <div>
                <span style={styles.eyebrow}>
                  QUESTION EDITOR
                </span>

                <h2 style={styles.editorTitle}>
                  Review Question
                </h2>
              </div>

              <button
                style={styles.secondaryButton}
                onClick={closeDraft}
              >
                <XCircle size={17} />
                Close
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


            {isIslamicDraft(selectedDraft) && (

              <div style={styles.notice}>
                Islamic book source level is mandatory.
                Each source level must contain exactly
                29 True/False and 49 MCQ originals before paper generation.
              </div>

            )}


            <label style={styles.label}>
              Question Type
            </label>

            <select
              style={styles.input}
              value={edit.question_type}
              onChange={(event) =>
                changeQuestionType(event.target.value)
              }
              disabled={
                selectedDraft.review_status !== "pending"
              }
            >
              <option value="true_false">
                True / False
              </option>

              <option value="mcq">
                Multiple Choice
              </option>
            </select>


            <label style={styles.label}>
              Original Question Text
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
              disabled={
                selectedDraft.review_status !== "pending"
              }
            />


            {edit.question_type === "mcq" && (

              <>
                <label style={styles.label}>
                  Four MCQ Options
                </label>

                {edit.options.map((option, index) => (

                  <input
                    key={index}
                    style={styles.input}
                    value={option}
                    placeholder={`Option ${index + 1}`}
                    onChange={(event) =>
                      updateOption(index, event.target.value)
                    }
                    disabled={
                      selectedDraft.review_status !== "pending"
                    }
                  />

                ))}

              </>

            )}


            <label style={styles.label}>
              Correct Answer
            </label>


            {edit.question_type === "true_false" ? (

              <select
                style={styles.input}
                value={edit.correct_answer}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    correct_answer: event.target.value,
                  })
                }
                disabled={
                  selectedDraft.review_status !== "pending"
                }
              >
                <option value="True">True</option>
                <option value="False">False</option>
              </select>

            ) : (

              <select
                style={styles.input}
                value={edit.correct_answer}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    correct_answer: event.target.value,
                  })
                }
                disabled={
                  selectedDraft.review_status !== "pending"
                }
              >
                <option value="">
                  Select correct option
                </option>

                {edit.options.map((option, index) => (

                  <option
                    key={index}
                    value={option}
                    disabled={!option.trim()}
                  >
                    {option.trim() || `Option ${index + 1}`}
                  </option>

                ))}

              </select>

            )}


            <label style={styles.label}>
              Topic
            </label>

            <input
              style={styles.input}
              value={edit.topic}
              onChange={(event) =>
                setEdit({
                  ...edit,
                  topic: event.target.value,
                })
              }
              disabled={
                selectedDraft.review_status !== "pending"
              }
            />


            <label style={styles.label}>
              Original Source Level (required for Islamic book)
            </label>

            <select
              style={styles.input}
              value={edit.source_level}
              onChange={(event) =>
                setEdit({
                  ...edit,
                  source_level: event.target.value,
                })
              }
              disabled={
                selectedDraft.review_status !== "pending"
              }
            >
              <option value="">
                Select original source level
              </option>

              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <p style={styles.help}>
              This is the level to which the question belongs
              in the original 468-question bank.
              The generator uses this field for the 78 + 22 allocation.
            </p>


            <label style={styles.label}>
              Question Difficulty
            </label>

            <select
              style={styles.input}
              value={edit.difficulty}
              onChange={(event) =>
                setEdit({
                  ...edit,
                  difficulty: event.target.value,
                })
              }
              disabled={
                selectedDraft.review_status !== "pending"
              }
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>


            <label style={styles.label}>
              Eligible Examination Levels (additional metadata)
            </label>

            <div style={styles.levelGrid}>

              {LEVELS.map((level) => (

                <label
                  key={level}
                  style={styles.levelOption}
                >
                  <input
                    type="checkbox"
                    checked={edit.eligible_levels.includes(level)}
                    onChange={() => toggleEligibleLevel(level)}
                    disabled={
                      selectedDraft.review_status !== "pending"
                    }
                  />

                  {level}
                </label>

              ))}

            </div>


            <label style={styles.label}>
              Explanation / Source Answer
            </label>

            <textarea
              style={styles.textarea}
              rows={4}
              value={edit.explanation}
              onChange={(event) =>
                setEdit({
                  ...edit,
                  explanation: event.target.value,
                })
              }
              disabled={
                selectedDraft.review_status !== "pending"
              }
            />


            {selectedDraft.review_status === "pending" ? (

              <div style={styles.actions}>

                <button
                  style={styles.secondaryButton}
                  onClick={saveDraft}
                  disabled={saving}
                >
                  <Save size={17} />
                  Save Changes
                </button>

                <button
                  style={styles.rejectButton}
                  onClick={rejectDraft}
                  disabled={saving}
                >
                  <XCircle size={17} />
                  Reject
                </button>

                <button
                  style={styles.approveButton}
                  onClick={approveDraft}
                  disabled={saving}
                >
                  <CheckCircle size={17} />
                  Approve Question
                </button>

              </div>

            ) : (

              <p style={styles.help}>
                This question has already been {selectedDraft.review_status}.
              </p>

            )}

          </section>

        ) : (

          // ===============================================
          // QUESTION LIST
          // ===============================================

          <section style={styles.listSection}>

            <h2 style={styles.sectionHeading}>
              <BookOpen size={20} />
              QUESTION DRAFTS
            </h2>


            {statusFilter !== "approved" &&
              statusFilter !== "rejected" && (

                <div style={styles.bulkToolbar}>

                  <label style={styles.selectAllLabel}>

                    <input
                      type="checkbox"
                      checked={allVisiblePendingSelected}
                      onChange={toggleSelectAllPending}
                      disabled={
                        bulkProcessing ||
                        pendingFilteredDrafts.length === 0
                      }
                    />

                    <CheckSquare size={17} />

                    Select All Pending (
                    {pendingFilteredDrafts.length} visible)

                  </label>

                  <span style={styles.selectedCount}>
                    {selectedPendingDrafts.length} selected
                  </span>

                  <div style={styles.actions}>

                    <button
                      style={styles.approveButton}
                      onClick={bulkApproveSelected}
                      disabled={
                        bulkProcessing ||
                        selectedPendingDrafts.length === 0
                      }
                    >
                      <CheckCircle size={16} />

                      {bulkProcessing
                        ? bulkProgress || "Processing..."
                        : "Approve Selected"}

                    </button>


                    <button
                      style={styles.rejectButton}
                      onClick={bulkRejectSelected}
                      disabled={
                        bulkProcessing ||
                        selectedPendingDrafts.length === 0
                      }
                    >
                      <XCircle size={16} />
                      Reject Selected
                    </button>


                    <button
                      style={styles.secondaryButton}
                      onClick={() => setSelectedDraftIds([])}
                      disabled={
                        bulkProcessing ||
                        selectedDraftIds.length === 0
                      }
                    >
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

                  <article
                    key={draft.id}
                    style={styles.questionCard}
                  >

                    <div style={styles.cardTop}>

                      <div style={styles.cardTopLeft}>

                        {draft.review_status === "pending" && (

                          <input
                            type="checkbox"
                            aria-label={`Select question ${index + 1}`}
                            checked={selectedDraftIds.includes(draft.id)}
                            onChange={() =>
                              toggleDraftSelection(draft.id)
                            }
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


                    <h3 style={styles.questionText}>
                      {draft.question_text}
                    </h3>


                    <p style={styles.meta}>
                      {draft.question_type === "mcq"
                        ? "MULTIPLE CHOICE"
                        : "TRUE / FALSE"}
                      {" · "}
                      Difficulty: {draft.difficulty || "Not set"}
                      {" · "}
                      {draft.topic || "Unclassified topic"}
                    </p>


                    <p style={styles.meta}>
                      Original source level:{" "}
                      <strong>
                        {draft.source_level || "NOT ASSIGNED"}
                      </strong>
                    </p>


                    <p style={styles.meta}>
                      Eligible levels:{" "}
                      {(draft.eligible_levels || []).join(", ") ||
                        "Not assigned"}
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
              Showing {filteredDrafts.length} of {drafts.length} drafts
            </div>

          </section>

        )}

      </div>

    </main>
  );
}


// =========================================================
// STYLES
// =========================================================

const styles = {

  page: {
    minHeight: "100vh",
    padding: "24px",
    background: "#f5f7f4",
    color: "#173d32",
    boxSizing: "border-box",
  },

  container: {
    maxWidth: "1120px",
    margin: "0 auto",
  },

  backButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "9px 12px",
    border: "1px solid #d3ded5",
    borderRadius: "8px",
    background: "#fff",
    color: "#315b43",
    cursor: "pointer",
    marginBottom: "18px",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },

  eyebrow: {
    color: "#9a783b",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1.2px",
  },

  heading: {
    margin: "5px 0",
    fontSize: "clamp(21px, 3vw, 29px)",
    color: "#17452e",
  },

  subheading: {
    margin: 0,
    color: "#718078",
    lineHeight: 1.5,
  },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
    gap: "12px",
    margin: "20px 0",
  },

  stat: {
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "10px",
    padding: "14px",
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: "10px",
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "12px",
    padding: "15px",
    marginBottom: "18px",
  },

  filterTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 800,
    fontSize: "12px",
    color: "#315b43",
    gridColumn: "1 / -1",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #d6e0d8",
    borderRadius: "8px",
    background: "#fff",
    color: "#20382e",
    font: "inherit",
    marginBottom: "7px",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #d6e0d8",
    borderRadius: "8px",
    background: "#fff",
    color: "#20382e",
    font: "inherit",
    lineHeight: 1.55,
    resize: "vertical",
  },

  label: {
    display: "block",
    margin: "15px 0 7px",
    fontSize: "13px",
    fontWeight: 750,
    color: "#315b43",
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

  source: {
    fontSize: "12px",
    color: "#78857c",
    overflowWrap: "anywhere",
  },

  notice: {
    background: "#fff8e7",
    border: "1px solid #ead9a9",
    color: "#745a1f",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "13px",
    lineHeight: 1.5,
    margin: "12px 0",
  },

  help: {
    color: "#718077",
    fontSize: "13px",
    lineHeight: 1.5,
  },

  levelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
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
    marginTop: "18px",
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

  listSection: {
    background: "#fff",
    border: "1px solid #e2e9e3",
    borderRadius: "12px",
    padding: "18px",
  },

  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    color: "#17452e",
    margin: "0 0 16px",
  },

  bulkToolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
    padding: "14px",
    background: "#f6f8f5",
    border: "1px solid #e1e8e1",
    borderRadius: "9px",
    marginBottom: "16px",
  },

  selectAllLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 700,
    fontSize: "13px",
  },

  selectedCount: {
    color: "#687970",
    fontSize: "13px",
  },

  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))",
    gap: "14px",
  },

  questionCard: {
    border: "1px solid #e2e9e3",
    borderRadius: "11px",
    padding: "16px",
    minWidth: 0,
  },

  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },

  cardTopLeft: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
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
    fontSize: "15px",
    lineHeight: 1.55,
    margin: "12px 0",
    overflowWrap: "anywhere",
  },

  meta: {
    fontSize: "12px",
    color: "#66746a",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },

  empty: {
    padding: "35px 10px",
    textAlign: "center",
    color: "#7b887e",
  },

  pagination: {
    color: "#718077",
    fontSize: "13px",
    marginTop: "18px",
  },

};
