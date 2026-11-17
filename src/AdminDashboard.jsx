
import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Users,
  BookOpen,
  ClipboardList,
  Trophy,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  RefreshCw,
  UserCheck,
  CalendarDays,
  AlertTriangle,
  BookMarked,
  ChevronRight,
  Layers,
  GraduationCap,
} from "lucide-react";
import { supabase } from "./supabase";

const levels = [
  { name: "Foundation", number: "01", description: "Level 1 · Foundation Quiz" },
  { name: "Beginner", number: "02", description: "Level 2 · Beginner Quiz" },
  { name: "Intermediate", number: "03", description: "Level 3 · Intermediate Quiz" },
  { name: "Moderate", number: "04", description: "Level 4 · Moderate Quiz" },
  { name: "Advanced", number: "05", description: "Level 5 · Advanced Quiz" },
  { name: "Expert", number: "06", description: "Level 6 · Expert Quiz" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    candidates: 0,
    admins: 0,
    questions: 0,
    exams: 0,
    published: 0,
    results: 0,
    attempts: 0,
  });
  const [recentExams, setRecentExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAdmin = useCallback(async () => {
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

      const { data: adminProfile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(adminProfile?.role)) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setProfile(adminProfile);

      const [
        profilesResponse,
        questionsResponse,
        examsResponse,
        resultsResponse,
        attemptsResponse,
      ] = await Promise.all([
        supabase.from("profiles").select("id, role"),
        supabase.from("quiz_questions").select("id", { count: "exact", head: true }),
        supabase
          .from("exams")
          .select("id, exam_name, exam_date, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("exam_results").select("id", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id", { count: "exact", head: true }),
      ]);

      if (profilesResponse.error) throw profilesResponse.error;
      if (questionsResponse.error) throw questionsResponse.error;
      if (examsResponse.error) throw examsResponse.error;
      if (resultsResponse.error) throw resultsResponse.error;
      if (attemptsResponse.error) throw attemptsResponse.error;

      const allProfiles = profilesResponse.data || [];
      const allExams = examsResponse.data || [];

      setStats({
        candidates: allProfiles.filter((item) => item.role === "candidate").length,
        admins: allProfiles.filter((item) =>
          ["admin", "super_admin"].includes(item.role)
        ).length,
        questions: questionsResponse.count || 0,
        exams: allExams.length,
        published: allExams.filter((item) => item.status === "published").length,
        results: resultsResponse.count || 0,
        attempts: attemptsResponse.count || 0,
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

  const openExamManagement = (levelName = null) => {
    navigate("/admin/exams", {
      state: levelName ? { islamicQuizLevel: levelName } : {},
    });
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <RefreshCw size={25} />
        <p>Loading Admin Panel...</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div style={styles.center}>
        <ShieldCheck size={45} />
        <h2>ACCESS RESTRICTED</h2>
        <p>{error}</p>
        <button style={styles.primaryButton} onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";

  const modules = [
    {
      title: "Candidate Management",
      description: "Registered candidates, details and attempt history.",
      icon: Users,
      path: "/admin/candidates",
      accent: "#176b50",
    },
    {
      title: "Question Bank",
      description: "Manage questions, topics and difficulty levels.",
      icon: BookOpen,
      path: "/admin/questions",
      accent: "#2563eb",
    },
    {
      title: "Examination Management",
      description: "Create, prepare and publish examinations.",
      icon: ClipboardList,
      path: "/admin/exams",
      accent: "#7c3aed",
    },
    {
      title: "Results & Rankings",
      description: "Review results, marksheets and rankings.",
      icon: Trophy,
      path: "/admin/results",
      accent: "#b7791f",
    },
    {
      title: "Admin Management",
      description: "Manage administrator permissions.",
      icon: ShieldCheck,
      path: "/admin/management",
      accent: "#475569",
      restricted: !isSuperAdmin,
    },
    {
      title: "Question Import & Review",
      description: "Review imported questions and AI-generated drafts.",
      icon: BookOpen,
      path: "/admin/question-review",
      accent: "#0f766e",
    },
    {
      title: "Islamic Book Review",
      description: "Review original questions and answers extracted from the book.",
      icon: BookMarked,
      path: "/admin/islamic-book-review",
      accent: "#9a3412",
    },
  ];

  const statCards = [
    { title: "Registered Candidates", value: stats.candidates, icon: Users, path: "/admin/candidates" },
    { title: "Total Questions", value: stats.questions, icon: BookOpen, path: "/admin/questions" },
    { title: "Total Examinations", value: stats.exams, icon: ClipboardList, path: "/admin/exams" },
    { title: "Published Exams", value: stats.published, icon: CalendarDays, path: "/admin/exams" },
    { title: "Results Published", value: stats.results, icon: Trophy, path: "/admin/results" },
    { title: "Exam Attempts", value: stats.attempts, icon: UserCheck, path: "/admin/results" },
  ];

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.topbar}>
          <div style={styles.brand}>
            <div style={styles.brandIcon}><LayoutDashboard size={26} /></div>
            <div>
              <h1 style={styles.mainTitle}>ADMIN DASHBOARD</h1>
              <p style={styles.eyebrow}>ISLAMIC QUIZ 2026 PORTAL</p>
            </div>
          </div>

          <div style={styles.topActions}>
            {isSuperAdmin && (
              <button
                style={styles.outlineButton}
                onClick={() => navigate("/admin/management")}
                type="button"
              >
                <ShieldCheck size={16} /> Manage Admins
              </button>
            )}
            <button
              style={styles.outlineButton}
              onClick={loadAdmin}
              disabled={loading}
              type="button"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button style={styles.logoutButton} onClick={handleLogout} type="button">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        <section style={styles.welcome}>
          <div>
            <span style={styles.welcomeLabel}>WELCOME BACK</span>
            <h2 style={styles.welcomeName}>{profile?.full_name || "Administrator"}</h2>
            <p style={styles.welcomeEmail}>{profile?.email}</p>
            <p style={styles.welcomeText}>Manage the Islamic Quiz 2026 portal.</p>
          </div>
          <div style={styles.roleBadge}>
            <ShieldCheck size={19} />
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </div>
        </section>

        {error && (
          <div style={styles.error}>
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        <section style={styles.statGrid}>
          {statCards.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                style={styles.statCard}
                onClick={() => navigate(item.path)}
                type="button"
              >
                <span style={styles.statIcon}><Icon size={22} /></span>
                <span style={styles.statLabel}>{item.title}</span>
                <strong style={styles.statValue}>{item.value}</strong>
                <span style={styles.cardOpen}>Open details <ChevronRight size={14} /></span>
              </button>
            );
          })}
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeading}>
            <div>
              <span style={styles.sectionEyebrow}>CONTROL CENTRE</span>
              <h2 style={styles.sectionTitle}>PORTAL MANAGEMENT</h2>
              <p style={styles.sectionText}>Choose a module to manage your portal.</p>
            </div>
            <Layers size={27} color="#176b50" />
          </div>

          <div style={styles.moduleGrid}>
            {modules.map((module) => {
              const Icon = module.icon;
              const disabled = Boolean(module.restricted);

              return (
                <button
                  key={module.title}
                  type="button"
                  disabled={disabled}
                  onClick={() => navigate(module.path)}
                  style={{
                    ...styles.moduleCard,
                    borderTop: `4px solid ${module.accent}`,
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <span style={{ ...styles.moduleIcon, color: module.accent }}>
                    <Icon size={25} />
                  </span>
                  <strong style={styles.moduleTitle}>{module.title}</strong>
                  <span style={styles.moduleDescription}>{module.description}</span>
                  <span style={styles.moduleFooter}>
                    {disabled ? "Super Admin only" : "OPEN MODULE"}
                    <ChevronRight size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.islamicSection}>
          <div style={styles.islamicHeader}>
            <div style={styles.islamicIcon}><GraduationCap size={26} /></div>
            <div>
              <span style={styles.sectionEyebrow}>SPECIAL EXAMINATION SERIES</span>
              <h2 style={styles.sectionTitle}>ISLAMIC QUIZ 2026</h2>
              <p style={styles.sectionText}>
                Manage each of the six examination levels separately.
              </p>
            </div>
          </div>

          <div style={styles.levelGrid}>
            {levels.map((level) => (
              <button
                key={level.name}
                type="button"
                onClick={() => openExamManagement(level.name)}
                style={styles.levelCard}
              >
                <span style={styles.levelNumber}>{level.number}</span>
                <strong style={styles.levelName}>{level.name}</strong>
                <span style={styles.levelDescription}>{level.description}</span>
                <span style={styles.levelOpen}>OPEN LEVEL <ChevronRight size={15} /></span>
              </button>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeading}>
            <div>
              <span style={styles.sectionEyebrow}>LATEST ACTIVITY</span>
              <h2 style={styles.sectionTitle}>RECENT EXAMINATIONS</h2>
              <p style={styles.sectionText}>Latest examination records.</p>
            </div>
            <button
              style={styles.outlineButton}
              onClick={() => navigate("/admin/exams")}
              type="button"
            >
              View All <ChevronRight size={15} />
            </button>
          </div>

          {recentExams.length === 0 ? (
            <p style={styles.empty}>No examinations created yet.</p>
          ) : (
            <div style={styles.recentList}>
              {recentExams.map((exam) => (
                <div key={exam.id} style={styles.recentRow}>
                  <div>
                    <strong>{exam.exam_name}</strong>
                    <p style={styles.recentDate}>
                      {exam.exam_date
                        ? new Date(exam.exam_date).toLocaleString()
                        : "Date not set"}
                    </p>
                  </div>
                  <span style={styles.examStatus}>{exam.status || "draft"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <p style={styles.bottomNote}>
          Administrator access is subject to assigned permissions.
        </p>
      </div>
    </main>
  );
}

const styles = {
  page: { minHeight: "80vh", background: "#f4f7f5", padding: "28px 16px 45px", color: "#173d32" },
  container: { maxWidth: 1250, margin: "0 auto" },
  center: { minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#176b50" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandIcon: { width: 48, height: 48, display: "grid", placeItems: "center", background: "#176b50", color: "white", borderRadius: 13 },
  mainTitle: { margin: 0, fontSize: 22, letterSpacing: ".5px" },
  eyebrow: { margin: "4px 0 0", color: "#718078", fontSize: 11, letterSpacing: "1.5px", fontWeight: 800 },
  topActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  outlineButton: { display: "inline-flex", gap: 7, alignItems: "center", padding: "9px 12px", border: "1px solid #cbd9d0", borderRadius: 8, background: "white", color: "#176b50", cursor: "pointer", fontWeight: 700 },
  logoutButton: { display: "inline-flex", gap: 7, alignItems: "center", padding: "9px 12px", border: 0, borderRadius: 8, background: "#176b50", color: "white", cursor: "pointer", fontWeight: 700 },
  primaryButton: { padding: "10px 14px", border: 0, borderRadius: 8, background: "#176b50", color: "white", cursor: "pointer" },
  welcome: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", padding: 24, background: "linear-gradient(120deg,#124b39,#1e7657)", borderRadius: 16, color: "white", boxShadow: "0 8px 22px #173d321c" },
  welcomeLabel: { fontSize: 10, letterSpacing: "2px", fontWeight: 800, opacity: .8 },
  welcomeName: { margin: "6px 0", fontSize: 25 },
  welcomeEmail: { margin: 0, opacity: .85, fontSize: 13 },
  welcomeText: { margin: "10px 0 0", opacity: .9, fontSize: 13 },
  roleBadge: { display: "flex", gap: 8, alignItems: "center", padding: "10px 13px", background: "#ffffff20", border: "1px solid #ffffff45", borderRadius: 9, fontSize: 12, fontWeight: 800 },
  error: { display: "flex", gap: 8, alignItems: "center", marginTop: 15, padding: 12, color: "#b42318", background: "#fff1f0", borderRadius: 8 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 13, margin: "20px 0 28px" },
  statCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 17, textAlign: "left", border: "1px solid #e1e9e3", borderRadius: 13, background: "white", color: "#173d32", cursor: "pointer", boxShadow: "0 3px 12px #173d3209", transition: "transform .15s, box-shadow .15s" },
  statIcon: { color: "#176b50" },
  statLabel: { color: "#718078", fontSize: 12 },
  statValue: { fontSize: 28 },
  cardOpen: { display: "flex", alignItems: "center", gap: 3, marginTop: 3, color: "#176b50", fontSize: 11, fontWeight: 800 },
  section: { marginTop: 27 },
  sectionHeading: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 15 },
  sectionEyebrow: { color: "#176b50", fontSize: 10, fontWeight: 900, letterSpacing: "1.5px" },
  sectionTitle: { margin: "4px 0", fontSize: 20, color: "#173d32" },
  sectionText: { margin: "4px 0 0", color: "#718078", fontSize: 13 },
  moduleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(225px,1fr))", gap: 14 },
  moduleCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", minHeight: 180, padding: 18, border: "1px solid #e1e9e3", borderRadius: 13, background: "white", textAlign: "left", color: "#173d32", boxShadow: "0 4px 13px #173d3209", transition: "transform .15s, box-shadow .15s" },
  moduleIcon: { display: "grid", placeItems: "center", width: 43, height: 43, background: "#f0f7f2", borderRadius: 11, marginBottom: 13 },
  moduleTitle: { fontSize: 15 },
  moduleDescription: { marginTop: 7, color: "#718078", fontSize: 12, lineHeight: 1.5, flex: 1 },
  moduleFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 14, color: "#176b50", fontSize: 10, fontWeight: 900, letterSpacing: ".5px" },
  islamicSection: { marginTop: 30, padding: 21, border: "1px solid #cfe3d6", borderRadius: 16, background: "linear-gradient(140deg,#f0faf4,#ffffff)" },
  islamicHeader: { display: "flex", alignItems: "center", gap: 13, marginBottom: 17 },
  islamicIcon: { display: "grid", placeItems: "center", width: 48, height: 48, background: "#176b50", color: "white", borderRadius: 13 },
  levelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 },
  levelCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", minHeight: 150, padding: 15, textAlign: "left", background: "white", border: "1px solid #dce9df", borderRadius: 12, color: "#173d32", cursor: "pointer", boxShadow: "0 3px 10px #173d3208" },
  levelNumber: { color: "#176b50", fontSize: 11, fontWeight: 900, letterSpacing: "1px" },
  levelName: { marginTop: 10, fontSize: 17 },
  levelDescription: { marginTop: 5, color: "#718078", fontSize: 11, flex: 1 },
  levelOpen: { display: "flex", alignItems: "center", gap: 4, marginTop: 13, color: "#176b50", fontSize: 10, fontWeight: 900 },
  recentList: { background: "white", border: "1px solid #e1e9e3", borderRadius: 12, overflow: "hidden" },
  recentRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 15, borderBottom: "1px solid #edf1ee" },
  recentDate: { margin: "5px 0 0", color: "#718078", fontSize: 11 },
  examStatus: { padding: "5px 9px", borderRadius: 20, background: "#f0f7f2", color: "#176b50", fontSize: 10, fontWeight: 900, textTransform: "uppercase" },
  empty: { padding: 18, background: "white", borderRadius: 10, color: "#718078" },
  bottomNote: { marginTop: 25, color: "#718078", fontSize: 11, textAlign: "center" },
};
