
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Trophy, Search,
  Users, FileText, AlertTriangle, Download
} from "lucide-react";
import { supabase } from "./supabase";
import "./AdminResults.css";

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCSV(filename, headers, rows) {
  const content = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export default function AdminResults() {
  const navigate = useNavigate();

  const [results, setResults] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [exams, setExams] = useState([]);
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
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
        !["admin", "super_admin"].includes(profile?.role)
      ) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const [r, a, p, e] = await Promise.all([
        supabase.from("exam_results")
          .select("*")
          .order("published_at", { ascending: false }),

        supabase.from("exam_attempts")
          .select("*")
          .order("started_at", { ascending: false }),

        supabase.from("profiles")
          .select("id, full_name, mobile_number, email"),

        supabase.from("exams")
          .select("id, exam_name")
          .order("created_at", { ascending: false })
      ]);

      if (r.error) throw r.error;
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      if (e.error) throw e.error;

      setResults(r.data || []);
      setAttempts(a.data || []);
      setProfiles(p.data || []);
      setExams(e.data || []);
    } catch (err) {
      setError(err.message || "Unable to load results.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows = useMemo(() => {
    const sorted = [...results].sort((a, b) =>
      String(a.exam_id).localeCompare(String(b.exam_id)) ||
      Number(b.marks_obtained) - Number(a.marks_obtained) ||
      new Date(a.published_at) - new Date(b.published_at)
    );

    const rankByExam = {};
    const previousByExam = {};

    return sorted.map((result) => {
      const examId = result.exam_id;
      rankByExam[examId] = (rankByExam[examId] || 0) + 1;

      const previous = previousByExam[examId];
      const rank =
        previous && previous.marks === Number(result.marks_obtained)
          ? previous.rank
          : rankByExam[examId];

      previousByExam[examId] = {
        marks: Number(result.marks_obtained),
        rank
      };

      return {
        ...result,
        candidate: profiles.find((p) => p.id === result.candidate_id),
        exam: exams.find((e) => e.id === result.exam_id),
        rank
      };
    });
  }, [results, profiles, exams]);

  const filteredRows = rows.filter((row) => {
    const term = search.toLowerCase();

    const matchesSearch =
      (row.candidate?.full_name || "").toLowerCase().includes(term) ||
      (row.candidate?.email || "").toLowerCase().includes(term) ||
      (row.candidate?.mobile_number || "").includes(term);

    return matchesSearch &&
      (examFilter === "all" || row.exam_id === examFilter);
  });

  const terminated = attempts.filter(
    (attempt) => attempt.status === "terminated"
  );

  const exportResults = () => {
    if (!filteredRows.length) {
      alert("There are no results to export.");
      return;
    }

    const headers = [
      "Rank",
      "Candidate Name",
      "Email",
      "Mobile",
      "Examination",
      "Total Questions",
      "Attempted",
      "Correct",
      "Wrong",
      "Marks",
      "Submitted At"
    ];

    const data = filteredRows.map((row) => [
      row.rank,
      row.candidate?.full_name || "",
      row.candidate?.email || "",
      row.candidate?.mobile_number || "",
      row.exam?.exam_name || "",
      row.total_questions ?? 100,
      row.attempted_questions ?? "",
      row.correct_answers ?? 0,
      row.wrong_answers ?? 0,
      row.marks_obtained ?? 0,
      row.published_at
        ? new Date(row.published_at).toLocaleString()
        : ""
    ]);

    downloadCSV("Islamic-Quiz-Results.csv", headers, data);
  };

  const exportTerminated = () => {
    if (!terminated.length) {
      alert("There are no terminated attempts to export.");
      return;
    }

    const headers = [
      "Candidate Name",
      "Email",
      "Mobile",
      "Examination",
      "Status",
      "Termination Reason",
      "Started At",
      "Terminated At"
    ];

    const data = terminated.map((attempt) => {
      const candidate = profiles.find(
        (p) => p.id === attempt.candidate_id
      );
      const exam = exams.find((e) => e.id === attempt.exam_id);

      return [
        candidate?.full_name || "",
        candidate?.email || "",
        candidate?.mobile_number || "",
        exam?.exam_name || "",
        attempt.status,
        attempt.termination_reason || "",
        attempt.started_at
          ? new Date(attempt.started_at).toLocaleString()
          : "",
        attempt.submitted_at
          ? new Date(attempt.submitted_at).toLocaleString()
          : ""
      ];
    });

    downloadCSV("Islamic-Quiz-Terminated-Attempts.csv", headers, data);
  };

  return (
    <main className="admin-results-page">
      <div className="admin-results-container">
        <button
          className="admin-results-back"
          onClick={() => navigate("/admin")}
        >
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <header className="admin-results-header">
          <div>
            <span>ADMINISTRATION</span>
            <h1>RESULTS & RANKINGS</h1>
            <p>Candidate examination performance and attempt records.</p>
          </div>

          <button onClick={loadData} disabled={loading}>
            <RefreshCw size={17} /> Refresh
          </button>
        </header>

        {error && (
          <div className="admin-results-error">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        <div className="admin-results-stats">
          <article>
            <Users />
            <span>Total Candidates</span>
            <strong>{profiles.length}</strong>
          </article>
          <article>
            <FileText />
            <span>Submitted Results</span>
            <strong>{results.length}</strong>
          </article>
          <article>
            <Trophy />
            <span>Examinations</span>
            <strong>{exams.length}</strong>
          </article>
          <article>
            <AlertTriangle />
            <span>Terminated Attempts</span>
            <strong>{terminated.length}</strong>
          </article>
        </div>

        <section className="admin-results-panel">
          <div className="admin-results-panel-heading">
            <h2>Candidate Results</h2>
            <button
              className="admin-results-export"
              onClick={exportResults}
              disabled={loading || filteredRows.length === 0}
            >
              <Download size={17} /> Export Results CSV
            </button>
          </div>

          <div className="admin-results-filters">
            <div className="admin-results-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidate name, email or mobile"
              />
            </div>

            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
            >
              <option value="all">All examinations</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.exam_name}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p>Loading results...</p>
          ) : filteredRows.length === 0 ? (
            <p className="admin-results-empty">
              No submitted results found.
            </p>
          ) : (
            <div className="admin-results-table-wrap">
              <table className="admin-results-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Candidate</th>
                    <th>Examination</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Marks</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>#{row.rank}</strong></td>
                      <td>
                        <strong>{row.candidate?.full_name || "Candidate"}</strong>
                        <small>{row.candidate?.email || ""}</small>
                        <small>{row.candidate?.mobile_number || ""}</small>
                      </td>
                      <td>{row.exam?.exam_name || "Examination"}</td>
                      <td>{row.correct_answers}</td>
                      <td>{row.wrong_answers}</td>
                      <td><strong>{row.marks_obtained}/100</strong></td>
                      <td>
                        {row.published_at
                          ? new Date(row.published_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-results-panel">
          <div className="admin-results-panel-heading">
            <h2>Terminated Examination Attempts</h2>
            <button
              className="admin-results-export"
              onClick={exportTerminated}
              disabled={loading || terminated.length === 0}
            >
              <Download size={17} /> Export Terminated CSV
            </button>
          </div>

          {terminated.length === 0 ? (
            <p className="admin-results-empty">
              No terminated attempts.
            </p>
          ) : (
            <div className="admin-results-table-wrap">
              <table className="admin-results-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Examination</th>
                    <th>Reason</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {terminated.map((attempt) => {
                    const candidate = profiles.find(
                      (p) => p.id === attempt.candidate_id
                    );
                    const exam = exams.find(
                      (e) => e.id === attempt.exam_id
                    );

                    return (
                      <tr key={attempt.id}>
                        <td>{candidate?.full_name || "Candidate"}</td>
                        <td>{exam?.exam_name || "Examination"}</td>
                        <td>{attempt.termination_reason || "Terminated"}</td>
                        <td>
                          {attempt.submitted_at
                            ? new Date(attempt.submitted_at).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
