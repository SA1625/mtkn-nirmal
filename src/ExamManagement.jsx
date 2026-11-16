import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  Clock,
  ClipboardList,
  RefreshCw,
  X,
  Save,
  ListChecks,
  Send,
  Layers,
  CheckSquare,
  Square,
} from "lucide-react";
import { supabase } from "./supabase";
import SixLevelPaperGenerator from "./SixLevelPaperGenerator";
import "./ExamManagement.css";

const emptyForm = {
  exam_name: "",
  exam_date: "",
  availability_end: "",
  duration_minutes: 180,
  selection_mode: "automatic",
  status: "draft",
};

const difficulties = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

const toLocalInput = (value) => {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
};

function ExamManagement() {
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [builderExam, setBuilderExam] = useState(null);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderSearch, setBuilderSearch] = useState("");
  const [builderType, setBuilderType] = useState("all");
  const [builderDifficulty, setBuilderDifficulty] = useState("all");
  const [builderNotice, setBuilderNotice] = useState("");

  const loadExams = async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase
        .from("exams")
        .select("*")
        .order("created_at", { ascending: false });

      if (loadError) throw loadError;

      setExams(data || []);
    } catch (err) {
      setError(err.message || "Unable to load examinations.");
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

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        !data ||
        !["admin", "super_admin"].includes(data.role)
      ) {
        navigate("/admin-login", { replace: true });
        return;
      }

      setAuthorized(true);
      await loadExams();
    };

    checkAdmin();
  }, [navigate]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setMessage("");
    setError("");
    setShowForm(true);
  };

  const openEdit = (exam) => {
    if (exam.series_id) {
      setMessage(
        "Generated level papers cannot be edited from the single-exam editor."
      );
      return;
    }

    setEditingId(exam.id);
    setForm({
      exam_name: exam.exam_name || "",
      exam_date: toLocalInput(exam.exam_date),
      availability_end: toLocalInput(exam.availability_end),
      duration_minutes: exam.duration_minutes || 180,
      selection_mode: exam.selection_mode || "automatic",
      status: exam.status || "draft",
    });

    setMessage("");
    setError("");
    setShowForm(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (
      !form.exam_name.trim() ||
      !form.exam_date ||
      !form.availability_end
    ) {
      setError("Please complete all required fields.");
      return;
    }

    const start = new Date(form.exam_date);
    const end = new Date(form.availability_end);
    const duration = Number(form.duration_minutes);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Please enter valid examination dates.");
      return;
    }

    if (end <= start) {
      setError("Availability end must be after the exam start.");
      return;
    }

    if (end - start > 15 * 24 * 60 * 60 * 1000) {
      setError("Exam availability cannot exceed 15 days.");
      return;
    }

    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setError("Duration must be between 1 and 180 minutes.");
      return;
    }

    if (editingId) {
      const existing = exams.find((exam) => exam.id === editingId);

      if (existing?.status === "published") {
        setError("Unpublish the examination before editing it.");
        return;
      }
    }

    const payload = {
      exam_name: form.exam_name.trim(),
      exam_date: start.toISOString(),
      availability_end: end.toISOString(),
      duration_minutes: duration,
      selection_mode: form.selection_mode,
      total_questions: 100,
      true_false_count: 40,
      mcq_count: 60,
      status: "draft",
      updated_at: new Date().toISOString(),
    };

    setSaving(true);

    try {
      let result;

      if (editingId) {
        result = await supabase
          .from("exams")
          .update(payload)
          .eq("id", editingId)
          .select("id")
          .maybeSingle();
      } else {
        result = await supabase
          .from("exams")
          .insert(payload)
          .select("id")
          .single();
      }

      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error("Examination was not saved.");

      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      setMessage("Examination saved as draft.");

      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to save examination.");
    } finally {
      setSaving(false);
    }
  };

  const openBuilder = async (exam) => {
    if (exam.series_id) {
      setError(
        "Generated level papers already have their question selection. Use the level paper workflow."
      );
      return;
    }

    setBuilderExam(exam);
    setBuilderLoading(true);
    setError("");
    setBuilderSearch("");
    setBuilderType("all");
    setBuilderDifficulty("all");
    setBuilderNotice("");

    try {
      const { data: questions, error: questionError } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("review_status", "approved")
        .order("created_at", { ascending: false });

      if (questionError) throw questionError;

      const { data: assignments, error: assignmentError } = await supabase
        .from("exam_questions")
        .select("question_id")
        .eq("exam_id", exam.id);

      if (assignmentError) throw assignmentError;

      setBankQuestions(questions || []);
      setSelectedIds((assignments || []).map((item) => item.question_id));
    } catch (err) {
      setError(err.message || "Unable to load question bank.");
    } finally {
      setBuilderLoading(false);
    }
  };

  const filteredBank = useMemo(() => {
    const term = builderSearch.toLowerCase();

    return bankQuestions.filter((question) => {
      const questionText = (question.question_text || "").toLowerCase();
      const topic = (question.topic || "").toLowerCase();

      const matchesSearch =
        questionText.includes(term) || topic.includes(term);

      const matchesType =
        builderType === "all" || question.question_type === builderType;

      const matchesDifficulty =
        builderDifficulty === "all" ||
        question.difficulty === builderDifficulty;

      return matchesSearch && matchesType && matchesDifficulty;
    });
  }, [bankQuestions, builderSearch, builderType, builderDifficulty]);

  const selectedQuestions = useMemo(
    () => bankQuestions.filter((question) => selectedIds.includes(question.id)),
    [bankQuestions, selectedIds]
  );

  const tfSelected = selectedQuestions.filter(
    (question) => question.question_type === "true_false"
  ).length;

  const mcqSelected = selectedQuestions.filter(
    (question) => question.question_type === "mcq"
  ).length;

  const toggleQuestion = (id) => {
    setBuilderNotice("");
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const selectAllFilteredQuestions = () => {
    const existing = new Set(selectedIds);
    let tfSlots = Math.max(0, 40 - tfSelected);
    let mcqSlots = Math.max(0, 60 - mcqSelected);
    let added = 0;
    let skipped = 0;
    const next = [...selectedIds];

    for (const question of filteredBank) {
      if (existing.has(question.id)) continue;

      if (question.question_type === "true_false" && tfSlots > 0 && next.length < 100) {
        next.push(question.id);
        existing.add(question.id);
        tfSlots -= 1;
        added += 1;
      } else if (question.question_type === "mcq" && mcqSlots > 0 && next.length < 100) {
        next.push(question.id);
        existing.add(question.id);
        mcqSlots -= 1;
        added += 1;
      } else {
        skipped += 1;
      }
    }

    setSelectedIds(next);
    setBuilderNotice(
      added
        ? `Added ${added} question(s) from the current filtered list. Selection remains capped at 40 True/False + 60 MCQ. ${skipped ? `${skipped} visible question(s) were skipped because a section was full.` : ""}`
        : "No more questions can be added from the current filtered list."
    );
  };

  const clearManualSelection = () => {
    setSelectedIds([]);
    setBuilderNotice("Selection cleared.");
  };

  const saveManualPaper = async () => {
    if (
      selectedIds.length !== 100 ||
      tfSelected !== 40 ||
      mcqSelected !== 60
    ) {
      setError(
        `Select exactly 100 questions: 40 True/False and 60 MCQs. Currently selected: ${tfSelected} + ${mcqSelected}.`
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const ordered = [
        ...selectedQuestions.filter(
          (question) => question.question_type === "true_false"
        ),
        ...selectedQuestions.filter(
          (question) => question.question_type === "mcq"
        ),
      ];

      const { error: deleteError } = await supabase
        .from("exam_questions")
        .delete()
        .eq("exam_id", builderExam.id);

      if (deleteError) throw deleteError;

      const rows = ordered.map((question, index) => ({
        exam_id: builderExam.id,
        question_id: question.id,
        question_order: index + 1,
      }));

      const { error: insertError } = await supabase
        .from("exam_questions")
        .insert(rows);

      if (insertError) throw insertError;

      setMessage("Manual examination paper saved successfully.");
      setBuilderExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to save manual paper.");
    } finally {
      setSaving(false);
    }
  };

  const publishExam = async (exam) => {
    const isGeneratedLevel = Boolean(exam.series_id && exam.level_order);

    const confirmation = isGeneratedLevel
      ? `Publish "${exam.exam_name}"? The generated paper will keep its existing 100 selected questions.`
      : `Prepare and publish "${exam.exam_name}"? The paper must contain exactly 40 True/False and 60 MCQs.`;

    if (!window.confirm(confirmation)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (isGeneratedLevel) {
        const { error: publishError } = await supabase
          .from("exams")
          .update({
            status: "published",
            updated_at: new Date().toISOString(),
          })
          .eq("id", exam.id);

        if (publishError) throw publishError;

        setMessage(`${exam.exam_name} published successfully.`);
      } else {
        const { data, error: prepareError } = await supabase.rpc(
          "prepare_exam_paper",
          { p_exam_id: exam.id }
        );

        if (prepareError) throw prepareError;

        setMessage(
          `Published successfully: ${data.true_false_count} True/False + ${data.mcq_count} MCQ.`
        );
      }

      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to publish examination.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (exam, status) => {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabase
        .from("exams")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", exam.id);

      if (updateError) throw updateError;

      setMessage(`${exam.exam_name} status updated.`);
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to update exam status.");
    } finally {
      setSaving(false);
    }
  };

  const deleteExam = async (exam) => {
    if (
      !window.confirm(
        `Delete "${exam.exam_name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("exams")
        .delete()
        .eq("id", exam.id);

      if (deleteError) throw deleteError;

      setMessage("Examination deleted.");
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to delete examination.");
    } finally {
      setSaving(false);
    }
  };

  if (!authorized) {
    return (
      <main className="exam-page">
        <p>Checking administrator access...</p>
      </main>
    );
  }

  const generatedExams = exams.filter(
    (exam) => exam.series_id && exam.level_order
  );

  const normalExams = exams.filter(
    (exam) => !exam.series_id || !exam.level_order
  );

  return (
    <main className="exam-page">
      <div className="exam-container">
        <button className="exam-back" onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Back to Admin Dashboard
        </button>

        <header className="exam-header">
          <div>
            <span>ADMINISTRATION</span>
            <h1>EXAMINATION MANAGEMENT</h1>
            <p>Create, schedule and prepare Islamic Quiz examinations.</p>
          </div>

          <button className="exam-primary" onClick={openNew}>
            <Plus size={18} /> Create Examination
          </button>
        </header>

        <section className="exam-summary">
          <ClipboardList size={28} />
          <div>
            <span>TOTAL EXAMINATIONS</span>
            <strong>{exams.length}</strong>
          </div>
        </section>

        {error && <p className="exam-alert">{error}</p>}
        {message && <p className="exam-message">{message}</p>}

        <SixLevelPaperGenerator onGenerated={loadExams} />

        {showForm && (
          <section className="exam-form-card">
            <div className="exam-form-title">
              <h2>{editingId ? "EDIT EXAMINATION" : "CREATE EXAMINATION"}</h2>
              <button type="button" onClick={() => setShowForm(false)}>
                <X />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <label>Examination Name</label>
              <input
                value={form.exam_name}
                onChange={(event) =>
                  setForm({ ...form, exam_name: event.target.value })
                }
                placeholder="Example: Islamic Quiz 2026"
                required
              />

              <div className="exam-two-columns">
                <div>
                  <label>Exam Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.exam_date}
                    onChange={(event) =>
                      setForm({ ...form, exam_date: event.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label>Availability End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.availability_end}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        availability_end: event.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <label>Duration</label>
              <select
                value={form.duration_minutes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    duration_minutes: Number(event.target.value),
                  })
                }
              >
                <option value={60}>1 Hour</option>
                <option value={90}>1 Hour 30 Minutes</option>
                <option value={120}>2 Hours</option>
                <option value={150}>2 Hours 30 Minutes</option>
                <option value={180}>3 Hours</option>
              </select>

              <label>Question Selection Mode</label>
              <select
                value={form.selection_mode}
                onChange={(event) =>
                  setForm({ ...form, selection_mode: event.target.value })
                }
              >
                <option value="automatic">Automatic Random Selection</option>
                <option value="manual">Manual Selection by Admin</option>
              </select>

              <div className="exam-pattern">
                <strong>EXAMINATION PATTERN</strong>
                <p>100 Questions · 100 Marks · No Negative Marking</p>
                <p>Section A: 40 True / False questions</p>
                <p>Section B: 60 Multiple Choice questions</p>
                <p>All questions compulsory.</p>
              </div>

              <p className="exam-info">
                Examinations are saved as drafts first. Prepare the paper
                before publishing.
              </p>

              <button className="exam-save" type="submit" disabled={saving}>
                <Save size={17} />
                {saving ? "Saving..." : "Save Examination"}
              </button>
            </form>
          </section>
        )}

        {builderExam && (
          <section className="exam-builder">
            <div className="exam-form-title">
              <div>
                <h2>MANUAL PAPER BUILDER</h2>
                <p>{builderExam.exam_name}</p>
              </div>

              <button onClick={() => setBuilderExam(null)}>
                <X />
              </button>
            </div>

            <div className="exam-selection-stats">
              <span>Total: {selectedIds.length}/100</span>
              <span>True/False: {tfSelected}/40</span>
              <span>MCQ: {mcqSelected}/60</span>
            </div>

            <div className="exam-selection-progress">
              <div
                style={{
                  width: `${Math.min(selectedIds.length, 100)}%`,
                }}
              />
            </div>

            <div className="exam-select-all-toolbar">
              <button
                type="button"
                onClick={selectAllFilteredQuestions}
                disabled={builderLoading || selectedIds.length >= 100 || filteredBank.length === 0}
              >
                <CheckSquare size={16} /> Select All Visible (fill available slots)
              </button>
              <button type="button" onClick={clearManualSelection} disabled={selectedIds.length === 0 || saving}>
                <Square size={16} /> Clear Selection
              </button>
              <span>{filteredBank.length} question(s) match the current filters.</span>
            </div>
            {builderNotice && <p className="exam-message">{builderNotice}</p>}

            <div className="exam-builder-filters">
              <input
                placeholder="Search question or topic..."
                value={builderSearch}
                onChange={(event) => setBuilderSearch(event.target.value)}
              />

              <select
                value={builderType}
                onChange={(event) => setBuilderType(event.target.value)}
              >
                <option value="all">All question types</option>
                <option value="true_false">True / False</option>
                <option value="mcq">MCQ</option>
              </select>

              <select
                value={builderDifficulty}
                onChange={(event) =>
                  setBuilderDifficulty(event.target.value)
                }
              >
                <option value="all">All difficulties</option>
                {difficulties.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </div>

            {builderLoading ? (
              <p>Loading approved questions...</p>
            ) : (
              <div className="exam-bank-list">
                {filteredBank.map((question) => {
                  const checked = selectedIds.includes(question.id);
                  const type = question.question_type;

                  const sectionFull =
                    !checked &&
                    (type === "true_false"
                      ? tfSelected >= 40
                      : mcqSelected >= 60);

                  const totalFull = !checked && selectedIds.length >= 100;

                  return (
                    <label
                      className={`exam-bank-question ${
                        checked ? "selected" : ""
                      }`}
                      key={question.id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={(!checked && sectionFull) || totalFull}
                        onChange={() => toggleQuestion(question.id)}
                      />

                      <div>
                        <span>
                          {type === "true_false"
                            ? "SECTION A · TRUE/FALSE"
                            : "SECTION B · MCQ"}
                          {" · "}
                          {question.difficulty}
                        </span>

                        <strong>{question.question_text}</strong>
                        <small>{question.topic}</small>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="exam-builder-actions">
              <button onClick={() => setBuilderExam(null)}>Cancel</button>

              <button
                className="exam-save"
                onClick={saveManualPaper}
                disabled={saving || builderLoading}
              >
                <Save size={17} />
                {saving ? "Saving..." : "Save 100 Questions"}
              </button>
            </div>
          </section>
        )}

        <div className="exam-list-heading">
          <h2>GENERATED SIX-LEVEL EXAMINATIONS</h2>
          <button onClick={loadExams} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {generatedExams.length === 0 ? (
          <div className="exam-empty">
            <Layers size={35} />
            <h3>No generated level papers yet</h3>
            <p>Import and review a question bank, then generate six papers.</p>
          </div>
        ) : (
          <div className="exam-list">
            {generatedExams
              .sort((a, b) => a.level_order - b.level_order)
              .map((exam) => (
                <article className="exam-card" key={exam.id}>
                  <div className="exam-card-top">
                    <span className={`exam-status ${exam.status}`}>
                      {(exam.status || "draft").toUpperCase()}
                    </span>
                    <span>
                      <Layers size={14} /> LEVEL {exam.level_order} OF 6
                    </span>
                  </div>

                  <h3>{exam.level_name || exam.exam_name}</h3>

                  <p>
                    <CalendarDays size={16} /> Starts:{" "}
                    {new Date(exam.exam_date).toLocaleString()}
                  </p>
                  <p>
                    <Clock size={16} /> Duration: {exam.duration_minutes}{" "}
                    minutes
                  </p>
                  <p>
                    Availability ends:{" "}
                    {new Date(exam.availability_end).toLocaleString()}
                  </p>
                  <p>100 Questions · 40 True/False · 60 MCQ</p>

                  <div className="exam-card-actions">
                    {exam.status === "published" ? (
                      <button
                        onClick={() => changeStatus(exam, "unpublished")}
                        disabled={saving}
                      >
                        Unpublish
                      </button>
                    ) : (
                      <button
                        onClick={() => publishExam(exam)}
                        disabled={saving}
                      >
                        <Send size={16} /> Publish
                      </button>
                    )}

                    <button
                      className="exam-delete"
                      onClick={() => deleteExam(exam)}
                      disabled={saving}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}

        <div className="exam-list-heading">
          <h2>OTHER EXAMINATIONS</h2>
          <button onClick={loadExams} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading examinations...</p>
        ) : normalExams.length === 0 ? (
          <div className="exam-empty">
            <CalendarDays size={35} />
            <h3>No other examinations created</h3>
            <p>Create a separate examination if required.</p>
          </div>
        ) : (
          <div className="exam-list">
            {normalExams.map((exam) => (
              <article className="exam-card" key={exam.id}>
                <div className="exam-card-top">
                  <span className={`exam-status ${exam.status}`}>
                    {(exam.status || "draft").toUpperCase()}
                  </span>
                  <span>
                    {(exam.selection_mode || "automatic").toUpperCase()} MODE
                  </span>
                </div>

                <h3>{exam.exam_name}</h3>

                <p>
                  <CalendarDays size={16} /> Starts:{" "}
                  {new Date(exam.exam_date).toLocaleString()}
                </p>
                <p>
                  <Clock size={16} /> Duration: {exam.duration_minutes} minutes
                </p>
                <p>
                  Availability ends:{" "}
                  {new Date(exam.availability_end).toLocaleString()}
                </p>
                <p>100 Questions · 40 True/False · 60 MCQ</p>

                <div className="exam-card-actions">
                  {exam.status !== "published" &&
                    exam.selection_mode === "manual" && (
                      <button onClick={() => openBuilder(exam)}>
                        <ListChecks size={16} /> Build Paper
                      </button>
                    )}

                  <button
                    onClick={() => openEdit(exam)}
                    disabled={exam.status === "published"}
                  >
                    <Pencil size={16} /> Edit
                  </button>

                  {exam.status === "published" ? (
                    <button
                      onClick={() => changeStatus(exam, "unpublished")}
                      disabled={saving}
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      onClick={() => publishExam(exam)}
                      disabled={saving}
                    >
                      <Send size={16} /> Publish
                    </button>
                  )}

                  <button
                    className="exam-delete"
                    onClick={() => deleteExam(exam)}
                    disabled={saving}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default ExamManagement;