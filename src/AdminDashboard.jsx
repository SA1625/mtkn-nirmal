
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, BookOpen, ClipboardList, Trophy,
  ShieldCheck, LogOut, LayoutDashboard, RefreshCw,
  UserCheck, CalendarDays, AlertTriangle, X,
  Clock, Eye, ArrowLeft
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
    attempts: 0
  });

  const [recentExams, setRecentExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAttempts, setShowAttempts] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState("");

  const [showDetails, setShowDetails] = useState(null);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data: adminProfile, error: profileError } =
        await supabase
          .from("profiles")
          .select("full_name, email, role")
          .eq("id", user.id)
          .single();

      if (profileError) throw profileError;

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
        attemptsResponse
      ] = await Promise.all([
        supabase.from("profiles").select("id, role"),

        supabase.from("quiz_questions")
          .select("id", { count: "exact", head: true }),

        supabase.from("exams")
          .select("id, exam_name, exam_date, status, created_at, level_name")
          .order("created_at", { ascending: false }),

        supabase.from("exam_results")
          .select("id", { count: "exact", head: true }),

        supabase.from("exam_attempts")
          .select("id", { count: "exact", head: true })
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
          item => item.role === "candidate"
        ).length,

        admins: allProfiles.filter(
          item => ["admin", "super_admin"].includes(item.role)
        ).length,

        questions: questionsResponse.count || 0,
        exams: allExams.length,

        published: allExams.filter(
          item => item.status === "published"
        ).length,

        results: resultsResponse.count || 0,
        attempts: attemptsResponse.count || 0
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  // Load complete examination attempt history
  const openAttempts = async () => {
    setShowAttempts(true);
    setAttemptLoading(true);
    setAttemptError("");

    try {
      const { data, error: attemptsError } = await supabase
        .from("exam_attempts")
        .select("id, candidate_id, exam_id, status, submitted_at, expires_at")
        .order("submitted_at", { ascending: false });

      if (attemptsError) throw attemptsError;

      const rows = data || [];

      const candidateIds = [...new Set(
        rows.map(item => item.candidate_id).filter(Boolean)
      )];

      const examIds = [...new Set(
        rows.map(item => item.exam_id).filter(Boolean)
      )];

      let candidateMap = {};
      let examMap = {};

      if (candidateIds.length) {
        const { data: candidates, error } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", candidateIds);

        if (error) throw error;

        candidateMap = Object.fromEntries(
          (candidates || []).map(item => [item.id, item])
        );
      }

      if (examIds.length) {
        const { data: exams, error } = await supabase
          .from("exams")
          .select("id, exam_name, level_name")
          .in("id", examIds);

        if (error) throw error;

        examMap = Object.fromEntries(
          (exams || []).map(item => [item.id, item])
        );
      }

      setAttempts(rows.map(item => ({
        ...item,
        candidate: candidateMap[item.candidate_id] || {},
        exam: examMap[item.exam_id] || {}
      })));

    } catch (err) {
      setAttemptError(err.message || "Unable to load attempt history.");
    } finally {
      setAttemptLoading(false);
    }
  };

  if (loading) {
    return <div className="admin-loading">Loading Admin Panel...</div>;
  }

  if (!profile) {
    return (
      <div className="admin-denied">
        <ShieldCheck size={45} />
        <h2>ACCESS RESTRICTED</h2>
        <p>{error || "Administrator access required."}</p>
        <button onClick={() => navigate("/")}>Back to Home</button>
      </div>
    );
  }

  const isSuperAdmin = profile.role === "super_admin";

  const statCards = [
    {
      title: "Registered Candidates",
      value: stats.candidates,
      icon: Users,
      action: () => navigate("/admin/candidates"),
      description: "View all registered candidates"
    },
    {
      title: "Total Questions",
      value: stats.questions,
      icon: BookOpen,
      action: () => navigate("/admin/questions"),
      description: "Explore the complete question bank"
    },
    {
      title: "Total Examinations",
      value: stats.exams,
      icon: ClipboardList,
      action: () => navigate("/admin/exams"),
      description: "View all examinations"
    },
    {
      title: "Published Exams",
      value: stats.published,
      icon: CalendarDays,
      action: () => navigate("/admin/exams"),
      description: "Manage published examinations"
    },
    {
      title: "Results Published",
      value: stats.results,
      icon: Trophy,
      action: () => navigate("/admin/results"),
      description: "View results and marksheets"
    },
    {
      title: "Exam Attempts",
      value: stats.attempts,
      icon: UserCheck,
      action: openAttempts,
      description: "View complete attempt history"
    }
  ];

  const modules = [
    {
      title: "Candidate Management",
      description: "View registered candidates and their details.",
      icon: Users,
      path: "/admin/candidates"
    },
    {
      title: "Question Bank",
      description: "Manage questions, topics and difficulty levels.",
      icon: BookOpen,
      path: "/admin/questions"
    },
    {
      title: "Examination Management",
      description: "Create, prepare and publish examinations.",
      icon: ClipboardList,
      path: "/admin/exams"
    },
    {
      title: "Results & Rankings",
      description: "Review examination results and rankings.",
      icon: Trophy,
      path: "/admin/results"
    },
    {
      title: "Admin Management",
      description: "Manage administrator permissions.",
      icon: ShieldCheck,
      path: "/admin/management",
      restricted: !isSuperAdmin
    },
    {
      title: "Question Import & Review",
      description: "Review imported questions and AI-generated drafts.",
      icon: BookOpen,
      path: "/admin/question-review"
    }
  ];

  const cardStyle = {
    background: "#fff",
    border: "1px solid #dce8df",
    borderRadius: 14,
    padding: 19,
    textAlign: "left",
    cursor: "pointer",
    minHeight: 130,
    width: "100%",
    transition: "all .2s ease",
    color: "#173d32"
  };

  const buttonStyle = {
    padding: "10px 15px",
    border: "none",
    borderRadius: 9,
    background: "#08734e",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontWeight: 700
  };

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

          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {isSuperAdmin && (
              <button
                className="admin-logout"
                onClick={() => navigate("/admin/management")}
              >
                <ShieldCheck size={17} /> Manage Admins
              </button>
            )}

            <button className="admin-logout" onClick={loadAdmin}>
              <RefreshCw size={17} /> Refresh
            </button>

            <button className="admin-logout" onClick={handleLogout}>
              <LogOut size={17} /> Logout
            </button>
          </div>
        </div>

        {/* WELCOME */}
        <section className="admin-welcome">
          <div>
            <p className="admin-eyebrow">WELCOME BACK</p>
            <h2>{profile.full_name || "Administrator"}</h2>
            <p>{profile.email}</p>
            <p>Manage the Islamic Quiz 2026 portal.</p>
          </div>

          <div className="admin-role">
            <ShieldCheck size={20} />
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </div>
        </section>

        {error && (
          <p className="admin-notice" style={{ color: "#b42318" }}>
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        {/* CLICKABLE STATISTICS */}
        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))",
          gap: 14,
          margin: "22px 0"
        }}>
          {statCards.map(item => {
            const Icon = item.icon;

            return (
              <button
                key={item.title}
                type="button"
                onClick={item.action}
                title={item.description}
                style={cardStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "#08734e";
                  e.currentTarget.style.boxShadow =
                    "0 8px 22px rgba(0,80,50,.10)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "#dce8df";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Icon size={24} color="#08734e" />

                <p style={{
                  color: "#687970",
                  fontSize: 12,
                  margin: "10px 0 5px"
                }}>
                  {item.title}
                </p>

                <strong style={{
                  fontSize: 28,
                  color: "#173d32"
                }}>
                  {item.value}
                </strong>

                <div style={{
                  fontSize: 11,
                  color: "#08734e",
                  marginTop: 8,
                  fontWeight: 700
                }}>
                  View Details →
                </div>
              </button>
            );
          })}
        </section>

        {/* MANAGEMENT MODULES */}
        <div className="admin-section-title">
          <h2>PORTAL MANAGEMENT</h2>
          <p>Administration modules</p>
        </div>

        <section className="admin-module-grid">
          {modules.map(module => {
            const Icon = module.icon;

            return (
              <button
                type="button"
                className="admin-module-card"
                key={module.title}
                disabled={module.restricted}
                onClick={() => navigate(module.path)}
                style={{
                  cursor: module.restricted ? "not-allowed" : "pointer",
                  opacity: module.restricted ? 0.55 : 1,
                  textAlign: "left",
                  width: "100%",
                  fontFamily: "inherit"
                }}
              >
                <div className="admin-module-icon">
                  <Icon size={25} />
                </div>

                <h3>{module.title}</h3>
                <p>{module.description}</p>

                <span className={`admin-module-status ${
                  module.restricted ? "restricted" : ""
                }`}>
                  {module.restricted ? "Restricted" : "Open Module"}
                </span>
              </button>
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
            <div style={{
              background: "#fff",
              border: "1px solid #e1e9e3",
              borderRadius: 12,
              overflow: "hidden"
            }}>
              {recentExams.map(exam => (
                <button
                  type="button"
                  key={exam.id}
                  onClick={() => navigate("/admin/exams")}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: 16,
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid #edf1ee",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <strong>{exam.exam_name}</strong>
                    <p style={{
                      margin: "4px 0 0",
                      color: "#718078",
                      fontSize: 12
                    }}>
                      {exam.exam_date
                        ? new Date(exam.exam_date).toLocaleString("en-IN")
                        : "Date not set"}
                    </p>
                  </div>

                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: exam.status === "published"
                      ? "#08734e" : "#8a6a28",
                    textTransform: "uppercase"
                  }}>
                    {exam.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <p className="admin-notice">
          Administrator access is subject to assigned permissions.
        </p>
      </div>

      {/* EXAM ATTEMPT HISTORY MODAL */}
      {showAttempts && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.60)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 15
          }}
          onClick={() => setShowAttempts(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 15,
              padding: 22,
              width: "100%",
              maxWidth: 950,
              maxHeight: "90vh",
              overflowY: "auto"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10
            }}>
              <div>
                <h2 style={{ color: "#08734e", margin: 0 }}>
                  EXAM ATTEMPT HISTORY
                </h2>
                <p style={{ color: "#718078", fontSize: 13 }}>
                  Complete candidate examination records
                </p>
              </div>

              <button
                onClick={() => setShowAttempts(false)}
                style={buttonStyle}
              >
                <X size={18} /> Close
              </button>
            </div>

            {attemptLoading ? (
              <p>Loading complete attempt history...</p>
            ) : attemptError ? (
              <p style={{ color: "#b42318" }}>{attemptError}</p>
            ) : attempts.length === 0 ? (
              <p>No examination attempts found.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 650
                }}>
                  <thead>
                    <tr style={{ background: "#edf5ef" }}>
                      {[
                        "Candidate",
                        "Examination",
                        "Status",
                        "Submitted",
                        "Details"
                      ].map(item => (
                        <th key={item} style={{
                          padding: 12,
                          textAlign: "left",
                          fontSize: 12
                        }}>
                          {item}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {attempts.map(item => (
                      <tr key={item.id}>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          <strong>
                            {item.candidate.full_name || "Unknown"}
                          </strong>
                          <div style={{ fontSize: 11, color: "#718078" }}>
                            {item.candidate.email || ""}
                          </div>
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          {item.exam.exam_name || "Unknown exam"}
                          <div style={{ fontSize: 11, color: "#718078" }}>
                            {item.exam.level_name || ""}
                          </div>
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          {item.status}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          {item.submitted_at
                            ? new Date(item.submitted_at).toLocaleString("en-IN")
                            : "Not submitted"}
                        </td>

                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          <button
                            style={buttonStyle}
                            onClick={() => setShowDetails(item)}
                          >
                            <Eye size={15} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p style={{ fontSize: 12, color: "#718078" }}>
              Total records: {attempts.length}
            </p>
          </div>
        </div>
      )}

      {/* INDIVIDUAL ATTEMPT DETAILS */}
      {showDetails && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,.65)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 15
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 14,
            padding: 24,
            width: "100%",
            maxWidth: 500
          }}>
            <h2 style={{ color: "#08734e" }}>ATTEMPT DETAILS</h2>

            <p><strong>Candidate:</strong> {showDetails.candidate.full_name || "Unknown"}</p>
            <p><strong>Email:</strong> {showDetails.candidate.email || "—"}</p>
            <p><strong>Examination:</strong> {showDetails.exam.exam_name || "Unknown"}</p>
            <p><strong>Level:</strong> {showDetails.exam.level_name || "—"}</p>
            <p><strong>Status:</strong> {showDetails.status}</p>
            <p><strong>Attempt ID:</strong> {showDetails.id}</p>
            <p>
              <strong>Submitted:</strong>{" "}
              {showDetails.submitted_at
                ? new Date(showDetails.submitted_at).toLocaleString("en-IN")
                : "Not submitted"}
            </p>
            <p>
              <strong>Expiry:</strong>{" "}
              {showDetails.expires_at
                ? new Date(showDetails.expires_at).toLocaleString("en-IN")
                : "—"}
            </p>

            <button
              style={buttonStyle}
              onClick={() => setShowDetails(null)}
            >
              <ArrowLeft size={16} /> Back to History
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default AdminDashboard;
