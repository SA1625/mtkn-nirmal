
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Download,
  UserRound,
  ShieldCheck,
  RotateCcw,
  X,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "./supabase";

export default function CandidateManagement() {
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [busyAttempt, setBusyAttempt] = useState("");
  const [notice, setNotice] = useState("");

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");

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

      const { data: current, error: currentError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (currentError) throw currentError;

      if (!["admin", "super_admin"].includes(current?.role)) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data, error: candidateError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, mobile_number, address, pin_code, role, created_at"
        )
        .eq("role", "candidate")
        .order("created_at", { ascending: false });

      if (candidateError) throw candidateError;

      setCandidates(data || []);
    } catch (err) {
      setError(err.message || "Unable to load candidates.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const loadAttempts = async (candidate) => {
    setSelected(candidate);
    setAttempts([]);
    setAttemptLoading(true);
    setError("");
    setNotice("");

    try {
      const { data, error: attemptsError } = await supabase
        .from("exam_attempts")
        .select(
          "id, exam_id, status, started_at, expires_at, submitted_at, termination_reason, created_at"
        )
        .eq("candidate_id", candidate.id)
        .order("created_at", { ascending: false });

      if (attemptsError) throw attemptsError;

      const rows = data || [];
      const examIds = [...new Set(rows.map((row) => row.exam_id))];

      let examMap = {};

      if (examIds.length) {
        const { data: examRows, error: examError } = await supabase
          .from("exams")
          .select("id, exam_name, level_name")
          .in("id", examIds);

        if (examError) throw examError;

        examMap = Object.fromEntries(
          (examRows || []).map((exam) => [exam.id, exam])
        );
      }

      setAttempts(
        rows.map((row) => ({
          ...row,
          exam: examMap[row.exam_id] || null,
        }))
      );
    } catch (err) {
      setError(err.message || "Unable to load candidate attempts.");
    } finally {
      setAttemptLoading(false);
    }
  };

  const revokeTermination = async (attempt) => {
    const confirmed = window.confirm(
      "Revoke this termination?\n\nThe old attempt and its termination reason will remain in history. The candidate will be allowed to start a fresh attempt."
    );

    if (!confirmed) return;

    setBusyAttempt(attempt.id);
    setError("");
    setNotice("");

    try {
      const { data, error: revokeError } = await supabase.rpc(
        "revoke_quiz_termination",
        {
          p_attempt_id: attempt.id,
        }
      );

      if (revokeError) throw revokeError;
      if (data?.success !== true) {
        throw new Error(data?.message || "Revoke operation was not confirmed.");
      }

      setNotice(
        "Termination revoked. The previous attempt remains in history. Candidate can start a new attempt."
      );

      await loadAttempts(selected);
    } catch (err) {
      setError(err.message || "Unable to revoke termination.");
    } finally {
      setBusyAttempt("");
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return candidates;

    return candidates.filter((candidate) =>
      [
        candidate.full_name,
        candidate.email,
        candidate.mobile_number,
        candidate.pin_code,
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [candidates, search]);

  const exportCSV = () => {
    const rows = [
      ["Name", "Email", "Mobile", "Address", "PIN Code", "Registration Date"],
      ...filtered.map((item) => [
        item.full_name,
        item.email,
        item.mobile_number,
        item.address,
        item.pin_code,
        item.created_at,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "islamic-quiz-candidates.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateText = (value) =>
    value ? new Date(value).toLocaleString() : "—";

  const statusStyle = (status) => {
    const colors = {
      in_progress: ["#dbeafe", "#1d4ed8"],
      submitted: ["#dcfce7", "#166534"],
      terminated: ["#fee2e2", "#b91c1c"],
      revoked: ["#fef3c7", "#92400e"],
    };

    const [background, color] = colors[status] || ["#f1f5f9", "#475569"];

    return {
      display: "inline-block",
      padding: "5px 9px",
      borderRadius: 20,
      background,
      color,
      fontSize: 11,
      fontWeight: 800,
      textTransform: "uppercase",
    };
  };

  return (
    <main style={s.page}>
      <div style={s.container}>
        <button style={s.back} onClick={() => navigate("/admin")} type="button">
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <div style={s.heading}>
          <div>
            <h1 style={s.title}>CANDIDATE MANAGEMENT</h1>
            <p style={s.muted}>Candidate records, examination attempts and termination history.</p>
          </div>

          <div style={s.actions}>
            <button style={s.secondaryButton} onClick={loadCandidates} type="button">
              <RefreshCw size={16} /> Refresh
            </button>
            <button style={s.primaryButton} onClick={exportCSV} type="button">
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        <section style={s.stats}>
          <div>
            <span style={s.muted}>Total Registered Candidates</span>
            <strong style={s.statNumber}>{candidates.length}</strong>
          </div>
          <UserRound size={28} color="#176b50" />
        </section>

        {error && <div style={s.error}><AlertTriangle size={17} /> {error}</div>}
        {notice && <div style={s.success}><ShieldCheck size={17} /> {notice}</div>}

        <div style={s.searchRow}>
          <Search size={18} color="#718078" />
          <input
            style={s.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, mobile or PIN..."
          />
        </div>

        {loading ? (
          <p>Loading candidates...</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Contact</th>
                  <th>Address</th>
                  <th>PIN Code</th>
                  <th>Registered</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.full_name || "—"}</strong>
                      <small style={s.small}>{candidate.id}</small>
                    </td>
                    <td>
                      {candidate.email || "—"}
                      <small style={s.small}>{candidate.mobile_number || "—"}</small>
                    </td>
                    <td>{candidate.address || "—"}</td>
                    <td>{candidate.pin_code || "—"}</td>
                    <td>{candidate.created_at ? new Date(candidate.created_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <button
                        style={s.viewButton}
                        onClick={() => loadAttempts(candidate)}
                        type="button"
                      >
                        View Attempts
                      </button>
                    </td>
                  </tr>
                ))}

                {!filtered.length && (
                  <tr><td colSpan="6" style={{ padding: 20 }}>No candidates found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <section style={s.attemptPanel}>
            <div style={s.panelHeader}>
              <div>
                <h2 style={{ margin: 0 }}>EXAM ATTEMPTS</h2>
                <p style={s.muted}>{selected.full_name || "Candidate"} · {selected.email || ""}</p>
              </div>
              <button
                style={s.closeButton}
                onClick={() => {
                  setSelected(null);
                  setAttempts([]);
                }}
                type="button"
                aria-label="Close attempts"
              >
                <X size={19} />
              </button>
            </div>

            {attemptLoading ? (
              <p>Loading examination attempts...</p>
            ) : attempts.length === 0 ? (
              <p style={s.muted}>No examination attempts found for this candidate.</p>
            ) : (
              <div style={s.attemptList}>
                {attempts.map((attempt) => (
                  <article key={attempt.id} style={s.attemptCard}>
                    <div style={s.attemptTop}>
                      <div>
                        <h3 style={{ margin: "0 0 5px" }}>
                          {attempt.exam?.exam_name || "Examination"}
                        </h3>
                        <span style={s.small}>
                          {attempt.exam?.level_name || "Exam attempt"}
                        </span>
                      </div>
                      <span style={statusStyle(attempt.status)}>
                        {attempt.status}
                      </span>
                    </div>

                    <div style={s.attemptMeta}>
                      <span><Clock size={14} /> Created: {dateText(attempt.created_at)}</span>
                      <span>Started: {dateText(attempt.started_at)}</span>
                      <span>Ended: {dateText(attempt.submitted_at)}</span>
                    </div>

                    {attempt.status === "terminated" && (
                      <div style={s.terminationBox}>
                        <strong>Termination reason</strong>
                        <p>{attempt.termination_reason || "No reason recorded."}</p>
                        <button
                          style={{
                            ...s.revokeButton,
                            opacity: busyAttempt === attempt.id ? 0.6 : 1,
                          }}
                          disabled={busyAttempt === attempt.id}
                          onClick={() => revokeTermination(attempt)}
                          type="button"
                        >
                          <RotateCcw size={16} />
                          {busyAttempt === attempt.id ? "Revoking..." : "Revoke Termination"}
                        </button>
                      </div>
                    )}

                    {attempt.status === "revoked" && (
                      <p style={s.revokedNote}>
                        This termination was revoked. This historical record is retained.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const s = {
  page: { minHeight: "75vh", padding: "30px 16px", background: "#f5f7f4", color: "#173d32" },
  container: { maxWidth: 1250, margin: "auto" },
  back: { display: "inline-flex", gap: 8, alignItems: "center", border: 0, background: "transparent", color: "#176b50", cursor: "pointer", marginBottom: 22, fontWeight: 700 },
  heading: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 15 },
  title: { margin: 0, fontSize: 25, letterSpacing: ".4px" },
  muted: { color: "#718078", margin: "7px 0" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" },
  primaryButton: { display: "inline-flex", gap: 8, alignItems: "center", padding: "10px 14px", border: 0, color: "white", background: "#176b50", borderRadius: 8, cursor: "pointer", fontWeight: 700 },
  secondaryButton: { display: "inline-flex", gap: 8, alignItems: "center", padding: "10px 14px", border: "1px solid #176b50", color: "#176b50", background: "white", borderRadius: 8, cursor: "pointer", fontWeight: 700 },
  stats: { background: "white", padding: 20, borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 0", border: "1px solid #e5ebe6" },
  statNumber: { display: "block", fontSize: 30, marginTop: 6 },
  searchRow: { display: "flex", alignItems: "center", gap: 10, background: "white", border: "1px solid #d5e2da", borderRadius: 9, padding: "0 12px", marginBottom: 15 },
  search: { flex: 1, minWidth: 0, padding: 13, border: 0, outline: 0, background: "transparent" },
  tableWrap: { overflowX: "auto", background: "white", borderRadius: 12, border: "1px solid #e5ebe6" },
  table: { width: "100%", minWidth: 900, borderCollapse: "collapse", textAlign: "left" },
  small: { display: "block", color: "#718078", fontSize: 11, marginTop: 4, overflowWrap: "anywhere" },
  viewButton: { padding: "8px 11px", border: "1px solid #176b50", color: "#176b50", background: "#f0faf5", borderRadius: 7, cursor: "pointer", fontWeight: 700 },
  error: { display: "flex", gap: 8, alignItems: "center", padding: 12, background: "#fff1f0", color: "#b42318", borderRadius: 8, margin: "12px 0" },
  success: { display: "flex", gap: 8, alignItems: "center", padding: 12, background: "#ecfdf3", color: "#067647", borderRadius: 8, margin: "12px 0" },
  attemptPanel: { marginTop: 25, padding: 20, background: "white", border: "1px solid #e5ebe6", borderRadius: 13 },
  panelHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 },
  closeButton: { border: 0, background: "#f1f5f2", borderRadius: 8, padding: 8, cursor: "pointer" },
  attemptList: { display: "grid", gap: 12 },
  attemptCard: { border: "1px solid #e5ebe6", borderRadius: 10, padding: 15 },
  attemptTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" },
  attemptMeta: { display: "grid", gap: 6, marginTop: 12, color: "#65756d", fontSize: 12 },
  terminationBox: { marginTop: 13, padding: 13, background: "#fff7f6", border: "1px solid #fee4e2", borderRadius: 8, color: "#7a271a" },
  revokeButton: { display: "inline-flex", gap: 8, alignItems: "center", marginTop: 8, padding: "9px 13px", border: 0, borderRadius: 7, background: "#176b50", color: "white", cursor: "pointer", fontWeight: 700 },
  revokedNote: { marginTop: 12, padding: 10, background: "#fffaeb", color: "#92400e", borderRadius: 7, fontSize: 12 },
};
