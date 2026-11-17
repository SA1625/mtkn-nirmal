
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "./Dashboard.css";

import {
  CalendarDays,
  ClipboardList,
  Trophy,
  FileText,
  ChartNoAxesColumn,
  UserRound,
  LogOut,
  Clock,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  Medal,
  TrendingUp,
  Download,
  Lock,
  Award,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

function printResultReport(result, exam, candidateName) {
  const examName = exam?.exam_name || "Islamic Quiz Examination";

  const date = result.published_at
    ? new Date(result.published_at).toLocaleString("en-IN")
    : "—";

  const popup = window.open("", "_blank", "width=900,height=750");

  if (!popup) {
    alert("Please allow pop-ups to generate your marksheet.");
    return;
  }

  popup.document.open();

  popup.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Quiz Result - ${escapeHTML(candidateName)}</title>
      <meta charset="UTF-8">
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;color:#173d32;margin:0;padding:35px;background:#fff}
        .sheet{max-width:800px;margin:auto;border:2px solid #176b50;padding:30px}
        .head{text-align:center;border-bottom:2px solid #176b50;padding-bottom:20px}
        .head h1{font-size:22px;margin:0 0 8px}
        .head p{margin:4px;font-size:13px}
        .title{text-align:center;margin:25px 0}
        .title h2{letter-spacing:2px;margin:0 0 7px}
        .info{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:25px 0}
        .field{border:1px solid #d7e4dc;padding:13px;border-radius:6px}
        .field small{display:block;color:#718078;margin-bottom:6px}
        .score{text-align:center;background:#eaf5ee;border:1px solid #b9d9c5;padding:25px;margin:22px 0}
        .score strong{font-size:42px;display:block;color:#176b50}
        .score span{font-size:12px;letter-spacing:2px}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{padding:13px;border:1px solid #d7e4dc;text-align:left}
        th{background:#edf5ef}
        .note{margin-top:30px;font-size:12px;color:#718078;text-align:center}
        .actions{text-align:center;margin:20px}
        button{padding:12px 25px;background:#176b50;color:white;border:0;border-radius:6px;cursor:pointer}
        @media print{body{padding:0}.sheet{border:2px solid #176b50}.actions{display:none}}
      </style>
    </head>
    <body>
      <div class="sheet">
        <header class="head">
          <h1>MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST</h1>
          <p>NIRMAL DIST, TG</p>
          <p>ISLAMIC QUIZ 2026</p>
        </header>

        <div class="title">
          <h2>EXAMINATION RESULT</h2>
          <p>OFFICIAL RESULT REPORT</p>
        </div>

        <div class="info">
          <div class="field"><small>CANDIDATE NAME</small><strong>${escapeHTML(candidateName)}</strong></div>
          <div class="field"><small>EXAMINATION</small><strong>${escapeHTML(examName)}</strong></div>
          <div class="field"><small>RESULT DATE</small><strong>${escapeHTML(date)}</strong></div>
          <div class="field"><small>RESULT STATUS</small><strong>SUBMITTED</strong></div>
        </div>

        <div class="score">
          <strong>${Number(result.marks_obtained || 0)}/100</strong>
          <span>TOTAL MARKS OBTAINED</span>
        </div>

        <table>
          <tr><th>Performance Details</th><th>Count</th></tr>
          <tr><td>Total Questions</td><td>${Number(result.total_questions ?? 100)}</td></tr>
          <tr><td>Attempted Questions</td><td>${Number(result.attempted_questions ?? 0)}</td></tr>
          <tr><td>Correct Answers</td><td>${Number(result.correct_answers ?? 0)}</td></tr>
          <tr><td>Wrong Answers</td><td>${Number(result.wrong_answers ?? 0)}</td></tr>
          <tr><td>Unanswered Questions</td><td>${Math.max(0, Number(result.total_questions ?? 100) - Number(result.attempted_questions ?? 0))}</td></tr>
        </table>

        <p class="note">This report is generated electronically by the Islamic Quiz 2026 Portal.</p>
      </div>

      <div class="actions">
        <button onclick="window.print()">Print / Save as PDF</button>
      </div>

      <script>window.onload=()=>window.focus();</script>
    </body>
    </html>
  `);

  popup.document.close();
}

function Dashboard() {
  const navigate = useNavigate();

  const [candidateName, setCandidateName] = useState("");
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");

  // Load candidate dashboard data.
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      const [
        profileResponse,
        examResponse,
        resultResponse,
        attemptResponse,
        leaderboardResponse,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single(),

        supabase
          .from("exams")
          .select(`
            id,
            exam_name,
            exam_date,
            availability_end,
            duration_minutes,
            total_questions,
            status,
            series_id,
            level_order,
            level_name
          `)
          .eq("status", "published")
          .order("exam_date", { ascending: true }),

        supabase
          .from("exam_results")
          .select("*")
          .eq("candidate_id", user.id)
          .order("published_at", { ascending: false }),

        supabase
          .from("exam_attempts")
          .select("*")
          .eq("candidate_id", user.id)
          .order("created_at", { ascending: false }),

        supabase.rpc("get_quiz_leaderboard", {
          p_exam_id: null,
        }),
      ]);

      if (profileResponse.error) throw profileResponse.error;
      if (examResponse.error) throw examResponse.error;
      if (resultResponse.error) throw resultResponse.error;
      if (attemptResponse.error) throw attemptResponse.error;

      setCandidateName(
        profileResponse.data?.full_name || "Candidate"
      );

      setExams(examResponse.data || []);
      setResults(resultResponse.data || []);

      // Latest attempt is first because records are ordered by created_at DESC.
      setAttempts(attemptResponse.data || []);

      setLeaderboard(
        leaderboardResponse.error
          ? []
          : leaderboardResponse.data || []
      );
    } catch (err) {
      setError(err.message || "Unable to load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const now = Date.now();

  // Return the latest attempt for an examination.
  const getAttempt = useCallback(
    (examId) => {
      return attempts
        .filter((attempt) => attempt.exam_id === examId)
        .sort((a, b) => {
          const dateA = new Date(
            a.created_at || a.started_at || 0
          ).getTime();

          const dateB = new Date(
            b.created_at || b.started_at || 0
          ).getTime();

          return dateB - dateA;
        })[0] || null;
    },
    [attempts]
  );

  // Return the latest published result for an examination.
  const getResult = useCallback(
    (examId) => {
      return results
        .filter((result) => result.exam_id === examId)
        .sort((a, b) => {
          return (
            new Date(b.published_at || 0).getTime() -
            new Date(a.published_at || 0).getTime()
          );
        })[0] || null;
    },
    [results]
  );

  const upcomingExams = useMemo(
    () =>
      exams.filter(
        (exam) =>
          new Date(exam.exam_date).getTime() > now
      ),
    [exams, now]
  );

  const availableExams = useMemo(
    () =>
      exams.filter((exam) => {
        const start = new Date(exam.exam_date).getTime();
        const end = new Date(exam.availability_end).getTime();

        return start <= now && end >= now;
      }),
    [exams, now]
  );

  // Use only the latest attempt for completed status.
  // Old terminated records must not block a revoked retry.
  const latestAttempts = useMemo(() => {
    const latestMap = new Map();

    attempts.forEach((attempt) => {
      const existing = latestMap.get(attempt.exam_id);

      if (!existing) {
        latestMap.set(attempt.exam_id, attempt);
        return;
      }

      const currentTime = new Date(
        attempt.created_at || attempt.started_at || 0
      ).getTime();

      const existingTime = new Date(
        existing.created_at || existing.started_at || 0
      ).getTime();

      if (currentTime > existingTime) {
        latestMap.set(attempt.exam_id, attempt);
      }
    });

    return latestMap;
  }, [attempts]);

  const completedExamIds = useMemo(() => {
    const ids = new Set();

    results.forEach((result) => {
      ids.add(result.exam_id);
    });

    latestAttempts.forEach((attempt, examId) => {
      if (
        ["submitted", "terminated"].includes(attempt.status)
      ) {
        ids.add(examId);
      }
    });

    return ids;
  }, [results, latestAttempts]);

  const completedExams = useMemo(
    () =>
      exams.filter((exam) =>
        completedExamIds.has(exam.id)
      ),
    [exams, completedExamIds]
  );

  const averageScore = results.length
    ? Math.round(
        results.reduce(
          (sum, result) =>
            sum + Number(result.marks_obtained || 0),
          0
        ) / results.length
      )
    : 0;

  const bestScore = results.length
    ? Math.max(
        ...results.map((result) =>
          Number(result.marks_obtained || 0)
        )
      )
    : 0;

  const handleLogout = async () => {
    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      alert(logoutError.message);
      return;
    }

    navigate("/login", { replace: true });
  };

  // Start or resume the examination route.
  // The database RPC remains the final authority for attempt permission.
  const startExam = (exam) => {
    const attempt = getAttempt(exam.id);

    if (attempt?.status === "submitted") {
      alert("You have already submitted this examination.");
      return;
    }

    if (attempt?.status === "terminated") {
      alert(
        "Your attempt has been terminated. Please contact the administrator to request a retry."
      );
      return;
    }

    if (attempt?.status === "in_progress") {
      navigate(`/exam/${exam.id}`);
      return;
    }

    // No attempt or latest attempt was revoked.
    navigate(`/exam/${exam.id}`);
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const historyRows = results.filter((result) => {
    if (historyFilter === "all") return true;

    const exam = exams.find(
      (item) => item.id === result.exam_id
    );

    return (exam?.exam_name || "")
      .toLowerCase()
      .includes(historyFilter);
  });

  // Six-level series grouping.
  const seriesGroups = useMemo(() => {
    const groups = new Map();

    exams.forEach((exam) => {
      if (!exam.series_id) return;

      if (!groups.has(exam.series_id)) {
        groups.set(exam.series_id, []);
      }

      groups.get(exam.series_id).push(exam);
    });

    return [...groups.entries()].map(
      ([seriesId, seriesExams]) => ({
        seriesId,
        exams: seriesExams.sort(
          (a, b) =>
            Number(a.level_order) - Number(b.level_order)
        ),
      })
    );
  }, [exams]);

  const getLevelState = (exam) => {
    const attempt = getAttempt(exam.id);
    const result = getResult(exam.id);

    if (attempt?.status === "terminated") {
      return {
        key: "terminated",
        label: "Terminated",
      };
    }

    if (
      attempt?.status === "submitted" ||
      result
    ) {
      return {
        key: "completed",
        label: "Completed",
      };
    }

    if (attempt?.status === "in_progress") {
      return {
        key: "in_progress",
        label: "In Progress",
      };
    }

    // A revoked attempt is historical only.
    // It does not block this level from becoming available.
    const previousLevel = seriesGroups
      .flatMap((group) => group.exams)
      .find(
        (item) =>
          item.series_id === exam.series_id &&
          Number(item.level_order) ===
            Number(exam.level_order) - 1
      );

    if (Number(exam.level_order) > 1) {
      if (!previousLevel) {
        return {
          key: "locked",
          label: "Locked",
        };
      }

      const previousAttempt = getAttempt(previousLevel.id);

      if (
        previousAttempt?.status !== "submitted" &&
        !getResult(previousLevel.id)
      ) {
        return {
          key: "locked",
          label: "Locked",
        };
      }
    }

    const start = new Date(exam.exam_date).getTime();
    const end = new Date(exam.availability_end).getTime();

    if (start > now) {
      return {
        key: "upcoming",
        label: "Upcoming",
      };
    }

    if (end < now) {
      return {
        key: "closed",
        label: "Closed",
      };
    }

    return {
      key: "available",
      label: "Available",
    };
  };

  const allLevelResults = (seriesExams) =>
    seriesExams.map((exam) => ({
      exam,
      result: getResult(exam.id),
      attempt: getAttempt(exam.id),
      state: getLevelState(exam),
    }));

  const totalSeriesMarks = (seriesExams) =>
    seriesExams.reduce((sum, exam) => {
      const result = getResult(exam.id);

      return sum + Number(result?.marks_obtained || 0);
    }, 0);

  const totalCompletedLevels = (seriesExams) =>
    seriesExams.filter((exam) => {
      const attempt = getAttempt(exam.id);

      return (
        attempt?.status === "submitted" ||
        Boolean(getResult(exam.id))
      );
    }).length;

  const cards = [
    {
      title: "Upcoming Examinations",
      count: upcomingExams.length,
      icon: CalendarDays,
      target: "upcoming-exams",
    },
    {
      title: "Available Mock Tests",
      count: availableExams.length,
      icon: ClipboardList,
      target: "available-exams",
    },
    {
      title: "Completed Examinations",
      count: completedExams.length,
      icon: FileText,
      target: "completed-exams",
    },
    {
      title: "My Results",
      count: results.length,
      icon: CheckCircle,
      target: "my-results",
    },
    {
      title: "Performance Analytics",
      count: `${averageScore}%`,
      icon: ChartNoAxesColumn,
      target: "performance",
    },
    {
      title: "Leaderboard",
      count: leaderboard.length,
      icon: Trophy,
      target: "leaderboard",
    },
  ];

  if (loading) {
    return (
      <section className="dashboard-section">
        <div className="dashboard-loading">
          Loading your dashboard...
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-section">
      <div className="dashboard-container">

        {/* DASHBOARD HEADER */}
        <div className="dashboard-heading">
          <div>
            <span className="dashboard-eyebrow">
              CANDIDATE PORTAL
            </span>

            <h2>Candidate Dashboard</h2>

            <p>Welcome, {candidateName}!</p>
            <p>Welcome to Khatme Nubuwwat Quiz 2026 Portal.</p>
          </div>

          <div className="dashboard-heading-actions">
            <button
              onClick={loadDashboard}
              className="dashboard-refresh"
              disabled={loading}
              type="button"
            >
              <RefreshCw size={17} />
              Refresh
            </button>

            <button
              onClick={handleLogout}
              className="logout-button"
              type="button"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="dashboard-error">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {/* SIX LEVEL PROGRESSION */}
        <section
          className="dashboard-content-section"
          id="six-level-progress"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <Award size={22} />
                Six-Level Quiz Progress
              </h2>

              <p>
                Complete each level in order, from Foundation to Expert.
              </p>
            </div>
          </div>

          {seriesGroups.length === 0 ? (
            <div className="dashboard-empty">
              Six-level examinations will appear here once the exam series is published.
            </div>
          ) : (
            seriesGroups.map(({ seriesId, exams: seriesExams }) => {
              const completed =
                totalCompletedLevels(seriesExams);

              const marks =
                totalSeriesMarks(seriesExams);

              const percentage =
                Math.round((marks / 600) * 10000) / 100;

              const levels =
                allLevelResults(seriesExams);

              const allCompleted = completed === 6;

              return (
                <article
                  key={seriesId}
                  style={{
                    background: "#fff",
                    border: "1px solid #dce9e1",
                    borderRadius: 14,
                    padding: 20,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <h3 style={{ margin: "0 0 5px" }}>
                        ISLAMIC QUIZ 2026 — SIX LEVELS
                      </h3>

                      <p
                        style={{
                          margin: 0,
                          color: "#718078",
                          fontSize: 13,
                        }}
                      >
                        {completed} of 6 levels completed
                      </p>
                    </div>

                    <span
                      style={{
                        color: allCompleted ? "#08734e" : "#8b6b20",
                        background: allCompleted ? "#e6f4eb" : "#fff5d9",
                        borderRadius: 20,
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {allCompleted
                        ? "ALL LEVELS COMPLETED"
                        : "IN PROGRESS"}
                    </span>
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 20,
                      background: "#e8eee9",
                      overflow: "hidden",
                      margin: "18px 0",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(completed / 6) * 100}%`,
                        background: "#08734e",
                        borderRadius: 20,
                        transition: "width .3s",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(145px,1fr))",
                      gap: 12,
                    }}
                  >
                    {levels.map(({ exam, result, attempt, state }) => {
                      const levelName =
                        exam.level_name ||
                        LEVELS[Number(exam.level_order) - 1] ||
                        exam.exam_name;

                      const color =
                        state.key === "completed"
                          ? "#08734e"
                          : state.key === "available"
                            ? "#1764a0"
                            : state.key === "terminated"
                              ? "#b42318"
                              : "#78847d";

                      const Icon =
                        state.key === "completed"
                          ? CheckCircle
                          : state.key === "available"
                            ? Play
                            : state.key === "terminated"
                              ? AlertTriangle
                              : Lock;

                      return (
                        <div
                          key={exam.id}
                          style={{
                            border: `1px solid ${color}44`,
                            borderRadius: 10,
                            padding: 13,
                            background: `${color}08`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <strong style={{ fontSize: 13 }}>
                              {Number(exam.level_order)}. {levelName}
                            </strong>

                            <Icon size={17} color={color} />
                          </div>

                          <div
                            style={{
                              color,
                              fontWeight: 700,
                              fontSize: 11,
                              marginTop: 8,
                            }}
                          >
                            {state.label.toUpperCase()}
                          </div>

                          {result && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              {result.marks_obtained}/100
                            </div>
                          )}

                          {attempt?.status === "in_progress" && (
                            <div
                              style={{
                                fontSize: 11,
                                marginTop: 7,
                                color: "#718078",
                              }}
                            >
                              Attempt already started
                            </div>
                          )}

                          {state.key === "available" && (
                            <button
                              type="button"
                              onClick={() => startExam(exam)}
                              style={{
                                width: "100%",
                                marginTop: 10,
                                padding: "9px 8px",
                                border: 0,
                                borderRadius: 7,
                                background: "#08734e",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              <Play
                                size={13}
                                style={{
                                  verticalAlign: "middle",
                                  marginRight: 5,
                                }}
                              />
                              {attempt?.status === "revoked"
                                ? "Retry Level"
                                : "Start Level"}
                            </button>
                          )}

                          {state.key === "upcoming" && (
                            <div
                              style={{
                                fontSize: 11,
                                marginTop: 8,
                                color: "#718078",
                              }}
                            >
                              Opens:{" "}
                              {new Date(
                                exam.exam_date
                              ).toLocaleDateString("en-IN")}
                            </div>
                          )}

                          {state.key === "terminated" && (
                            <div
                              style={{
                                fontSize: 11,
                                marginTop: 8,
                                color: "#b42318",
                              }}
                            >
                              This attempt is terminated. Contact the administrator for a retry.
                            </div>
                          )}

                          {state.key === "in_progress" && (
                            <button
                              type="button"
                              onClick={() => startExam(exam)}
                              style={{
                                width: "100%",
                                marginTop: 10,
                                padding: "9px 8px",
                                border: 0,
                                borderRadius: 7,
                                background: "#1764a0",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              Resume Exam
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 12,
                      marginTop: 20,
                    }}
                  >
                    <div
                      style={{
                        padding: 15,
                        borderRadius: 9,
                        background: "#edf5ef",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#607268" }}>
                        Overall Marks
                      </span>

                      <h2 style={{ margin: "5px 0", color: "#08734e" }}>
                        {marks}/600
                      </h2>
                    </div>

                    <div
                      style={{
                        padding: 15,
                        borderRadius: 9,
                        background: "#edf5ef",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#607268" }}>
                        Overall Percentage
                      </span>

                      <h2 style={{ margin: "5px 0", color: "#08734e" }}>
                        {percentage}%
                      </h2>
                    </div>

                    <div
                      style={{
                        padding: 15,
                        borderRadius: 9,
                        background: "#edf5ef",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#607268" }}>
                        Levels Completed
                      </span>

                      <h2 style={{ margin: "5px 0", color: "#08734e" }}>
                        {completed}/6
                      </h2>
                    </div>
                  </div>

                  {allCompleted && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 14,
                        borderRadius: 9,
                        background: "#e6f4eb",
                        color: "#08734e",
                        fontWeight: 700,
                      }}
                    >
                      <ShieldCheck
                        size={18}
                        style={{
                          verticalAlign: "middle",
                          marginRight: 7,
                        }}
                      />
                      Congratulations! You have completed all six levels.
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        {/* DASHBOARD QUICK CARDS */}
        <div className="dashboard-grid">
          {cards.map((item) => {
            const Icon = item.icon;

            return (
              <button
                type="button"
                className="dashboard-card"
                key={item.title}
                onClick={() => scrollToSection(item.target)}
              >
                <Icon size={29} />
                <h3>{item.title}</h3>
                <strong>{item.count}</strong>
              </button>
            );
          })}

          <button
            type="button"
            className="dashboard-card"
            onClick={() => navigate("/profile")}
          >
            <UserRound size={29} />
            <h3>My Profile & Settings</h3>
            <span>View Profile</span>
          </button>
        </div>

        {/* UPCOMING EXAMS */}
        <section
          className="dashboard-content-section"
          id="upcoming-exams"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <CalendarDays size={21} />
                Upcoming Examinations
              </h2>
              <p>
                Published examinations scheduled for a future date.
              </p>
            </div>
          </div>

          {upcomingExams.length === 0 ? (
            <div className="dashboard-empty">
              No upcoming examinations currently.
            </div>
          ) : (
            <div className="dashboard-exam-list">
              {upcomingExams.map((exam) => (
                <article
                  className="dashboard-exam-card"
                  key={exam.id}
                >
                  <div>
                    <span className="dashboard-status upcoming">
                      UPCOMING
                    </span>

                    <h3>{exam.exam_name}</h3>

                    <p>
                      <CalendarDays size={15} />
                      {" "}
                      {new Date(exam.exam_date).toLocaleString("en-IN")}
                    </p>

                    <p>
                      <Clock size={15} />
                      {" "}
                      {exam.duration_minutes} minutes · 100 questions
                    </p>
                  </div>

                  <span className="dashboard-date-note">
                    Not started yet
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* AVAILABLE EXAMS */}
        <section
          className="dashboard-content-section"
          id="available-exams"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <ClipboardList size={21} />
                Available Mock Tests
              </h2>

              <p>
                Examinations currently open for candidates.
              </p>
            </div>
          </div>

          {availableExams.length === 0 ? (
            <div className="dashboard-empty">
              No examinations are available right now.
            </div>
          ) : (
            <div className="dashboard-exam-list">
              {availableExams.map((exam) => {
                const attempt = getAttempt(exam.id);

                const state = exam.series_id
                  ? getLevelState(exam)
                  : null;

                const canStart =
                  !attempt ||
                  attempt.status === "revoked";

                return (
                  <article
                    className="dashboard-exam-card"
                    key={exam.id}
                  >
                    <div>
                      <span className="dashboard-status available">
                        AVAILABLE
                      </span>

                      <h3>{exam.exam_name}</h3>

                      <p>
                        <Clock size={15} />
                        {" "}
                        Duration: {exam.duration_minutes} minutes
                      </p>

                      <p>
                        Closes:{" "}
                        {new Date(
                          exam.availability_end
                        ).toLocaleString("en-IN")}
                      </p>
                    </div>

                    {canStart &&
                    (!state || state.key === "available") ? (
                      <button
                        type="button"
                        className="dashboard-start-button"
                        onClick={() => startExam(exam)}
                      >
                        <Play size={16} />
                        {attempt?.status === "revoked"
                          ? "Retry Exam"
                          : "Start Exam"}
                      </button>
                    ) : attempt?.status === "terminated" ? (
                      <span className="dashboard-attempt-note">
                        Attempt terminated
                      </span>
                    ) : attempt?.status === "submitted" ? (
                      <span className="dashboard-attempt-note">
                        Attempt submitted
                      </span>
                    ) : attempt?.status === "in_progress" ? (
                      <button
                        type="button"
                        className="dashboard-start-button"
                        onClick={() => startExam(exam)}
                      >
                        <Play size={16} />
                        Resume Exam
                      </button>
                    ) : (
                      <span className="dashboard-attempt-note">
                        {state?.label || "Unavailable"}
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* COMPLETED EXAMS */}
        <section
          className="dashboard-content-section"
          id="completed-exams"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <FileText size={21} />
                Completed Examinations
              </h2>

              <p>
                Your submitted and terminated examination attempts.
              </p>
            </div>
          </div>

          {completedExams.length === 0 ? (
            <div className="dashboard-empty">
              You have no completed examinations yet.
            </div>
          ) : (
            <div className="dashboard-exam-list">
              {completedExams.map((exam) => {
                const result = getResult(exam.id);
                const attempt = getAttempt(exam.id);

                return (
                  <article
                    className="dashboard-exam-card"
                    key={exam.id}
                  >
                    <div>
                      <span
                        className={`dashboard-status ${
                          result ? "completed" : "terminated"
                        }`}
                      >
                        {result ? "SUBMITTED" : "TERMINATED"}
                      </span>

                      <h3>{exam.exam_name}</h3>

                      <p>
                        {result
                          ? `Score: ${result.marks_obtained}/100`
                          : "No result available for terminated attempt."}
                      </p>

                      <p>
                        {attempt?.submitted_at
                          ? new Date(
                              attempt.submitted_at
                            ).toLocaleString("en-IN")
                          : ""}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* RESULTS */}
        <section
          className="dashboard-content-section"
          id="my-results"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <CheckCircle size={21} />
                My Results & Reports
              </h2>

              <p>
                Your individual examination result history and printable marksheets.
              </p>
            </div>
          </div>

          <div className="dashboard-history-filter">
            <label htmlFor="history-filter">
              Filter results
            </label>

            <select
              id="history-filter"
              value={historyFilter}
              onChange={(event) =>
                setHistoryFilter(event.target.value)
              }
            >
              <option value="all">All results</option>

              {exams.map((exam) => (
                <option
                  key={exam.id}
                  value={exam.exam_name.toLowerCase()}
                >
                  {exam.exam_name}
                </option>
              ))}
            </select>
          </div>

          {historyRows.length === 0 ? (
            <div className="dashboard-empty">
              Your results will appear here after submission.
            </div>
          ) : (
            <div className="dashboard-result-list">
              {historyRows.map((result) => {
                const exam = exams.find(
                  (item) => item.id === result.exam_id
                );

                return (
                  <article
                    className="dashboard-result-card"
                    key={result.id}
                  >
                    <div>
                      <h3>
                        {exam?.exam_name || "Islamic Quiz Examination"}
                      </h3>

                      <p>
                        {result.published_at
                          ? new Date(
                              result.published_at
                            ).toLocaleString("en-IN")
                          : "—"}
                      </p>

                      <p>
                        {result.attempted_questions ?? 0} attempted ·{" "}
                        {result.correct_answers} correct ·{" "}
                        {result.wrong_answers} wrong
                      </p>
                    </div>

                    <div className="dashboard-result-marks">
                      <strong>
                        {result.marks_obtained}/100
                      </strong>

                      <span>
                        {result.correct_answers} correct ·{" "}
                        {result.wrong_answers} wrong
                      </span>

                      <button
                        type="button"
                        className="dashboard-report-button"
                        onClick={() =>
                          printResultReport(
                            result,
                            exam,
                            candidateName
                          )
                        }
                      >
                        <Download size={16} />
                        Download Marksheet
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* PERFORMANCE */}
        <section
          className="dashboard-content-section"
          id="performance"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <TrendingUp size={21} />
                Performance Analytics
              </h2>

              <p>Your personal score summary.</p>
            </div>
          </div>

          <div className="dashboard-analytics-grid">
            <article>
              <span>Exams Attempted</span>
              <strong>{results.length}</strong>
            </article>

            <article>
              <span>Average Score</span>
              <strong>{averageScore}/100</strong>
            </article>

            <article>
              <span>Best Score</span>
              <strong>{bestScore}/100</strong>
            </article>

            <article>
              <span>Total Correct Answers</span>
              <strong>
                {results.reduce(
                  (sum, result) =>
                    sum + Number(result.correct_answers || 0),
                  0
                )}
              </strong>
            </article>
          </div>
        </section>

        {/* LEADERBOARD */}
        <section
          className="dashboard-content-section"
          id="leaderboard"
        >
          <div className="dashboard-section-heading">
            <div>
              <h2>
                <Trophy size={21} />
                Leaderboard
              </h2>

              <p>
                Top candidates across submitted examinations.
              </p>
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="dashboard-empty">
              The leaderboard will appear when examination results are available.
            </div>
          ) : (
            <div className="dashboard-leaderboard">
              {leaderboard.map((person) => (
                <article
                  key={`${person.candidate_rank}-${person.candidate_name}-${person.exam_name}`}
                >
                  <span className="dashboard-rank">
                    {person.candidate_rank <= 3
                      ? <Medal size={19} />
                      : `#${person.candidate_rank}`}
                  </span>

                  <div>
                    <strong>{person.candidate_name}</strong>
                    <small>{person.exam_name}</small>
                  </div>

                  <b>{person.marks}/100</b>
                </article>
              ))}
            </div>
          )}
        </section>

      </div>
    </section>
  );
}

export default Dashboard;
