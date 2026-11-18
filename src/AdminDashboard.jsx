
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
} from "lucide-react";
import { supabase } from "./supabase";
import "./AdminDashboard.css";

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

  // Urdu translation states
  const [translatingUrdu, setTranslatingUrdu] = useState(false);
  const [translationMessage, setTranslationMessage] = useState("");
  const [translationCount, setTranslationCount] = useState(0);

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
        supabase.from("profiles").select("id, role"),

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
    } catch (err) {
      setError(err.message || "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  // ------------------------------------------
  // URDU QUESTION TRANSLATION
  // ------------------------------------------

  const translateUrduQuestions = async () => {
    if (translatingUrdu) return;

    const confirmed = window.confirm(
      "Start Urdu translation of all approved questions that do not have Urdu translations? Existing English questions will remain unchanged."
    );

    if (!confirmed) return;

    setTranslatingUrdu(true);
    setTranslationMessage("Starting Urdu translation...");
    setTranslationCount(0);

    let totalTranslated = 0;

    try {
      // Maximum 200 batches per run to avoid an endless request loop.
      for (let batch = 1; batch <= 200; batch++) {
        const {
          data,
          error: functionError,
        } = await supabase.functions.invoke(
          "translate-quiz-questions",
          {
            body: {
              limit: 5,
            },
          }
        );

        if (functionError) {
          throw functionError;
        }

        if (!data || data.success === false) {
          throw new Error(
            data?.error || "Urdu translation failed."
          );
        }

        const batchCount = Number(data.translated || 0);

        totalTranslated += batchCount;
        setTranslationCount(totalTranslated);

        if (data.complete) {
          break;
        }

        if (batchCount === 0) {
          throw new Error(
            "No questions were translated. Please check the Edge Function logs."
          );
        }

        setTranslationMessage(
          `${totalTranslated} questions translated successfully. Processing next batch...`
        );

        if (batch === 200) {
          setTranslationMessage(
            `${totalTranslated} questions translated. Run the button again to continue.`
          );
          break;
        }
      }

      if (totalTranslated > 0) {
        setTranslationMessage(
          `Success! ${totalTranslated} questions translated into Urdu.`
        );
      } else {
        setTranslationMessage(
          "All approved questions already have Urdu translations."
        );
      }
    } catch (err) {
      setTranslationMessage(
        `Translation stopped after ${totalTranslated} questions: ${
          err.message || "Unknown error"
        }`
      );
    } finally {
      setTranslatingUrdu(false);
    }
  };

  // ------------------------------------------
  // LOGOUT
  // ------------------------------------------

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  if (loading) {
    return (
      <div className="admin-loading">
        Loading Admin Panel...
      </div>
    );
  }

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

  const statCards = [
    {
      title: "Registered Candidates",
      value: stats.candidates,
      icon: Users,
    },
    {
      title: "Total Questions",
      value: stats.questions,
      icon: BookOpen,
    },
    {
      title: "Total Examinations",
      value: stats.exams,
      icon: ClipboardList,
    },
    {
      title: "Published Exams",
      value: stats.published,
      icon: CalendarDays,
    },
    {
      title: "Results Published",
      value: stats.results,
      icon: Trophy,
    },
    {
      title: "Exam Attempts",
      value: stats.attempts,
      icon: UserCheck,
    },
  ];

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

          <div
            style={{
              display: "flex",
              gap: 9,
              flexWrap: "wrap",
            }}
          >
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
          <p
            className="admin-notice"
            style={{ color: "#b42318" }}
          >
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        {/* URDU TRANSLATION */}

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #dce9e0",
            borderRadius: 12,
            padding: 20,
            margin: "22px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Languages size={24} color="#176b50" />

            <h2
              style={{
                margin: 0,
                color: "#173d32",
                fontSize: 18,
              }}
            >
              Urdu Question Translation
            </h2>
          </div>

          <p
            style={{
              color: "#687970",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Translate approved English and Roman Urdu questions
            into Urdu script using AI. Existing English questions
            and correct answers will remain unchanged.
          </p>

          <button
            className="admin-logout"
            type="button"
            onClick={translateUrduQuestions}
            disabled={translatingUrdu}
            style={{
              opacity: translatingUrdu ? 0.7 : 1,
              cursor: translatingUrdu ? "wait" : "pointer",
            }}
          >
            {translatingUrdu ? (
              <>
                <Loader
                  size={17}
                  style={{
                    animation: "spin 1s linear infinite",
                  }}
                />
                Translating Questions...
              </>
            ) : (
              <>
                <Languages size={17} />
                Translate Urdu Questions
              </>
            )}
          </button>

          {translatingUrdu && (
            <p
              style={{
                color: "#176b50",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 0,
              }}
            >
              {translationCount} questions translated so far.
              Please keep this page open.
            </p>
          )}

          {translationMessage && (
            <p
              role="status"
              style={{
                marginBottom: 0,
                marginTop: 12,
                fontSize: 13,
                color: translationMessage.startsWith("Success") ||
                  translationMessage.startsWith("All approved")
                  ? "#08734e"
                  : translationMessage.startsWith("Translation stopped")
                  ? "#b42318"
                  : "#687970",
                fontWeight: 600,
              }}
            >
              {translationMessage.startsWith("Success") ||
              translationMessage.startsWith("All approved") ? (
                <CheckCircle
                  size={15}
                  style={{
                    verticalAlign: "middle",
                    marginRight: 5,
                  }}
                />
              ) : null}
              {translationMessage}
            </p>
          )}
        </section>

        {/* STATISTICS */}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
            gap: 14,
            margin: "22px 0",
          }}
        >
          {statCards.map((item) => {
            const Icon = item.icon;

            return (
              <article
                key={item.title}
                style={{
                  background: "#fff",
                  border: "1px solid #e1e9e3",
                  borderRadius: 12,
                  padding: 17,
                }}
              >
                <Icon size={23} color="#176b50" />

                <p
                  style={{
                    color: "#687970",
                    fontSize: 12,
                    margin: "10px 0 5px",
                  }}
                >
                  {item.title}
                </p>

                <strong
                  style={{
                    fontSize: 27,
                    color: "#173d32",
                  }}
                >
                  {item.value}
                </strong>
              </article>
            );
          })}
        </section>

        {/* PORTAL MODULES */}

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
                    (event.key === "Enter" || event.key === " ")
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

        <section style={{ marginTop: 28 }}>
          <div className="admin-section-title">
            <h2>RECENT EXAMINATIONS</h2>
            <p>Latest examination records</p>
          </div>

          {recentExams.length === 0 ? (
            <p className="admin-notice">
              No examinations created yet.
            </p>
          ) : (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e1e9e3",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    borderBottom: "1px solid #edf1ee",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{exam.exam_name}</strong>

                    <p
                      style={{
                        margin: "4px 0 0",
                        color: "#718078",
                        fontSize: 12,
                      }}
                    >
                      {exam.exam_date
                        ? new Date(exam.exam_date).toLocaleString()
                        : "Date not set"}
                    </p>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color:
                        exam.status === "published"
                          ? "#08734e"
                          : "#8a6a28",
                      textTransform: "uppercase",
                    }}
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

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </main>
  );
}

export default AdminDashboard;
