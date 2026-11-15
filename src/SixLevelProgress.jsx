import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  CheckCircle,
  Circle,
  Play,
  Trophy,
  RefreshCw,
} from "lucide-react";
import { supabase } from "./supabase";

const LEVELS = [
  "Foundation",
  "Beginner",
  "Intermediate",
  "Moderate",
  "Advanced",
  "Expert",
];

export default function SixLevelProgress() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState([]);
  const [error, setError] = useState("");

  const loadProgress = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please log in again.");

      const [examResponse, attemptResponse, resultResponse] =
        await Promise.all([
          supabase
            .from("exams")
            .select(
              "id, exam_name, exam_date, availability_end, status, series_id, level_order, level_name"
            )
            .not("series_id", "is", null)
            .order("level_order"),

          supabase
            .from("exam_attempts")
            .select("id, exam_id, status, submitted_at")
            .eq("candidate_id", user.id),

          supabase
            .from("exam_results")
            .select("id, exam_id, marks_obtained, published_at")
            .eq("candidate_id", user.id),
        ]);

      if (examResponse.error) throw examResponse.error;
      if (attemptResponse.error) throw attemptResponse.error;
      if (resultResponse.error) throw resultResponse.error;

      const exams = examResponse.data || [];
      const attempts = attemptResponse.data || [];
      const results = resultResponse.data || [];

      const seriesIds = [...new Set(exams.map((exam) => exam.series_id))];

      const seriesGroups = seriesIds.map((seriesId) => {
        const seriesExams = exams
          .filter((exam) => exam.series_id === seriesId)
          .sort((a, b) => a.level_order - b.level_order);

        return {
          seriesId,
          exams: seriesExams,
        };
      });

      const progress = seriesGroups.flatMap((group) =>
        LEVELS.map((levelName, index) => {
          const order = index + 1;
          const exam = group.exams.find(
            (item) => Number(item.level_order) === order
          );

          const attempt = exam
            ? attempts.find((item) => item.exam_id === exam.id)
            : null;

          const result = exam
            ? results.find((item) => item.exam_id === exam.id)
            : null;

          const previousExam =
            order > 1
              ? group.exams.find(
                  (item) => Number(item.level_order) === order - 1
                )
              : null;

          const previousAttempt = previousExam
            ? attempts.find((item) => item.exam_id === previousExam.id)
            : null;

          const unlocked =
            order === 1 ||
            previousAttempt?.status === "submitted";

          const submitted =
            attempt?.status === "submitted" || Boolean(result);

          const terminated = attempt?.status === "terminated";

          const now = Date.now();
          const isOpen =
            exam &&
            exam.status === "published" &&
            new Date(exam.exam_date).getTime() <= now &&
            new Date(exam.availability_end).getTime() >= now;

          return {
            seriesId: group.seriesId,
            levelName,
            order,
            exam,
            attempt,
            result,
            unlocked,
            submitted,
            terminated,
            isOpen: Boolean(isOpen),
          };
        })
      );

      setLevels(progress);
    } catch (err) {
      setError(err.message || "Unable to load examination progress.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProgress();
  }, []);

  const startLevel = (item) => {
    if (!item.exam || !item.unlocked || !item.isOpen) return;

    if (item.attempt) {
      if (item.attempt.status === "in_progress") {
        navigate(`/exam/${item.exam.id}`);
      } else {
        alert("You have already used your attempt for this level.");
      }
      return;
    }

    navigate(`/exam/${item.exam.id}`);
  };

  const groups = [
    ...new Set(levels.map((item) => item.seriesId)),
  ];

  if (loading) {
    return (
      <section className="dashboard-content-section">
        <p>Loading your six-level progress...</p>
      </section>
    );
  }

  return (
    <section className="dashboard-content-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>
            <Trophy size={21} /> Six-Level Examination Journey
          </h2>
          <p>
            Complete each level to unlock the next examination.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          onClick={loadProgress}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && (
        <div className="dashboard-error">{error}</div>
      )}

      {levels.length === 0 ? (
        <div className="dashboard-empty">
          No six-level examination series is currently available.
        </div>
      ) : (
        groups.map((seriesId, groupIndex) => {
          const group = levels.filter(
            (item) => item.seriesId === seriesId
          );

          const completed = group.filter(
            (item) => item.submitted
          ).length;

          return (
            <div key={seriesId} style={styles.series}>
              <div style={styles.seriesHeader}>
                <div>
                  <strong>EXAMINATION SERIES {groupIndex + 1}</strong>
                  <p>
                    {completed} of 6 levels completed
                  </p>
                </div>

                <strong style={styles.progressCount}>
                  {Math.round((completed / 6) * 100)}%
                </strong>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${(completed / 6) * 100}%`,
                  }}
                />
              </div>

              <div style={styles.levelList}>
                {group.map((item) => {
                  const isCurrent =
                    item.unlocked &&
                    !item.submitted &&
                    !item.terminated;

                  return (
                    <article
                      key={item.order}
                      style={styles.levelCard}
                    >
                      <div style={styles.levelIcon}>
                        {item.submitted ? (
                          <CheckCircle color="#27824d" size={25} />
                        ) : item.unlocked ? (
                          <Circle color="#b18b40" size={25} />
                        ) : (
                          <Lock color="#929b94" size={23} />
                        )}
                      </div>

                      <div style={styles.levelInfo}>
                        <span style={styles.levelNumber}>
                          LEVEL {item.order}
                        </span>

                        <h3>{item.levelName}</h3>

                        <p>
                          {item.submitted
                            ? "Examination completed"
                            : item.terminated
                              ? "Attempt terminated"
                              : !item.exam
                                ? "Examination not published yet"
                                : !item.unlocked
                                  ? "Complete previous level to unlock"
                                  : item.attempt?.status === "in_progress"
                                    ? "Examination in progress"
                                    : item.isOpen
                                      ? "Available to start"
                                      : "Waiting for examination window"}
                        </p>

                        {item.result && (
                          <strong style={styles.score}>
                            Score: {item.result.marks_obtained}/100
                          </strong>
                        )}
                      </div>

                      <div>
                        {item.submitted ? (
                          <span style={styles.completedLabel}>
                            COMPLETED
                          </span>
                        ) : item.terminated ? (
                          <span style={styles.terminatedLabel}>
                            TERMINATED
                          </span>
                        ) : (
                          <button
                            style={{
                              ...styles.startButton,
                              opacity:
                                isCurrent && item.isOpen ? 1 : 0.45,
                            }}
                            disabled={!isCurrent || !item.isOpen}
                            onClick={() => startLevel(item)}
                          >
                            {item.attempt?.status === "in_progress" ? (
                              "Resume"
                            ) : (
                              <>
                                <Play size={15} /> Start
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

const styles = {
  series: {
    background: "#fff",
    border: "1px solid #e1e8e2",
    borderRadius: "12px",
    padding: "18px",
    marginTop: "18px",
  },
  seriesHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },
  progressCount: {
    color: "#17613c",
    fontSize: "20px",
  },
  progressTrack: {
    height: "8px",
    background: "#e8eee9",
    borderRadius: "20px",
    overflow: "hidden",
    margin: "15px 0 20px",
  },
  progressFill: {
    height: "100%",
    background: "#23784b",
    borderRadius: "20px",
    transition: "width 0.3s",
  },
  levelList: {
    display: "grid",
    gap: "10px",
  },
  levelCard: {
    display: "flex",
    alignItems: "center",
    gap: "13px",
    flexWrap: "wrap",
    border: "1px solid #e4eae5",
    borderRadius: "10px",
    padding: "14px",
  },
  levelIcon: {
    width: "32px",
  },
  levelInfo: {
    flex: 1,
    minWidth: "150px",
  },
  levelNumber: {
    color: "#a17c37",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "1px",
  },
  score: {
    color: "#17613c",
    fontSize: "13px",
  },
  completedLabel: {
    color: "#23784b",
    fontSize: "11px",
    fontWeight: 800,
  },
  terminatedLabel: {
    color: "#a33a3a",
    fontSize: "11px",
    fontWeight: 800,
  },
  startButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: 0,
    borderRadius: "8px",
    background: "#174d32",
    color: "#fff",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
};