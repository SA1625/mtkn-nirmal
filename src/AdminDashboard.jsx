
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  BookOpen,
  ClipboardList,
  Trophy,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  RefreshCw,
  UserCheck,
  CalendarDays,
  AlertTriangle,
  BookMarked,
  Languages,
  Loader,
  CheckCircle,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "./supabase";
import "./AdminDashboard.css";

const TRANSLATION_BATCH_SIZE = 20;
const MAX_TRANSLATION_BATCHES = 200;

function AdminDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);

  const [stats, setStats] = useState({
    candidates: 0,
    admins: 0,
    questions: 0,
    exams: 0,
    published: 0,
    results: 0,
    attempts: 0,
  });

  const [recentExams, setRecentExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // URDU TRANSLATION STATES
  const [translatingUrdu, setTranslatingUrdu] = useState(false);
  const [translationMessage, setTranslationMessage] = useState("");
  const [translationCount, setTranslationCount] = useState(0);
  const [translationBatch, setTranslationBatch] = useState(0);

  // SIX-LEVEL EXAM MANAGEMENT
  const [levelSeries, setLevelSeries] = useState([]);
  const [levelLoading, setLevelLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [levelQuestions, setLevelQuestions] = useState([]);
  const [levelQuestionsLoading, setLevelQuestionsLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [levelNotice, setLevelNotice] = useState("");
  const [levelError, setLevelError] = useState("");

  // LOAD ADMIN DASHBOARD
  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const {
        data: adminProfile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError || !adminProfile) {
        throw new Error("Unable to load administrator profile.");
      }

      if (!["admin", "super_admin"].includes(adminProfile.role)) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setProfile(adminProfile);

      const [
        profilesResponse,
        questionsResponse,
        examsResponse,
        resultsResponse,
        attemptsResponse,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, role"),

        supabase
          .from("quiz_questions")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("exams")
          .select("id, exam_name, exam_date, status, created_at")
          .order("created_at", { ascending: false }),

        supabase
          .from("exam_results")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("exam_attempts")
          .select("id", { count: "exact", head: true }),
      ]);

      if (profilesResponse.error) throw profilesResponse.error;
      if (questionsResponse.error) throw questionsResponse.error;
      if (examsResponse.error) throw examsResponse.error;
      if (resultsResponse.error) throw resultsResponse.error;
      if (attemptsResponse.error) throw attemptsResponse.error;

      const allProfiles = profilesResponse.data || [];
      const allExams = examsResponse.data || [];

      setStats({
        candidates: allProfiles.filter(
          (item) => item.role === "candidate"
        ).length,

        admins: allProfiles.filter((item) =>
          ["admin", "super_admin"].includes(item.role)
        ).length,

        questions: questionsResponse.count || 0,
        exams: allExams.length,

        published: allExams.filter(
          (item) => item.status === "published"
        ).length,

        results: resultsResponse.count || 0,
        attempts: attemptsResponse.count || 0,
      });

      setRecentExams(allExams.slice(0, 5));

      // Load generated six-level exam papers. These are grouped by series_id.
      const { data: generatedLevels, error: levelsError } = await supabase
        .from("exams")
        .select("id, exam_name, level_name, level_order, series_id, status, created_at")
        .not("series_id", "is", null)
        .order("created_at", { ascending: false });

      if (levelsError) throw levelsError;

      const grouped = new Map();
      (generatedLevels || []).forEach((exam) => {
        if (!grouped.has(exam.series_id)) grouped.set(exam.series_id, []);
        grouped.get(exam.series_id).push(exam);
      });

      setLevelSeries(
        [...grouped.entries()]
          .map(([seriesId, exams]) => ({
            seriesId,
            exams: exams.sort((a, b) => Number(a.level_order) - Number(b.level_order)),
          }))
          .sort((a, b) => {
            const aDate = new Date(a.exams[0]?.created_at || 0).getTime();
            const bDate = new Date(b.exams[0]?.created_at || 0).getTime();
            return bDate - aDate;
          })
      );
    } catch (err) {
      setError(err.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  // ------------------------------------------------
  // URDU QUESTION TRANSLATION - 20 QUESTIONS/BATCH
  // ------------------------------------------------

  const translateUrduQuestions = async () => {
    if (translatingUrdu) return;

    const confirmed = window.confirm(
      "Start Urdu translation of all approved questions without Urdu translations?\n\n" +
      "Batch size: 20 questions\n" +
      "Existing English questions and correct answers will remain unchanged."
    );

    if (!confirmed) return;

    setTranslatingUrdu(true);
    setTranslationMessage("Starting Urdu translation...");
    setTranslationCount(0);
    setTranslationBatch(0);

    let totalTranslated = 0;
    let completed = false;

    try {
      for (
        let batch = 1;
        batch <= MAX_TRANSLATION_BATCHES;
        batch++
      ) {
        setTranslationBatch(batch);

        setTranslationMessage(
          `Processing batch ${batch} · ${TRANSLATION_BATCH_SIZE} questions per batch...`
        );

        const {
          data,
          error: functionError,
        } = await supabase.functions.invoke(
          "translate-quiz-questions",
          {
            body: {
              limit: TRANSLATION_BATCH_SIZE,
            },
          }
        );

        if (functionError) {
          let detail = functionError.message;

          try {
            if (functionError.context?.json) {
              const response = await functionError.context.json();
              detail = response?.error || response?.message || detail;
            }
          } catch {
            // Keep the original error message.
          }

          throw new Error(detail || "Translation request failed.");
        }

        if (!data || data.success === false || data.error) {
          throw new Error(
            data?.error || "Urdu translation failed."
          );
        }

        const batchCount = Number(data.translated || 0);

        totalTranslated += batchCount;

        setTranslationCount(totalTranslated);

        if (data.complete) {
          completed = true;
          break;
        }

        if (batchCount === 0) {
          throw new Error(
            "No questions were translated. Please check the Edge Function logs."
          );
        }

        setTranslationMessage(
          `${totalTranslated} questions translated successfully. ` +
          `Batch ${batch} completed. Starting next batch...`
        );

        if (batch === MAX_TRANSLATION_BATCHES) {
          setTranslationMessage(
            `${totalTranslated} questions translated. ` +
            "Maximum batches reached. Click again to resume remaining questions."
          );
        }
      }

      if (completed) {
        setTranslationMessage(
          totalTranslated > 0
            ? `Success! ${totalTranslated} questions translated into Urdu. All approved questions are complete.`
            : "All approved questions already have Urdu translations."
        );
      } else if (totalTranslated > 0) {
        setTranslationMessage(
          `${totalTranslated} questions translated. Click again to continue from the remaining questions.`
        );
      }
    } catch (err) {
      setTranslationMessage(
        `Translation stopped after ${totalTranslated} questions: ${
          err.message || "Unknown error"
        }. You can safely resume later.`
      );
    } finally {
      setTranslatingUrdu(false);
    }
  };


  // Open one generated level paper and load its assigned questions.
  const openLevelPaper = async (exam) => {
    setSelectedLevel(exam);
    setLevelQuestions([]);
    setLevelQuestionsLoading(true);
    setLevelNotice("");
    setLevelError("");
    setEditingQuestion(null);

    try {
      const { data: assignments, error: assignmentError } = await supabase
        .from("exam_questions")
        .select("question_id")
        .eq("exam_id", exam.id);

      if (assignmentError) throw assignmentError;

      const ids = (assignments || []).map((row) => row.question_id).filter(Boolean);
      if (!ids.length) {
        setLevelQuestions([]);
        return;
      }

      const { data: questions, error: questionsError } = await supabase
        .from("quiz_questions")
        .select("*")
        .in("id", ids);

      if (questionsError) throw questionsError;

      const byId = new Map((questions || []).map((question) => [question.id, question]));
      setLevelQuestions(ids.map((id) => byId.get(id)).filter(Boolean));
    } catch (err) {
      setLevelError(err.message || "Unable to load questions for this level.");
    } finally {
      setLevelQuestionsLoading(false);
    }
  };

  const saveLevelQuestion = async () => {
    if (!editingQuestion?.id) return;

    let parsedOptions = editingQuestion.options;
    if (typeof parsedOptions === "string") {
      try {
        parsedOptions = JSON.parse(parsedOptions);
      } catch {
        setLevelError("Options must be valid JSON. Please correct the options field.");
        return;
      }
    }

    setSavingQuestion(true);
    setLevelError("");
    setLevelNotice("");

    try {
      const payload = {
        question_text: editingQuestion.question_text,
        question_type: editingQuestion.question_type,
        options: parsedOptions,
        correct_answer: editingQuestion.correct_answer,
        explanation: editingQuestion.explanation,
        topic: editingQuestion.topic,
        difficulty: editingQuestion.difficulty,
      };

      const { error: updateError } = await supabase
        .from("quiz_questions")
        .update(payload)
        .eq("id", editingQuestion.id);

      if (updateError) throw updateError;

      setLevelNotice("Question updated successfully. The original question record was retained.");
      await openLevelPaper(selectedLevel);
      setEditingQuestion(null);
    } catch (err) {
      setLevelError(err.message || "Unable to update this question.");
    } finally {
      setSavingQuestion(false);
    }
  };

  // LOGOUT
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  // LOADING
  if (loading) {
    return (
      <div className="admin-loading">
        Loading Admin Panel...
      </div>
    );
  }

  // ACCESS RESTRICTED
  if (error && !profile) {
    return (
      <div className="admin-denied">
        <ShieldCheck size={45} />
        <h2>ACCESS RESTRICTED</h2>
        <p>{error}</p>
        <button onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";

  // ------------------------------------------------
  // INTERACTIVE STATISTICS CARDS
  // ------------------------------------------------

  const statCards = [
    {
      title: "Registered Candidates",
      value: stats.candidates,
      icon: Users,
      path: "/admin/candidates",
      description: "View candidate records",
      color: "green",
    },
    {
      title: "Total Questions",
      value: stats.questions,
      icon: BookOpen,
      path: "/admin/questions",
      description: "Explore question bank",
      color: "blue",
    },
    {
      title: "Total Examinations",
      value: stats.exams,
      icon: ClipboardList,
      path: "/admin/exams",
      description: "Manage examinations",
      color: "purple",
    },
    {
      title: "Published Exams",
      value: stats.published,
      icon: CalendarDays,
      path: "/admin/exams",
      description: "View published exams",
      color: "orange",
    },
    {
      title: "Results Published",
      value: stats.results,
      icon: Trophy,
      path: "/admin/results",
      description: "View results and rankings",
      color: "gold",
    },
    {
      title: "Exam Attempts",
      value: stats.attempts,
      icon: UserCheck,
      path: "/admin/results",
      description: "Review examination records",
      color: "teal",
    },
  ];

  // ------------------------------------------------
  // PORTAL MANAGEMENT MODULES
  // ------------------------------------------------

  const modules = [
    {
      title: "Candidate Management",
      description: "View registered candidates and their details.",
      icon: Users,
      path: "/admin/candidates",
      status: "Open Module",
    },
    {
      title: "Question Bank",
      description: "Manage questions, topics and difficulty levels.",
      icon: BookOpen,
      path: "/admin/questions",
      status: "Open Module",
    },
    {
      title: "Examination Management",
      description: "Create, prepare and publish examinations.",
      icon: ClipboardList,
      path: "/admin/exams",
      status: "Open Module",
    },
    {
      title: "Results & Rankings",
      description: "Review examination results and rankings.",
      icon: Trophy,
      path: "/admin/results",
      status: "Open Module",
    },
    {
      title: "Admin Management",
      description: "Manage administrator permissions.",
      icon: ShieldCheck,
      path: "/admin/management",
      status: isSuperAdmin ? "Super Admin" : "Restricted",
      restricted: !isSuperAdmin,
    },
    {
      title: "Question Import & Review",
      description: "Review imported questions and AI-generated drafts.",
      icon: BookOpen,
      path: "/admin/question-review",
      status: "Open Module",
    },
    {
      title: "Islamic Book Review",
      description:
        "Review original Sawal and Jawab extracted from the Islamic book.",
      icon: BookMarked,
      path: "/admin/islamic-book-review",
      status: "Open Module",
      highlight: true,
    },
  ];

  // ------------------------------------------------
  // DASHBOARD UI
  // ------------------------------------------------

  return (
    <main className="admin-page">
      <div className="admin-container">

        {/* TOP BAR */}

        <div className="admin-topbar">
          <div className="admin-heading">
            <div className="admin-heading-icon">
              <LayoutDashboard size={27} />
            </div>

            <div>
              <h1>ADMIN DASHBOARD</h1>
              <p>ISLAMIC QUIZ 2026 PORTAL</p>
            </div>
          </div>

          <div className="admin-topbar-actions">
            {isSuperAdmin && (
              <button
                className="admin-logout"
                onClick={() => navigate("/admin/management")}
                type="button"
                title="Manage administrator permissions"
              >
                <ShieldCheck size={17} />
                Manage Admins
              </button>
            )}

            <button
              className="admin-logout"
              onClick={loadAdmin}
              disabled={loading}
              type="button"
            >
              <RefreshCw size={17} />
              Refresh
            </button>

            <button
              className="admin-logout"
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </div>

        {/* WELCOME */}

        <section className="admin-welcome">
          <div>
            <p className="admin-eyebrow">WELCOME BACK</p>
            <h2>{profile?.full_name || "Administrator"}</h2>
            <p>{profile?.email}</p>
            <p>Manage the Islamic Quiz 2026 portal.</p>
          </div>

          <div className="admin-role">
            <ShieldCheck size={20} />
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </div>
        </section>

        {error && (
          <p className="admin-notice admin-error">
            <AlertTriangle size={16} />
            {error}
          </p>
        )}

        {/* URDU TRANSLATION */}

        <section className="urdu-translation-card">
          <div className="urdu-translation-heading">
            <div className="urdu-translation-icon">
              <Languages size={24} />
            </div>

            <div>
              <h2>Urdu Question Translation</h2>
              <p>AI-powered English to Urdu translation</p>
            </div>
          </div>

          <p className="urdu-translation-description">
            Translate approved English and Roman Urdu questions
            into complete Urdu script. Every batch processes
            20 questions. Existing English questions, options
            and correct answers remain unchanged.
          </p>

          <div className="urdu-translation-info">
            <span>
              <Languages size={15} />
              Batch size: <strong>20 questions</strong>
            </span>

            <span>
              <CheckCircle size={15} />
              Safe resume enabled
            </span>
          </div>

          <button
            className="admin-translation-button"
            type="button"
            onClick={translateUrduQuestions}
            disabled={translatingUrdu}
          >
            {translatingUrdu ? (
              <>
                <Loader
                  size={18}
                  className="admin-spin"
                />
                Translating Questions...
              </>
            ) : (
              <>
                <Languages size={18} />
                Translate Urdu Questions
              </>
            )}
          </button>

          {translatingUrdu && (
            <div className="translation-progress-panel">
              <div className="translation-progress-top">
                <strong>Translation in progress</strong>
                <span>Batch {translationBatch}</span>
              </div>

              <div className="translation-progress-track">
                <div
                  className="translation-progress-fill"
                  style={{
                    width: `${
                      (translationCount % TRANSLATION_BATCH_SIZE) * 5
                    }%`,
                  }}
                />
              </div>

              <p>
                {translationCount} questions translated successfully.
                Please keep this page open.
              </p>
            </div>
          )}

          {translationMessage && (
            <p
              role="status"
              className={`translation-message ${
                translationMessage.startsWith("Success") ||
                translationMessage.startsWith("All approved")
                  ? "success"
                  : translationMessage.startsWith("Translation stopped")
                    ? "failure"
                    : ""
              }`}
            >
              {translationMessage.startsWith("Success") ||
              translationMessage.startsWith("All approved") ? (
                <CheckCircle size={16} />
              ) : null}

              {translationMessage}
            </p>
          )}
        </section>

        {/* INTERACTIVE STATISTICS PLAYCARDS */}

        <div className="admin-section-title">
          <h2>DASHBOARD OVERVIEW</h2>
          <p>Live portal statistics · Click any card to explore</p>
        </div>

        <section className="admin-stat-grid">
          {statCards.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.title}
                className={`admin-stat-card ${item.color}`}
                role="link"
                tabIndex={0}
                aria-label={`Open ${item.title}`}
                onClick={() => navigate(item.path)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    navigate(item.path);
                  }
                }}
              >
                <div className="admin-stat-card-top">
                  <div className="admin-stat-icon">
                    <Icon size={25} />
                  </div>

                  <ArrowUpRight
                    size={19}
                    className="admin-stat-arrow"
                  />
                </div>

                <p className="admin-stat-title">
                  {item.title}
                </p>

                <strong className="admin-stat-value">
                  {item.value.toLocaleString("en-IN")}
                </strong>

                <div className="admin-stat-card-bottom">
                  <span>{item.description}</span>
                  <span className="admin-stat-view">
                    View Details
                  </span>
                </div>
              </article>
            );
          })}
        </section>


        {/* SIX-LEVEL EXAM MANAGEMENT */}
        <section className="six-level-management">
          <div className="six-level-heading">
            <div className="urdu-translation-icon"><BookMarked size={24} /></div>
            <div>
              <h2>Six-Level Exam Management</h2>
              <p>Open a level paper to view, inspect and edit its assigned questions.</p>
            </div>
          </div>

          {levelSeries.length === 0 ? (
            <div className="six-level-empty">
              No generated six-level examination series found yet. Generate the six papers from Examination Management first.
            </div>
          ) : (
            <div className="six-level-series-list">
              {levelSeries.map((series) => (
                <div className="six-level-series" key={series.seriesId}>
                  <div className="six-level-series-title">
                    <strong>ISLAMIC QUIZ 2026 · SIX-LEVEL SERIES</strong>
                    <span>{series.exams.length}/6 papers found</span>
                  </div>
                  <div className="six-level-grid">
                    {["Foundation", "Beginner", "Intermediate", "Moderate", "Advanced", "Expert"].map((name, index) => {
                      const exam = series.exams.find((item) => Number(item.level_order) === index + 1);
                      return (
                        <button
                          type="button"
                          key={`${series.seriesId}-${name}`}
                          className={`six-level-card level-${index + 1}`}
                          disabled={!exam}
                          onClick={() => exam && openLevelPaper(exam)}
                        >
                          <span className="six-level-number">LEVEL {index + 1}</span>
                          <strong>{exam?.level_name || name}</strong>
                          <span>{exam ? `${(exam.status || "draft").toUpperCase()} · View questions` : "Paper not found"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {selectedLevel && (
          <div className="level-modal-backdrop" role="presentation" onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedLevel(null);
              setEditingQuestion(null);
            }
          }}>
            <section className="level-modal" role="dialog" aria-modal="true" aria-label="Level question details">
              <div className="level-modal-header">
                <div>
                  <span>LEVEL {selectedLevel.level_order} QUESTION BANK</span>
                  <h2>{selectedLevel.level_name || selectedLevel.exam_name}</h2>
                  <p>{selectedLevel.status || "draft"} · {levelQuestions.length} assigned questions</p>
                </div>
                <button type="button" onClick={() => { setSelectedLevel(null); setEditingQuestion(null); }} aria-label="Close">×</button>
              </div>

              {levelError && <div className="level-alert error">{levelError}</div>}
              {levelNotice && <div className="level-alert success">{levelNotice}</div>}

              {levelQuestionsLoading ? (
                <p className="level-empty">Loading questions...</p>
              ) : (
                <>
                  {!editingQuestion ? (
                    <div className="level-question-list">
                      {levelQuestions.map((question, index) => (
                        <article className="level-question-item" key={question.id}>
                          <div className="level-question-top">
                            <span>QUESTION {index + 1} · {(question.question_type || "question").replace("_", " ").toUpperCase()}</span>
                            <button type="button" onClick={() => {
                              setLevelError("");
                              setLevelNotice("");
                              setEditingQuestion({
                                ...question,
                                options: typeof question.options === "string"
                                  ? question.options
                                  : JSON.stringify(question.options ?? {}, null, 2),
                              });
                            }}>Edit Question</button>
                          </div>
                          <strong>{question.question_text || "Question text missing"}</strong>
                          <p>Topic: {question.topic || "—"} · Difficulty: {question.difficulty || "—"}</p>
                          <pre>{JSON.stringify(question.options ?? {}, null, 2)}</pre>
                          <p><b>Correct answer:</b> {String(question.correct_answer ?? "—")}</p>
                          {question.explanation && <p><b>Explanation:</b> {question.explanation}</p>}
                        </article>
                      ))}
                      {levelQuestions.length === 0 && (
                        <div className="level-empty">No questions are currently assigned to this level paper.</div>
                      )}
                    </div>
                  ) : (
                    <div className="level-edit-form">
                      <h3>Edit Question</h3>
                      <label>Question text<textarea value={editingQuestion.question_text || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })} /></label>
                      <label>Question type<input value={editingQuestion.question_type || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, question_type: e.target.value })} /></label>
                      <label>Options (JSON)<textarea className="level-options-editor" value={editingQuestion.options || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, options: e.target.value })} /></label>
                      <label>Correct answer<input value={editingQuestion.correct_answer ?? ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_answer: e.target.value })} /></label>
                      <label>Explanation<textarea value={editingQuestion.explanation || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })} /></label>
                      <div className="level-edit-row">
                        <label>Topic<input value={editingQuestion.topic || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, topic: e.target.value })} /></label>
                        <label>Difficulty<input value={editingQuestion.difficulty || ""} onChange={(e) => setEditingQuestion({ ...editingQuestion, difficulty: e.target.value })} /></label>
                      </div>
                      <div className="level-edit-actions">
                        <button type="button" className="level-cancel" onClick={() => setEditingQuestion(null)}>Cancel</button>
                        <button type="button" className="level-save" onClick={saveLevelQuestion} disabled={savingQuestion}>
                          {savingQuestion ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {/* PORTAL MANAGEMENT */}

        <div className="admin-section-title">
          <h2>PORTAL MANAGEMENT</h2>
          <p>Administration modules</p>
        </div>

        <section className="admin-module-grid">
          {modules.map((module) => {
            const Icon = module.icon;
            const isDisabled = Boolean(module.restricted);

            return (
              <article
                className="admin-module-card"
                key={module.title}
                onClick={() => {
                  if (!isDisabled) navigate(module.path);
                }}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                onKeyDown={(event) => {
                  if (
                    !isDisabled &&
                    (
                      event.key === "Enter" ||
                      event.key === " "
                    )
                  ) {
                    event.preventDefault();
                    navigate(module.path);
                  }
                }}
                style={{
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  border: module.highlight
                    ? "1px solid #b8d7c8"
                    : undefined,
                  background: module.highlight
                    ? "linear-gradient(135deg, #ffffff 0%, #f0faf5 100%)"
                    : undefined,
                  opacity: isDisabled ? 0.65 : 1,
                }}
              >
                <div className="admin-module-icon">
                  <Icon size={25} />
                </div>

                <h3>{module.title}</h3>
                <p>{module.description}</p>

                <span
                  className={`admin-module-status ${
                    isDisabled ? "restricted" : ""
                  }`}
                >
                  {module.status}
                </span>
              </article>
            );
          })}
        </section>

        {/* RECENT EXAMINATIONS */}

        <section className="admin-recent-section">
          <div className="admin-section-title">
            <h2>RECENT EXAMINATIONS</h2>
            <p>Latest examination records</p>
          </div>

          {recentExams.length === 0 ? (
            <p className="admin-notice">
              No examinations created yet.
            </p>
          ) : (
            <div className="admin-recent-list">
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="admin-recent-item"
                >
                  <div>
                    <strong>{exam.exam_name}</strong>

                    <p>
                      {exam.exam_date
                        ? new Date(
                            exam.exam_date
                          ).toLocaleString("en-IN")
                        : "Date not set"}
                    </p>
                  </div>

                  <span
                    className={`admin-recent-status ${
                      exam.status === "published"
                        ? "published"
                        : ""
                    }`}
                  >
                    {exam.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="admin-notice">
          Administrator access is subject to assigned permissions.
        </p>
      </div>

      {/* DASHBOARD STYLES */}

      <style>{`

        /* TOP BAR */

        .admin-topbar-actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .admin-error {
          color: #b42318;
        }

        /* SECTION HEADINGS */

        .admin-section-title {
          margin: 26px 0 15px;
        }

        .admin-section-title h2 {
          margin: 0;
        }

        .admin-section-title p {
          margin: 5px 0 0;
          color: #718078;
          font-size: 13px;
        }

        /* URDU TRANSLATION */

        .urdu-translation-card {
          background: #fff;
          border: 1px solid #dce9e0;
          border-radius: 15px;
          padding: 22px;
          margin: 22px 0;
          box-shadow: 0 3px 12px rgba(23, 61, 50, 0.04);
        }

        .urdu-translation-heading {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .urdu-translation-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eaf5ef;
          color: #176b50;
          flex-shrink: 0;
        }

        .urdu-translation-heading h2 {
          margin: 0;
          color: #173d32;
          font-size: 19px;
        }

        .urdu-translation-heading p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #718078;
        }

        .urdu-translation-description {
          color: #687970;
          font-size: 13px;
          line-height: 1.7;
          margin: 15px 0;
        }

        .urdu-translation-info {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 17px;
        }

        .urdu-translation-info span {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #176b50;
          font-size: 12px;
        }

        .admin-translation-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          background: #176b50;
          color: white;
          border: none;
          border-radius: 9px;
          padding: 12px 18px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .admin-translation-button:hover:not(:disabled) {
          background: #10563e;
          transform: translateY(-2px);
          box-shadow: 0 5px 14px rgba(23, 107, 80, 0.18);
        }

        .admin-translation-button:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .translation-progress-panel {
          margin-top: 18px;
          padding: 14px;
          border-radius: 10px;
          background: #f0f8f3;
        }

        .translation-progress-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          color: #176b50;
        }

        .translation-progress-track {
          height: 7px;
          border-radius: 20px;
          overflow: hidden;
          background: #d9e9df;
          margin-top: 12px;
        }

        .translation-progress-fill {
          height: 100%;
          background: #176b50;
          border-radius: 20px;
          transition: width 0.3s ease;
        }

        .translation-progress-panel p {
          margin: 10px 0 0;
          font-size: 12px;
          color: #476455;
        }

        .translation-message {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          margin: 13px 0 0;
          font-size: 13px;
          line-height: 1.6;
          font-weight: 600;
          color: #687970;
        }

        .translation-message.success {
          color: #08734e;
        }

        .translation-message.failure {
          color: #b42318;
        }

        /* STATISTICS PLAYCARDS */

        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(190px, 1fr)
          );
          gap: 16px;
          margin: 20px 0 28px;
        }

        .admin-stat-card {
          position: relative;
          overflow: hidden;
          min-height: 175px;
          padding: 19px;
          border-radius: 15px;
          border: 1px solid #e1e9e3;
          background: #ffffff;
          cursor: pointer;
          outline: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 3px 12px rgba(23, 61, 50, 0.045);
          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
          animation: statCardAppear 0.45s ease both;
        }

        .admin-stat-card::before {
          content: "";
          position: absolute;
          width: 110px;
          height: 110px;
          border-radius: 50%;
          right: -40px;
          top: -43px;
          background: var(--stat-soft);
          transition: transform 0.3s ease;
        }

        .admin-stat-card:hover {
          transform: translateY(-7px);
          border-color: var(--stat-color);
          box-shadow: 0 13px 28px rgba(23, 61, 50, 0.13);
        }

        .admin-stat-card:hover::before {
          transform: scale(1.45);
        }

        .admin-stat-card:active {
          transform: translateY(-2px) scale(0.985);
        }

        .admin-stat-card:focus-visible {
          outline: 3px solid #176b50;
          outline-offset: 3px;
        }

        .admin-stat-card.green {
          --stat-color: #16835d;
          --stat-soft: #e4f5ec;
          --stat-text: #176b50;
        }

        .admin-stat-card.blue {
          --stat-color: #3279b8;
          --stat-soft: #e8f2fc;
          --stat-text: #27659d;
        }

        .admin-stat-card.purple {
          --stat-color: #8160bd;
          --stat-soft: #f0eafd;
          --stat-text: #6c4aa8;
        }

        .admin-stat-card.orange {
          --stat-color: #d58a32;
          --stat-soft: #fff1df;
          --stat-text: #b76e1c;
        }

        .admin-stat-card.gold {
          --stat-color: #bd9a35;
          --stat-soft: #fbf5dc;
          --stat-text: #94751d;
        }

        .admin-stat-card.teal {
          --stat-color: #269b9a;
          --stat-soft: #e0f5f3;
          --stat-text: #167c7b;
        }

        .admin-stat-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          z-index: 1;
        }

        .admin-stat-icon {
          width: 45px;
          height: 45px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: var(--stat-soft);
          color: var(--stat-text);
          transition: transform 0.25s ease;
        }

        .admin-stat-card:hover .admin-stat-icon {
          transform: scale(1.12) rotate(-5deg);
        }

        .admin-stat-arrow {
          color: var(--stat-text);
          opacity: 0.65;
          transition: transform 0.25s ease;
        }

        .admin-stat-card:hover .admin-stat-arrow {
          opacity: 1;
          transform: translate(3px, -3px);
        }

        .admin-stat-title {
          position: relative;
          z-index: 1;
          color: #687970;
          font-size: 12px;
          font-weight: 600;
          margin: 14px 0 3px;
        }

        .admin-stat-value {
          position: relative;
          z-index: 1;
          display: block;
          color: #173d32;
          font-size: 30px;
          line-height: 1.2;
          font-weight: 800;
        }

        .admin-stat-card-bottom {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 10px;
          color: #718078;
        }

        .admin-stat-view {
          color: var(--stat-text);
          font-weight: 800;
          white-space: nowrap;
        }

        @keyframes statCardAppear {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* RECENT EXAMINATIONS */

        .admin-recent-section {
          margin-top: 28px;
        }

        .admin-recent-list {
          background: #fff;
          border: 1px solid #e1e9e3;
          border-radius: 13px;
          overflow: hidden;
        }

        .admin-recent-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 15px;
          border-bottom: 1px solid #edf1ee;
          flex-wrap: wrap;
        }

        .admin-recent-item:last-child {
          border-bottom: none;
        }

        .admin-recent-item strong {
          color: #173d32;
          font-size: 14px;
        }

        .admin-recent-item p {
          margin: 4px 0 0;
          color: #718078;
          font-size: 12px;
        }

        .admin-recent-status {
          font-size: 11px;
          font-weight: 700;
          color: #8a6a28;
          text-transform: uppercase;
        }

        .admin-recent-status.published {
          color: #08734e;
        }

        /* LOADING SPINNER */

        .admin-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }


         /* SIX-LEVEL EXAM MANAGEMENT */
         .six-level-management {
           background: #fff;
           border: 1px solid #dce9e0;
           border-radius: 15px;
           padding: 22px;
           margin: 24px 0;
           box-shadow: 0 3px 12px rgba(23, 61, 50, 0.04);
         }
         .six-level-heading { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
         .six-level-heading h2 { margin:0; color:#173d32; font-size:19px; }
         .six-level-heading p { margin:4px 0 0; color:#718078; font-size:12px; }
         .six-level-series { border:1px solid #e2eae4; border-radius:12px; padding:15px; margin-top:13px; }
         .six-level-series-title { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; color:#176b50; font-size:12px; margin-bottom:13px; }
         .six-level-series-title span { color:#718078; }
         .six-level-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:11px; }
         .six-level-card { text-align:left; display:flex; flex-direction:column; gap:8px; padding:16px; border:1px solid #dce9e0; border-radius:11px; background:#fbfdfb; cursor:pointer; transition:transform .2s,box-shadow .2s; }
         .six-level-card:hover:not(:disabled) { transform:translateY(-4px); box-shadow:0 8px 18px rgba(23,61,50,.1); }
         .six-level-card:disabled { opacity:.48; cursor:not-allowed; }
         .six-level-card strong { color:#173d32; font-size:15px; }
         .six-level-card span:last-child { color:#718078; font-size:11px; }
         .six-level-number { color:#176b50; font-size:10px; font-weight:800; letter-spacing:.8px; }
         .level-2 { background:#f5f9ff; } .level-3 { background:#faf7ff; } .level-4 { background:#fffaf1; } .level-5 { background:#f2fbfa; } .level-6 { background:#fff7f6; }
         .six-level-empty,.level-empty { padding:18px; border:1px dashed #d6e2da; border-radius:9px; color:#718078; font-size:13px; }
         .level-modal-backdrop { position:fixed; inset:0; z-index:1000; display:flex; justify-content:center; align-items:center; padding:18px; background:rgba(10,30,22,.58); }
         .level-modal { width:min(900px,100%); max-height:90vh; overflow:auto; padding:22px; background:#fff; border-radius:15px; box-shadow:0 20px 60px rgba(0,0,0,.2); }
         .level-modal-header { display:flex; justify-content:space-between; align-items:flex-start; gap:15px; padding-bottom:15px; margin-bottom:15px; border-bottom:1px solid #e6eee8; }
         .level-modal-header span { color:#a17c35; font-size:10px; font-weight:800; letter-spacing:1px; }
         .level-modal-header h2 { margin:5px 0; color:#14583e; }
         .level-modal-header p { margin:0; color:#718078; font-size:12px; }
         .level-modal-header button { border:0; border-radius:8px; padding:5px 12px; background:#f1f5f2; font-size:25px; cursor:pointer; }
         .level-question-list { display:grid; gap:12px; }
         .level-question-item { padding:15px; border:1px solid #e4ebe6; border-radius:10px; }
         .level-question-top { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:10px; }
         .level-question-top span { color:#176b50; font-size:10px; font-weight:800; }
         .level-question-top button,.level-save { border:0; border-radius:7px; padding:8px 12px; color:#fff; background:#176b50; font-weight:700; cursor:pointer; }
         .level-question-item strong { display:block; color:#173d32; line-height:1.5; }
         .level-question-item p { color:#718078; font-size:12px; }
         .level-question-item pre { max-height:130px; overflow:auto; padding:10px; background:#f6f8f6; border-radius:7px; font-size:11px; white-space:pre-wrap; }
         .level-edit-form { display:grid; gap:12px; }
         .level-edit-form h3 { color:#14583e; margin:0; }
         .level-edit-form label { display:grid; gap:6px; color:#476455; font-size:12px; font-weight:700; }
         .level-edit-form input,.level-edit-form textarea { width:100%; box-sizing:border-box; border:1px solid #d6e2da; border-radius:8px; padding:10px; font:inherit; color:#173d32; }
         .level-edit-form textarea { min-height:85px; resize:vertical; }
         .level-edit-form .level-options-editor { min-height:150px; font-family:monospace; }
         .level-edit-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
         .level-edit-actions { display:flex; justify-content:flex-end; gap:9px; }
         .level-cancel { border:1px solid #d6e2da; border-radius:7px; padding:9px 14px; background:#fff; color:#476455; cursor:pointer; }
         .level-save:disabled { opacity:.6; cursor:wait; }
         .level-alert { margin:10px 0; padding:11px; border-radius:8px; font-size:12px; }
         .level-alert.error { background:#fff1f0; color:#b42318; }
         .level-alert.success { background:#ecfdf3; color:#067647; }

        /* MOBILE RESPONSIVE */

        @media (max-width: 600px) {
          .admin-topbar-actions {
            width: 100%;
          }

          .admin-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .admin-stat-card {
            min-height: 160px;
            padding: 13px;
          }

          .admin-stat-value {
            font-size: 25px;
          }

          .admin-stat-card-bottom {
            flex-direction: column;
            align-items: flex-start;
          }

          .urdu-translation-card {
            padding: 16px;
          }

          .urdu-translation-info {
            flex-direction: column;
            gap: 8px;
          }

          .admin-translation-button {
            width: 100%;
          }
        }


        @media (max-width: 700px) {
          .six-level-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .six-level-management { padding:15px; }
          .level-modal { padding:15px; }
        }
        @media (max-width: 430px) {
          .six-level-grid,.level-edit-row { grid-template-columns:1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .admin-stat-card,
          .admin-stat-card::before,
          .admin-stat-icon,
          .admin-stat-arrow {
            animation: none;
            transition: none;
          }
        }

      `}</style>
    </main>
  );
}

export default AdminDashboard;
