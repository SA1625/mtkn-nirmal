
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  TrendingUp,
  Trophy,
  CheckCircle,
  BarChart3
} from "lucide-react";
import { supabase } from "./supabase";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert"
];

function PerformanceAnalytics() {
  const navigate = useNavigate();

  const [results, setResults] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      if (!userData.user) {
        navigate("/login", { replace: true });
        return;
      }

      const [resultResponse, examResponse] = await Promise.all([
        supabase
          .from("exam_results")
          .select(`
            id,
            exam_id,
            marks_obtained,
            total_questions,
            correct_answers,
            wrong_answers,
            attempted_questions,
            published_at
          `)
          .eq("candidate_id", userData.user.id)
          .order("published_at", { ascending: true }),

        supabase
          .from("exams")
          .select(`
            id,
            exam_name,
            level_name,
            level_order,
            series_id
          `)
          .order("level_order", { ascending: true })
      ]);

      if (resultResponse.error) throw resultResponse.error;
      if (examResponse.error) throw examResponse.error;

      setResults(resultResponse.data || []);
      setExams(examResponse.data || []);
    } catch (err) {
      setError(err.message || "Unable to load performance analytics.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const examMap = useMemo(
    () => Object.fromEntries(exams.map((exam) => [exam.id, exam])),
    [exams]
  );

  const totalMarks = results.reduce(
    (sum, result) => sum + Number(result.marks_obtained || 0),
    0
  );

  const totalPossible = results.reduce(
    (sum, result) => sum + Number(result.total_questions || 100),
    0
  );

  const average = totalPossible
    ? Math.round((totalMarks / totalPossible) * 100)
    : 0;

  const series = exams.find((exam) => exam.series_id)?.series_id;

  const levelResults = LEVELS.map((level, index) => {
    const order = index + 1;

    const result = results.find((item) => {
      const exam = examMap[item.exam_id];

      return (
        Number(exam?.level_order) === order &&
        (!series || exam?.series_id === series)
      );
    });

    return {
      level,
      order,
      result,
      marks: Number(result?.marks_obtained || 0)
    };
  });

  const completedLevels = levelResults.filter(
    (item) => Boolean(item.result)
  ).length;

  return (
    <main style={styles.page}>
      <div style={styles.container}>

        <button
          style={styles.back}
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={18} />
          Dashboard
        </button>

        <h1 style={styles.heading}>MY PERFORMANCE ANALYTICS</h1>

        <p style={styles.subtitle}>
          Track your Islamic Quiz examination performance.
        </p>

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        {loading ? (
          <p>Loading analytics...</p>
        ) : (
          <>
            <section style={styles.stats}>

              <article style={styles.statCard}>
                <Trophy color="#b58a2c" size={26} />
                <span style={styles.statLabel}>Total Marks</span>
                <strong style={styles.statValue}>
                  {totalMarks}/{totalPossible}
                </strong>
              </article>

              <article style={styles.statCard}>
                <TrendingUp color="#176b50" size={26} />
                <span style={styles.statLabel}>Overall Percentage</span>
                <strong style={styles.statValue}>{average}%</strong>
              </article>

              <article style={styles.statCard}>
                <CheckCircle color="#176b50" size={26} />
                <span style={styles.statLabel}>Exams Completed</span>
                <strong style={styles.statValue}>{results.length}</strong>
              </article>

              <article style={styles.statCard}>
                <BarChart3 color="#176b50" size={26} />
                <span style={styles.statLabel}>Levels Completed</span>
                <strong style={styles.statValue}>
                  {completedLevels}/6
                </strong>
              </article>

            </section>

            <section style={styles.panel}>
              <h2 style={styles.panelHeading}>
                Six-Level Performance
              </h2>

              {levelResults.map((item) => (
                <div key={item.order} style={styles.level}>

                  <div style={styles.levelTop}>
                    <strong>
                      {item.order}. {item.level}
                    </strong>

                    <span style={styles.levelMarks}>
                      {item.result
                        ? `${item.marks}/100`
                        : "Not completed"}
                    </span>
                  </div>

                  <div style={styles.track}>
                    <div
                      style={{
                        ...styles.bar,
                        width: `${Math.min(100, Math.max(0, item.marks))}%`
                      }}
                    />
                  </div>

                </div>
              ))}
            </section>

            <section style={styles.panel}>
              <h2 style={styles.panelHeading}>
                Examination Results
              </h2>

              {results.length === 0 ? (
                <p>No published results available yet.</p>
              ) : (
                results.map((result) => {
                  const exam = examMap[result.exam_id];
                  const marks = Number(result.marks_obtained || 0);

                  return (
                    <div key={result.id} style={styles.resultRow}>

                      <div style={styles.resultInfo}>
                        <strong>
                          {exam?.level_name ||
                            exam?.exam_name ||
                            "Examination"}
                        </strong>

                        <small style={styles.resultDate}>
                          {result.published_at
                            ? new Date(
                                result.published_at
                              ).toLocaleDateString("en-IN")
                            : "Result published"}
                        </small>
                      </div>

                      <strong style={styles.resultMarks}>
                        {marks}/100
                      </strong>

                    </div>
                  );
                })
              )}
            </section>
          </>
        )}

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

  container: {
    maxWidth: 1000,
    margin: "auto"
  },

  back: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    border: 0,
    background: "transparent",
    color: "#176b50",
    cursor: "pointer",
    marginBottom: 22,
    fontSize: 14
  },

  heading: {
    fontSize: 25,
    fontWeight: 800,
    marginBottom: 8
  },

  subtitle: {
    color: "#718078",
    marginBottom: 25
  },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: 14,
    marginBottom: 22
  },

  statCard: {
    background: "white",
    border: "1px solid #e5ebe6",
    borderRadius: 12,
    padding: 20,
    display: "grid",
    gap: 8
  },

  statLabel: {
    color: "#718078",
    fontSize: 13
  },

  statValue: {
    fontSize: 25,
    color: "#173d32"
  },

  panel: {
    background: "white",
    padding: 22,
    borderRadius: 12,
    marginBottom: 20,
    border: "1px solid #e5ebe6"
  },

  panelHeading: {
    fontSize: 19,
    marginTop: 0,
    marginBottom: 20
  },

  level: {
    marginTop: 20
  },

  levelTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
    fontSize: 14
  },

  levelMarks: {
    color: "#718078"
  },

  track: {
    height: 10,
    background: "#edf1ed",
    borderRadius: 10,
    overflow: "hidden"
  },

  bar: {
    height: "100%",
    background: "#176b50",
    borderRadius: 10,
    transition: "width .3s"
  },

  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 15,
    padding: "14px 0",
    borderBottom: "1px solid #edf1ed"
  },

  resultInfo: {
    display: "grid",
    gap: 6
  },

  resultDate: {
    color: "#718078",
    fontSize: 12
  },

  resultMarks: {
    color: "#176b50",
    whiteSpace: "nowrap"
  },

  error: {
    color: "#b42318",
    background: "#fff0ef",
    padding: 12,
    borderRadius: 8,
    marginBottom: 18
  }
};

export default PerformanceAnalytics;
