
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "./supabase";

function ExamHistory() {
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [examNames, setExamNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) {
        navigate("/login");
        return;
      }

      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status, started_at, submitted_at, termination_reason")
        .eq("candidate_id", userData.user.id)
        .order("started_at", { ascending: false });

      if (error) throw error;

      setAttempts(data || []);

      const ids = [...new Set((data || []).map((item) => item.exam_id))];

      if (ids.length) {
        const { data: exams, error: examError } = await supabase
          .from("exams")
          .select("id, exam_name, level_name")
          .in("id", ids);

        if (examError) throw examError;

        const names = {};
        (exams || []).forEach((exam) => {
          names[exam.id] = exam.level_name || exam.exam_name;
        });
        setExamNames(names);
      }
    } catch (err) {
      setError(err.message || "Unable to load examination history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const statusIcon = (status) => {
    if (status === "submitted") return <CheckCircle color="#08734e" />;
    if (status === "terminated") return <AlertTriangle color="#b42318" />;
    return <Clock color="#b7791f" />;
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <button style={styles.back} onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={18} /> Dashboard
        </button>

        <h1>MY EXAMINATION HISTORY</h1>
        <p style={styles.subtitle}>
          Your previous examination attempts and their status.
        </p>

        {error && <p style={styles.error}>{error}</p>}

        {loading ? (
          <p>Loading your history...</p>
        ) : attempts.length === 0 ? (
          <section style={styles.empty}>
            <FileText size={38} />
            <h3>No examination history yet</h3>
            <p>Your exam attempts will appear here.</p>
          </section>
        ) : (
          <div style={styles.list}>
            {attempts.map((attempt) => (
              <article key={attempt.id} style={styles.card}>
                <div style={styles.icon}>{statusIcon(attempt.status)}</div>

                <div style={{ flex: 1 }}>
                  <h3>{examNames[attempt.exam_id] || "Islamic Quiz Examination"}</h3>
                  <p style={styles.meta}>
                    Started: {new Date(attempt.started_at).toLocaleString()}
                  </p>
                  {attempt.submitted_at && (
                    <p style={styles.meta}>
                      Completed: {new Date(attempt.submitted_at).toLocaleString()}
                    </p>
                  )}
                  {attempt.termination_reason && (
                    <p style={styles.reason}>
                      Reason: {attempt.termination_reason}
                    </p>
                  )}
                  <span style={styles.status}>
                    {attempt.status.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: "75vh", background: "#f5f7f4", padding: "35px 16px", color: "#173d32" },
  container: { maxWidth: 900, margin: "auto" },
  back: { display: "flex", gap: 8, alignItems: "center", border: 0, background: "transparent", color: "#176b50", cursor: "pointer", marginBottom: 22 },
  subtitle: { color: "#718078", marginBottom: 25 },
  list: { display: "grid", gap: 13 },
  card: { display: "flex", gap: 15, alignItems: "flex-start", background: "white", padding: 20, borderRadius: 12, border: "1px solid #e5ebe6" },
  icon: { paddingTop: 4 },
  meta: { fontSize: 13, color: "#718078", margin: "5px 0" },
  status: { display: "inline-block", marginTop: 7, fontSize: 11, fontWeight: 700, background: "#edf5ef", padding: "5px 9px", borderRadius: 20 },
  reason: { color: "#b42318", fontSize: 13 },
  empty: { background: "white", textAlign: "center", padding: 45, borderRadius: 12 },
  error: { color: "#b42318" }
};

export default ExamHistory;
