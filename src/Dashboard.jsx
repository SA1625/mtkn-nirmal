
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./Dashboard.css";
import {
  CalendarDays, ClipboardList, Trophy, FileText,
  ChartNoAxesColumn, UserRound, LogOut, Clock,
  RefreshCw, Play, CheckCircle, AlertTriangle,
  Medal, TrendingUp, Download
} from "lucide-react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function printResultReport(result, exam, candidateName) {
  const examName = exam?.exam_name || "Islamic Quiz Examination";
  const date = result.published_at
    ? new Date(result.published_at).toLocaleString()
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
      <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
      <script>window.onload=()=>window.focus();</script>
    </body>
    </html>
  `);
  popup.document.close();
}

function Dashboard() {
  const navigate = useNavigate();

  const [candidateName, setCandidateName] = useState("");
  const [userId, setUserId] = useState(null);
  const [exams, setExams] = useState([]);
  const [results, setResults] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      setUserId(user.id);

      const [
        profileResponse,
        examResponse,
        resultResponse,
        attemptResponse,
        leaderboardResponse
      ] = await Promise.all([
        supabase.from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single(),

        supabase.from("exams")
          .select("id, exam_name, exam_date, availability_end, duration_minutes, total_questions")
          .eq("status", "published")
          .order("exam_date", { ascending: true }),

        supabase.from("exam_results")
          .select("*")
          .eq("candidate_id", user.id)
          .order("published_at", { ascending: false }),

        supabase.from("exam_attempts")
          .select("*")
          .eq("candidate_id", user.id)
          .order("started_at", { ascending: false }),

        supabase.rpc("get_quiz_leaderboard", { p_exam_id: null })
      ]);

      if (profileResponse.error) throw profileResponse.error;
      if (examResponse.error) throw examResponse.error;
      if (resultResponse.error) throw resultResponse.error;
      if (attemptResponse.error) throw attemptResponse.error;

      setCandidateName(profileResponse.data?.full_name || "Candidate");
      setExams(examResponse.data || []);
      setResults(resultResponse.data || []);
      setAttempts(attemptResponse.data || []);
      setLeaderboard(
        leaderboardResponse.error ? [] : leaderboardResponse.data || []
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

  const upcomingExams = useMemo(
    () => exams.filter((exam) => new Date(exam.exam_date).getTime() > now),
    [exams, now]
  );

  const availableExams = useMemo(
    () => exams.filter((exam) => {
      const start = new Date(exam.exam_date).getTime();
      const end = new Date(exam.availability_end).getTime();
      return start <= now && end >= now;
    }),
    [exams, now]
  );

  const completedExamIds = useMemo(
    () => new Set([
      ...results.map((result) => result.exam_id),
      ...attempts
        .filter((attempt) => ["submitted", "terminated"].includes(attempt.status))
        .map((attempt) => attempt.exam_id)
    ]),
    [results, attempts]
  );

  const completedExams = useMemo(
    () => exams.filter((exam) => completedExamIds.has(exam.id)),
    [exams, completedExamIds]
  );

  const averageScore = results.length
    ? Math.round(
        results.reduce((sum, result) => sum + Number(result.marks_obtained || 0), 0) /
        results.length
      )
    : 0;

  const bestScore = results.length
    ? Math.max(...results.map((result) => Number(result.marks_obtained || 0)))
    : 0;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const getAttempt = (id) =>
    attempts.find((attempt) => attempt.exam_id === id);

  const getResult = (id) =>
    results.find((result) => result.exam_id === id);

  const startExam = (exam) => {
    const attempt = getAttempt(exam.id);

    if (attempt) {
      alert(
        attempt.status === "terminated"
          ? "Your attempt for this examination has been terminated."
          : "You have already started or completed this examination."
      );
      return;
    }

    navigate(`/exam/${exam.id}`);
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const historyRows = results.filter((result) => {
    if (historyFilter === "all") return true;
    const exam = exams.find((item) => item.id === result.exam_id);
    return (exam?.exam_name || "").toLowerCase().includes(historyFilter);
  });

  const cards = [
    { title: "Upcoming Examinations", count: upcomingExams.length, icon: CalendarDays, target: "upcoming-exams" },
    { title: "Available Mock Tests", count: availableExams.length, icon: ClipboardList, target: "available-exams" },
    { title: "Completed Examinations", count: completedExams.length, icon: FileText, target: "completed-exams" },
    { title: "My Results", count: results.length, icon: CheckCircle, target: "my-results" },
    { title: "Performance Analytics", count: `${averageScore}%`, icon: ChartNoAxesColumn, target: "performance" },
    { title: "Leaderboard", count: leaderboard.length, icon: Trophy, target: "leaderboard" }
  ];

  if (loading) {
    return (
      <section className="dashboard-section">
        <div className="dashboard-loading">Loading your dashboard...</div>
      </section>
    );
  }

  return (
    <section className="dashboard-section">
      <div className="dashboard-container">
        <div className="dashboard-heading">
          <div>
            <span className="dashboard-eyebrow">CANDIDATE PORTAL</span>
            <h2>Candidate Dashboard</h2>
            <p>Welcome, {candidateName}!</p>
            <p>Welcome to Khatme Nubuwwat Quiz 2026 Portal.</p>
          </div>

          <div className="dashboard-heading-actions">
            <button onClick={loadDashboard} className="dashboard-refresh" disabled={loading}>
              <RefreshCw size={17} /> Refresh
            </button>
            <button onClick={handleLogout} className="logout-button">
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="dashboard-error">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        <div className="dashboard-grid">
          {cards.map((item) => {
            const Icon = item.icon;
            return (
              <button className="dashboard-card" key={item.title}
                onClick={() => scrollToSection(item.target)}>
                <Icon size={29} />
                <h3>{item.title}</h3>
                <strong>{item.count}</strong>
              </button>
            );
          })}

          <button className="dashboard-card" onClick={() => navigate("/profile")}>
            <UserRound size={29} />
            <h3>My Profile & Settings</h3>
            <span>View Profile</span>
          </button>
        </div>

        <section className="dashboard-content-section" id="upcoming-exams">
          <div className="dashboard-section-heading">
            <div>
              <h2><CalendarDays size={21} /> Upcoming Examinations</h2>
              <p>Published examinations scheduled for a future date.</p>
            </div>
          </div>

          {upcomingExams.length === 0 ? (
            <div className="dashboard-empty">No upcoming examinations currently.</div>
          ) : (
            <div className="dashboard-exam-list">
              {upcomingExams.map((exam) => (
                <article className="dashboard-exam-card" key={exam.id}>
                  <div>
                    <span className="dashboard-status upcoming">UPCOMING</span>
                    <h3>{exam.exam_name}</h3>
                    <p><CalendarDays size={15} /> {new Date(exam.exam_date).toLocaleString()}</p>
                    <p><Clock size={15} /> {exam.duration_minutes} minutes · 100 questions</p>
                  </div>
                  <span className="dashboard-date-note">Not started yet</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-content-section" id="available-exams">
          <div className="dashboard-section-heading">
            <div>
              <h2><ClipboardList size={21} /> Available Mock Tests</h2>
              <p>Examinations currently open for candidates.</p>
            </div>
          </div>

          {availableExams.length === 0 ? (
            <div className="dashboard-empty">No examinations are available right now.</div>
          ) : (
            <div className="dashboard-exam-list">
              {availableExams.map((exam) => {
                const attempt = getAttempt(exam.id);

                return (
                  <article className="dashboard-exam-card" key={exam.id}>
                    <div>
                      <span className="dashboard-status available">AVAILABLE</span>
                      <h3>{exam.exam_name}</h3>
                      <p><Clock size={15} /> Duration: {exam.duration_minutes} minutes</p>
                      <p>Closes: {new Date(exam.availability_end).toLocaleString()}</p>
                    </div>

                    {attempt ? (
                      <span className="dashboard-attempt-note">
                        {attempt.status === "terminated"
                          ? "Attempt terminated"
                          : attempt.status === "submitted"
                            ? "Attempt submitted"
                            : "Attempt already started"}
                      </span>
                    ) : (
                      <button className="dashboard-start-button" onClick={() => startExam(exam)}>
                        <Play size={16} /> Start Exam
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-content-section" id="completed-exams">
          <div className="dashboard-section-heading">
            <div>
              <h2><FileText size={21} /> Completed Examinations</h2>
              <p>Your submitted and terminated examination attempts.</p>
            </div>
          </div>

          {completedExams.length === 0 ? (
            <div className="dashboard-empty">You have no completed examinations yet.</div>
          ) : (
            <div className="dashboard-exam-list">
              {completedExams.map((exam) => {
                const result = getResult(exam.id);
                const attempt = getAttempt(exam.id);

                return (
                  <article className="dashboard-exam-card" key={exam.id}>
                    <div>
                      <span className={`dashboard-status ${result ? "completed" : "terminated"}`}>
                        {result ? "SUBMITTED" : "TERMINATED"}
                      </span>
                      <h3>{exam.exam_name}</h3>
                      <p>{result ? `Score: ${result.marks_obtained}/100` : "No result available for terminated attempt."}</p>
                      <p>{attempt?.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : ""}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-content-section" id="my-results">
          <div className="dashboard-section-heading">
            <div>
              <h2><CheckCircle size={21} /> My Results & Reports</h2>
              <p>Your individual examination result history and printable marksheets.</p>
            </div>
          </div>

          <div className="dashboard-history-filter">
            <label htmlFor="history-filter">Filter results</label>
            <select
              id="history-filter"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            >
              <option value="all">All results</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.exam_name.toLowerCase()}>
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
                const exam = exams.find((item) => item.id === result.exam_id);

                return (
                  <article className="dashboard-result-card" key={result.id}>
                    <div>
                      <h3>{exam?.exam_name || "Islamic Quiz Examination"}</h3>
                      <p>{result.published_at ? new Date(result.published_at).toLocaleString() : "—"}</p>
                      <p>
                        {result.attempted_questions ?? 0} attempted ·{" "}
                        {result.correct_answers} correct · {result.wrong_answers} wrong
                      </p>
                    </div>

                    <div className="dashboard-result-marks">
                      <strong>{result.marks_obtained}/100</strong>
                      <span>{result.correct_answers} correct · {result.wrong_answers} wrong</span>
                      <button
                        type="button"
                        className="dashboard-report-button"
                        onClick={() => printResultReport(result, exam, candidateName)}
                      >
                        <Download size={16} /> Download Marksheet
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-content-section" id="performance">
          <div className="dashboard-section-heading">
            <div>
              <h2><TrendingUp size={21} /> Performance Analytics</h2>
              <p>Your personal score summary.</p>
            </div>
          </div>

          <div className="dashboard-analytics-grid">
            <article><span>Exams Attempted</span><strong>{results.length}</strong></article>
            <article><span>Average Score</span><strong>{averageScore}/100</strong></article>
            <article><span>Best Score</span><strong>{bestScore}/100</strong></article>
            <article>
              <span>Total Correct Answers</span>
              <strong>{results.reduce((sum, r) => sum + Number(r.correct_answers || 0), 0)}</strong>
            </article>
          </div>
        </section>

        <section className="dashboard-content-section" id="leaderboard">
          <div className="dashboard-section-heading">
            <div>
              <h2><Trophy size={21} /> Leaderboard</h2>
              <p>Top candidates across submitted examinations.</p>
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="dashboard-empty">
              The leaderboard will appear when examination results are available.
            </div>
          ) : (
            <div className="dashboard-leaderboard">
              {leaderboard.map((person) => (
                <article key={`${person.candidate_rank}-${person.candidate_name}-${person.exam_name}`}>
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
