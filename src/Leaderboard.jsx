
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trophy, Medal, RefreshCw } from "lucide-react";
import { supabase } from "./supabase";

function Leaderboard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const examId = params.get("examId");
  const seriesId = params.get("seriesId");
  const overall = params.get("overall") === "true";

  const [rows, setRows] = useState([]);
  const [examName, setExamName] = useState("Leaderboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLeaderboard = async () => {
    setLoading(true);
    setError("");

    try {
      if (overall) {
        if (!seriesId) throw new Error("Quiz series was not specified.");

        setExamName("Overall Six-Level Leaderboard");

        const { data, error } = await supabase.rpc(
          "get_six_level_overall_leaderboard",
          { p_series_id: seriesId }
        );

        if (error) throw error;
        setRows(data || []);
      } else {
        if (!examId) throw new Error("Examination was not specified.");

        const { data: exam, error: examError } = await supabase
          .from("exams")
          .select("exam_name, level_name")
          .eq("id", examId)
          .single();

        if (examError) throw examError;

        setExamName(
          `${exam.level_name || exam.exam_name} Leaderboard`
        );

        const { data, error } = await supabase.rpc(
          "get_quiz_leaderboard",
          { p_exam_id: examId }
        );

        if (error) throw error;
        setRows(data || []);
      }
    } catch (err) {
      setError(err.message || "Unable to load leaderboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, [examId, seriesId, overall]);

  const getRankIcon = (rank) => {
    if (Number(rank) === 1) return "🥇";
    if (Number(rank) === 2) return "🥈";
    if (Number(rank) === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <button style={styles.back} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>

        <header style={styles.header}>
          <Trophy size={38} color="#c49a38" />
          <h1>{examName}</h1>
          <p>
            {overall
              ? "Combined ranking across all six examination levels · 600 marks"
              : "Candidate rankings for this examination"}
          </p>
        </header>

        {error && <p style={styles.error}>{error}</p>}

        {loading ? (
          <p style={styles.center}>Loading leaderboard...</p>
        ) : rows.length === 0 ? (
          <p style={styles.center}>No leaderboard results are available yet.</p>
        ) : (
          <section style={styles.card}>
            <div style={styles.tableHeader}>
              <span>RANK</span>
              <span>CANDIDATE</span>
              <span>MARKS</span>
            </div>

            {rows.map((row, index) => {
              const rank = row.candidate_rank ?? row.rank ?? index + 1;
              const marks = Number(
                row.total_marks ?? row.marks ?? row.marks_obtained ?? 0
              );

              return (
                <div key={row.candidate_id || index} style={styles.row}>
                  <strong style={styles.rank}>
                    {getRankIcon(rank)}
                  </strong>

                  <div>
                    <strong>
                      {row.candidate_name || row.full_name || "Candidate"}
                    </strong>
                    {overall && (
                      <small style={styles.small}>
                        {row.completed_levels ?? 0} of 6 levels completed
                      </small>
                    )}
                  </div>

                  <strong style={styles.marks}>
                    {marks}/{overall ? 600 : 100}
                  </strong>
                </div>
              );
            })}
          </section>
        )}

        <button style={styles.refresh} onClick={loadLeaderboard}>
          <RefreshCw size={16} /> Refresh Leaderboard
        </button>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "75vh",
    background: "#f5f7f4",
    padding: "35px 16px",
    color: "#173d32"
  },
  container: { maxWidth: 900, margin: "auto" },
  back: {
    display: "flex", gap: 8, alignItems: "center",
    border: 0, background: "transparent", color: "#176b50",
    cursor: "pointer", marginBottom: 22
  },
  header: { textAlign: "center", marginBottom: 28 },
  card: {
    background: "white", borderRadius: 14,
    padding: 18, boxShadow: "0 5px 22px #173d3210"
  },
  tableHeader: {
    display: "grid", gridTemplateColumns: "90px 1fr 100px",
    padding: 12, color: "#718078", fontSize: 12,
    fontWeight: 700, borderBottom: "1px solid #e5ebe6"
  },
  row: {
    display: "grid", gridTemplateColumns: "90px 1fr 100px",
    alignItems: "center", padding: "17px 12px",
    borderBottom: "1px solid #edf1ed", gap: 8
  },
  rank: { fontSize: 18 },
  marks: { textAlign: "right", color: "#176b50" },
  small: { display: "block", color: "#718078", marginTop: 4 },
  center: { textAlign: "center", padding: 35 },
  error: { color: "#b42318", textAlign: "center" },
  refresh: {
    display: "flex", gap: 8, alignItems: "center",
    margin: "22px auto", padding: "11px 18px",
    border: "1px solid #176b50", color: "#176b50",
    background: "white", borderRadius: 8, cursor: "pointer"
  }
};

export default Leaderboard;
