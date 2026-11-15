
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, CalendarDays,
  Clock, ClipboardList, RefreshCw, X, Save,
  Shuffle, ListChecks, Search, Eye, Send
} from "lucide-react";
import { supabase } from "./supabase";
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
  "Foundation", "Beginner", "Intermediate",
  "Moderate", "Advanced", "Expert"
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

  const loadExams = async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExams(data || []);
    } catch (err) {
      setError(err.message || "Unable to load examinations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !data || !["admin", "super_admin"].includes(data.role)) {
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

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!form.exam_name.trim() || !form.exam_date || !form.availability_end) {
      setMessage("Please complete all required fields.");
      return;
    }

    const start = new Date(form.exam_date);
    const end = new Date(form.availability_end);
    const duration = Number(form.duration_minutes);

    if (end <= start) {
      setMessage("Availability end must be after the exam start.");
      return;
    }

    if (end - start > 15 * 24 * 60 * 60 * 1000) {
      setMessage("Exam availability cannot exceed 15 days.");
      return;
    }

    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setMessage("Duration must be between 1 and 180 minutes.");
      return;
    }

    if (editingId) {
      const existing = exams.find((exam) => exam.id === editingId);

      if (existing?.status === "published") {
        setMessage("Unpublish the examination before editing it.");
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
      setMessage(err.message || "Unable to save examination.");
    } finally {
      setSaving(false);
    }
  };

  const openBuilder = async (exam) => {
    setBuilderExam(exam);
    setBuilderLoading(true);
    setError("");
    setBuilderSearch("");
    setBuilderType("all");
    setBuilderDifficulty("all");

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
      const matchesSearch =
        question.question_text.toLowerCase().includes(term) ||
        (question.topic || "").toLowerCase().includes(term);

      const matchesType =
        builderType === "all" || question.question_type === builderType;

      const matchesDifficulty =
        builderDifficulty === "all" ||
        question.difficulty === builderDifficulty;

      return matchesSearch && matchesType && matchesDifficulty;
    });
  }, [bankQuestions, builderSearch, builderType, builderDifficulty]);

  const selectedQuestions = useMemo(
    () => bankQuestions.filter((q) => selectedIds.includes(q.id)),
    [bankQuestions, selectedIds]
  );

  const tfSelected = selectedQuestions.filter(
    (q) => q.question_type === "true_false"
  ).length;

  const mcqSelected = selectedQuestions.filter(
    (q) => q.question_type === "mcq"
  ).length;

  const toggleQuestion = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const saveManualPaper = async () => {
    if (selectedIds.length !== 100 || tfSelected !== 40 || mcqSelected !== 60) {
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
        ...selectedQuestions.filter((q) => q.question_type === "true_false"),
        ...selectedQuestions.filter((q) => q.question_type === "mcq"),
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

      setMessage("Manual exam paper saved successfully.");
      setBuilderExam(null);
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to save manual paper.");
    } finally {
      setSaving(false);
    }
  };

  const publishExam = async (exam) => {
    if (
      !window.confirm(
        `Prepare and publish "${exam.exam_name}"? The paper must contain exactly 40 True/False and 60 MCQs.`
      )
    ) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("prepare_exam_paper", {
        p_exam_id: exam.id,
      });

      if (error) throw error;

      setMessage(
        `Published successfully: ${data.true_false_count} True/False + ${data.mcq_count} MCQ.`
      );

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

    try {
      const { error } = await supabase
        .from("exams")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", exam.id);

      if (error) throw error;
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to update exam status.");
    } finally {
      setSaving(false);
    }
  };

  const deleteExam = async (exam) => {
    if (!window.confirm(`Delete "${exam.exam_name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("exams")
        .delete()
        .eq("id", exam.id);

      if (error) throw error;
      await loadExams();
    } catch (err) {
      setError(err.message || "Unable to delete examination.");
    }
  };

  if (!authorized) {
    return (
      <main className="exam-page">
        <p>Checking administrator access...</p>
      </main>
    );
  }

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
                onChange={(e) => setForm({ ...form, exam_name: e.target.value })}
                placeholder="Example: Islamic Quiz 2026"
                required
              />

              <div className="exam-two-columns">
                <div>
                  <label>Exam Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.exam_date}
                    onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label>Availability End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={form.availability_end}
                    onChange={(e) => setForm({ ...form, availability_end: e.target.value })}
                    required
                  />
                </div>
              </div>

              <label>Duration</label>
              <select
                value={form.duration_minutes}
                onChange={(e) => setForm({
                  ...form,
                  duration_minutes: Number(e.target.value),
                })}
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
                onChange={(e) => setForm({ ...form, selection_mode: e.target.value })}
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
                Examinations are saved as drafts first. Prepare the paper before publishing.
              </p>

              {message && <p className="exam-message">{message}</p>}

              <button className="exam-save" type="submit" disabled={saving}>
                <Save size={17} /> {saving ? "Saving..." : "Save Examination"}
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
                style={{ width: `${Math.min(selectedIds.length, 100)}%` }}
              />
            </div>

            <div className="exam-builder-filters">
              <input
                placeholder="Search question or topic..."
                value={builderSearch}
                onChange={(e) => setBuilderSearch(e.target.value)}
              />

              <select
                value={builderType}
                onChange={(e) => setBuilderType(e.target.value)}
              >
                <option value="all">All question types</option>
                <option value="true_false">True / False</option>
                <option value="mcq">MCQ</option>
              </select>

              <select
                value={builderDifficulty}
                onChange={(e) => setBuilderDifficulty(e.target.value)}
              >
                <option value="all">All difficulties</option>
                {difficulties.map((d) => (
                  <option key={d} value={d}>{d}</option>
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
                      className={`exam-bank-question ${checked ? "selected" : ""}`}
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
                          {type === "true_false" ? "SECTION A · TRUE/FALSE" : "SECTION B · MCQ"}
                          {" · "}{question.difficulty}
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
              <button onClick={() => setBuilderExam(null)}>
                Cancel
              </button>
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
          <h2>ALL EXAMINATIONS</h2>
          <button onClick={loadExams} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading examinations...</p>
        ) : exams.length === 0 ? (
          <div className="exam-empty">
            <CalendarDays size={35} />
            <h3>No examinations created yet</h3>
            <p>Create your first examination to get started.</p>
          </div>
        ) : (
          <div className="exam-list">
            {exams.map((exam) => (
              <article className="exam-card" key={exam.id}>
                <div className="exam-card-top">
                  <span className={`exam-status ${exam.status}`}>
                    {exam.status.toUpperCase()}
                  </span>
                  <span>{exam.selection_mode.toUpperCase()} MODE</span>
                </div>

                <h3>{exam.exam_name}</h3>

                <p><CalendarDays size={16} /> Starts: {new Date(exam.exam_date).toLocaleString()}</p>
                <p><Clock size={16} /> Duration: {exam.duration_minutes} minutes</p>
                <p>Availability ends: {new Date(exam.availability_end).toLocaleString()}</p>
                <p>100 Questions · 40 True/False · 60 MCQ</p>

                <div className="exam-card-actions">
                  {exam.status !== "published" && exam.selection_mode === "manual" && (
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
                    <button onClick={() => changeStatus(exam, "unpublished")} disabled={saving}>
                      Unpublish
                    </button>
                  ) : (
                    <button onClick={() => publishExam(exam)} disabled={saving}>
                      <Send size={16} /> Publish
                    </button>
                  )}

                  <button className="exam-delete" onClick={() => deleteExam(exam)}>
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
