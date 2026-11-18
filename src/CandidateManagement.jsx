
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
  CheckCircle,
  History,
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
  const [revokeHistory, setRevokeHistory] = useState([]);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError("");

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

  const dateText = (value) =>
    value ? new Date(value).toLocaleString("en-IN") : "—";

  const loadAttempts = async (candidate, options = {}) => {
    setSelected(candidate);
    setAttempts([]);
    setRevokeHistory([]);
    setAttemptLoading(true);
    setError("");

    if (!options.keepNotice) {
      setNotice("");
    }

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

      // Load permanent termination revoke history.
      const { data: historyRows, error: historyError } = await supabase
        .from("quiz_termination_revoke_history")
        .select(
          "id, attempt_id, candidate_id, exam_id, admin_id, termination_reason, revoked_at"
        )
        .eq("candidate_id", candidate.id)
        .order("revoked_at", { ascending: false });

      if (historyError) throw historyError;

      const adminIds = [
        ...new Set((historyRows || []).map((row) => row.admin_id)),
      ];

      let adminMap = {};

      if (adminIds.length) {
        const { data: admins, error: adminError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", adminIds);

        if (adminError) throw adminError;

        adminMap = Object.fromEntries(
          (admins || []).map((admin) => [admin.id, admin])
        );
      }

      setRevokeHistory(
        (historyRows || []).map((row) => ({
          ...row,
          admin: adminMap[row.admin_id] || null,
          exam: examMap[row.exam_id] || null,
        }))
      );
    } catch (err) {
      setError(err.message || "Unable to load candidate attempts and history.");
    } finally {
      setAttemptLoading(false);
    }
  };

  const revokeTermination = async (attempt) => {
    const confirmed = window.confirm(
      "REVOKE TERMINATION?\n\n" +
        "The candidate will be allowed to start a fresh attempt.\n\n" +
        "The old attempt and termination reason will remain permanently in history.\n\n" +
        "Continue?"
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
        throw new Error(
          data?.message || "Revoke operation was not confirmed."
        );
      }

      // Reload attempts and permanent audit history.
      await loadAttempts(selected, { keepNotice: true });

      setNotice(
        "SUCCESS! Termination revoked successfully. The previous attempt and its termination history have been preserved. The candidate can now start a fresh attempt."
      );
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
      ].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
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

  const statusStyle = (status) => {
    const colors = {
      in_progress: ["#dbeafe", "#1d4ed8"],
      submitted: ["#dcfce7", "#166534"],
      terminated: ["#fee2e2", "#b91c1c"],
      revoked: ["#fef3c7", "#92400e"],
    };

    const [background, color] = colors[status] || [
      "#f1f5f9",
      "#475569",
    ];

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

  const closeAttempts = () => {
    setSelected(null);
    setAttempts([]);
    setRevokeHistory([]);
    setNotice("");
    setError("");
  };

  return (
    <main style={s.page}>
      <div style={s.container}>
        <button
          style={s.back}
          onClick={() => navigate("/admin")}
          type="button"
        >
          <ArrowLeft size={18} /> Admin Dashboard
        </button>

        <div style={s.heading}>
          <div>
            <h1 style={s.title}>CANDIDATE MANAGEMENT</h1>
            <p style={s.muted}>
              Candidate records, examination attempts and termination history.
            </p>
          </div>

          <div style={s.actions}>
            <button
              style={s.secondaryButton}
              onClick={loadCandidates}
              type="button"
            >
              <RefreshCw size={16} /> Refresh
            </button>

            <button
              style={s.primaryButton}
              onClick={exportCSV}
              type="button"
            >
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

        {error && (
          <div style={s.error}>
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div style={s.success}>
            <CheckCircle size={19} />
            <span>{notice}</span>
          </div>
        )}

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
                      <small style={s.small}>
                        {candidate.mobile_number || "—"}
                      </small>
                    </td>

                    <td>{candidate.address || "—"}</td>
                    <td>{candidate.pin_code || "—"}</td>

                    <td>
                      {candidate.created_at
                        ? new Date(candidate.created_at).toLocaleDateString(
                            "en-IN"
                          )
                        : "—"}
                    </td>

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
                  <tr>
                    <td colSpan="6" style={{ padding: 20 }}>
                      No candidates found.
                    </td>
                  </tr>
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
                <p style={s.muted}>
                  {selected.full_name || "Candidate"} ·{" "}
                  {selected.email || ""}
                </p>
              </div>

              <div style={s.panelActions}>
                <button
                  style={s.secondaryButton}
                  onClick={closeAttempts}
                  type="button"
                >
                  <ArrowLeft size={16} /> Back to Candidates
                </button>

                <button
                  style={s.closeButton}
                  onClick={closeAttempts}
                  type="button"
                  aria-label="Close attempts"
                >
                  <X size={19} />
                </button>
              </div>
            </div>

            {attemptLoading ? (
              <p>Loading examination attempts and history...</p>
            ) : (
              <>
                {attempts.length === 0 ? (
                  <p style={s.muted}>
                    No examination attempts found for this candidate.
                  </p>
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
                          <span>
                            <Clock size={14} />
                            Created: {dateText(attempt.created_at)}
                          </span>
                          <span>
                            Started: {dateText(attempt.started_at)}
                          </span>
                          <span>
                            Ended: {dateText(attempt.submitted_at)}
                          </span>
                        </div>

                        {attempt.status === "terminated" && (
                          <div style={s.terminationBox}>
                            <strong>Termination reason</strong>
                            <p>
                              {attempt.termination_reason ||
                                "No reason recorded."}
                            </p>

                            <button
                              style={{
                                ...s.revokeButton,
                                opacity:
                                  busyAttempt === attempt.id ? 0.6 : 1,
                              }}
                              disabled={busyAttempt === attempt.id}
                              onClick={() => revokeTermination(attempt)}
                              type="button"
                            >
                              <RotateCcw size={16} />
                              {busyAttempt === attempt.id
                                ? "Revoking..."
                                : "Revoke Termination"}
                            </button>
                          </div>
                        )}

                        {attempt.status === "revoked" && (
                          <div style={s.revokedNote}>
                            <ShieldCheck size={16} />
                            This termination was revoked. This historical
                            attempt has been retained.
                            {attempt.termination_reason && (
                              <p style={{ marginBottom: 0 }}>
                                Original reason: {attempt.termination_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}

                {/* PERMANENT REVOKE AUDIT HISTORY */}
                <section style={s.historySection}>
                  <div style={s.historyHeading}>
                    <History size={20} />
                    <div>
                      <h3 style={{ margin: 0 }}>
                        TERMINATION REVOKE HISTORY
                      </h3>
                      <p style={s.muted}>
                        Permanent records of administrator revoke actions.
                      </p>
                    </div>
                  </div>

                  {revokeHistory.length === 0 ? (
                    <div style={s.historyEmpty}>
                      No termination revocations recorded for this candidate.
                    </div>
                  ) : (
                    <div style={s.historyList}>
                      {revokeHistory.map((item) => (
                        <article key={item.id} style={s.historyCard}>
                          <div style={s.historyCardTop}>
                            <strong style={{ color: "#176b50" }}>
                              <CheckCircle size={17} />
                              TERMINATION REVOKED SUCCESSFULLY
                            </strong>

                            <span style={s.historyDate}>
                              {dateText(item.revoked_at)}
                            </span>
                          </div>

                          <p>
                            <b>Examination:</b>{" "}
                            {item.exam?.exam_name || "Examination"}
                          </p>

                          <p>
                            <b>Admin:</b>{" "}
                            {item.admin?.full_name ||
                              item.admin?.email ||
                              item.admin_id}
                          </p>

                          <p>
                            <b>Original termination reason:</b>{" "}
                            {item.termination_reason || "Not recorded"}
                          </p>

                          <p>
                            <b>Previous attempt ID:</b>{" "}
                            <span style={s.idText}>{item.attempt_id}</span>
                          </p>

                          <p style={{ marginBottom: 0 }}>
                            <b>Audit record ID:</b>{" "}
                            <span style={s.idText}>{item.id}</span>
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const s = {
  page: {
    minHeight: "75vh",
    padding: "30px 16px",
    background: "#f5f7f4",
    color: "#173d32",
  },

  container: {
    maxWidth: 1250,
    margin: "auto",
  },

  back: {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    border: 0,
    background: "transparent",
    color: "#176b50",
    cursor: "pointer",
    marginBottom: 22,
    fontWeight: 700,
  },

  heading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 15,
  },

  title: {
    margin: 0,
    fontSize: 25,
    letterSpacing: ".4px",
  },

  muted: {
    color: "#718078",
    margin: "7px 0",
  },

  actions: {
    display: "flex",
    gap: 9,
    flexWrap: "wrap",
  },

  panelActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },

  primaryButton: {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    padding: "10px 14px",
    border: 0,
    color: "white",
    background: "#176b50",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  secondaryButton: {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    padding: "10px 14px",
    border: "1px solid #176b50",
    color: "#176b50",
    background: "white",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  stats: {
    background: "white",
    padding: 20,
    borderRadius: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "22px 0",
    border: "1px solid #e5ebe6",
  },

  statNumber: {
    display: "block",
    fontSize: 30,
    marginTop: 6,
  },

  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "white",
    border: "1px solid #d5e2da",
    borderRadius: 9,
    padding: "0 12px",
    marginBottom: 15,
  },

  search: {
    flex: 1,
    minWidth: 0,
    padding: 13,
    border: 0,
    outline: 0,
    background: "transparent",
  },

  tableWrap: {
    overflowX: "auto",
    background: "white",
    borderRadius: 12,
    border: "1px solid #e5ebe6",
  },

  table: {
    width: "100%",
    minWidth: 900,
    borderCollapse: "collapse",
    textAlign: "left",
  },

  small: {
    display: "block",
    color: "#718078",
    fontSize: 11,
    marginTop: 4,
    overflowWrap: "anywhere",
  },

  viewButton: {
    padding: "8px 11px",
    border: "1px solid #176b50",
    color: "#176b50",
    background: "#f0faf5",
    borderRadius: 7,
    cursor: "pointer",
    fontWeight: 700,
  },

  error: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: 12,
    background: "#fff1f0",
    color: "#b42318",
    borderRadius: 8,
    margin: "12px 0",
  },

  success: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: 14,
    background: "#ecfdf3",
    color: "#067647",
    border: "1px solid #abefc6",
    borderRadius: 8,
    margin: "12px 0",
    lineHeight: 1.6,
  },

  attemptPanel: {
    marginTop: 25,
    padding: 20,
    background: "white",
    border: "1px solid #e5ebe6",
    borderRadius: 13,
  },

  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },

  closeButton: {
    border: 0,
    background: "#f1f5f2",
    borderRadius: 8,
    padding: 9,
    cursor: "pointer",
  },

  attemptList: {
    display: "grid",
    gap: 12,
  },

  attemptCard: {
    border: "1px solid #e5ebe6",
    borderRadius: 10,
    padding: 15,
  },

  attemptTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },

  attemptMeta: {
    display: "grid",
    gap: 6,
    marginTop: 12,
    color: "#65756d",
    fontSize: 12,
  },

  terminationBox: {
    marginTop: 13,
    padding: 13,
    background: "#fff7f6",
    border: "1px solid #fee4e2",
    borderRadius: 8,
    color: "#7a271a",
  },

  revokeButton: {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
    padding: "9px 13px",
    border: 0,
    borderRadius: 7,
    background: "#176b50",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  revokedNote: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 12,
    padding: 12,
    background: "#fffaeb",
    color: "#92400e",
    borderRadius: 7,
    fontSize: 12,
  },

  historySection: {
    marginTop: 28,
    paddingTop: 22,
    borderTop: "1px solid #e5ebe6",
  },

  historyHeading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
    color: "#176b50",
  },

  historyEmpty: {
    padding: 18,
    background: "#f8faf9",
    border: "1px dashed #cbd5ce",
    borderRadius: 9,
    color: "#718078",
    fontSize: 13,
  },

  historyList: {
    display: "grid",
    gap: 12,
  },

  historyCard: {
    padding: 16,
    border: "1px solid #d1e7d8",
    background: "#f0faf4",
    borderRadius: 9,
    fontSize: 13,
    overflowWrap: "anywhere",
  },

  historyCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },

  historyDate: {
    color: "#718078",
    fontSize: 12,
  },

  idText: {
    fontSize: 11,
    overflowWrap: "anywhere",
    color: "#475569",
  },
};
