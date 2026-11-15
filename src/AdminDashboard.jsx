
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  BookOpen,
  ClipboardList,
  Trophy,
  Settings,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  FileUp,
  Sparkles,
  UserCog
} from "lucide-react";

import { supabase } from "./supabase";
import "./AdminDashboard.css";

function AdminDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadAdmin = async () => {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/admin-login", { replace: true });
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, email, role")
        .eq("id", user.id)
        .single();

      if (profileError || !data) {
        setError("Unable to load account profile.");
        setLoading(false);
        return;
      }

      if (!["admin", "super_admin"].includes(data.role)) {
        setError("Administrator access required.");
        setLoading(false);
        return;
      }

      setProfile(data);
      setLoading(false);
    };

    loadAdmin();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  if (loading) {
    return <div className="admin-loading">Loading Admin Panel...</div>;
  }

  if (error) {
    return (
      <div className="admin-denied">
        <ShieldCheck size={45} />
        <h2>ACCESS RESTRICTED</h2>
        <p>{error}</p>
        <button onClick={() => navigate("/")}>Back to Home</button>
      </div>
    );
  }

  const isSuperAdmin = profile.role === "super_admin";

  const modules = [
    {
      title: "Candidate Management",
      description: "View and manage registered candidates.",
      icon: Users,
      path: "/admin/candidates",
      status: "Open Module"
    },
    {
      title: "Question Bank",
      description: "Add, edit and organize quiz questions.",
      icon: BookOpen,
      path: "/admin/questions",
      status: "Open Module"
    },
    {
      title: "PDF Import & OCR",
      description: "Upload scanned PDFs and extract questions.",
      icon: FileUp,
      path: "/admin/questions/import",
      status: "Open Module"
    },
    {
      title: "AI Question Review",
      description: "Review, edit, approve and reject AI drafts.",
      icon: Sparkles,
      path: "/admin/question-review",
      status: "Open Module"
    },
    {
      title: "Examination Management",
      description: "Create, schedule and manage examinations.",
      icon: ClipboardList,
      path: "/admin/exams",
      status: "Open Module"
    },
    {
      title: "Results & Rankings",
      description: "View marks, performance and rankings.",
      icon: Trophy,
      path: "/admin/results",
      status: "Open Module"
    },
    {
      title: "Admin Management",
      description: "Manage administrator accounts and permissions.",
      icon: UserCog,
      path: isSuperAdmin ? "/admin/management" : null,
      status: isSuperAdmin ? "Super Admin" : "Restricted",
      restricted: !isSuperAdmin
    },
    {
      title: "Portal Settings",
      description: "Configure portal preferences.",
      icon: Settings,
      path: "/admin/settings",
      status: "Coming next"
    }
  ];

  return (
    <main className="admin-page">
      <div className="admin-container">

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

          <button className="admin-logout" onClick={handleLogout}>
            <LogOut size={17} />
            Logout
          </button>
        </div>

        <section className="admin-welcome">
          <div>
            <p className="admin-eyebrow">WELCOME BACK</p>
            <h2>{profile.full_name || "Administrator"}</h2>
            <p>Manage the Islamic Quiz 2026 portal.</p>
          </div>

          <div className="admin-role">
            <ShieldCheck size={20} />
            {isSuperAdmin ? "SUPER ADMIN" : "ADMIN"}
          </div>
        </section>

        <div className="admin-section-title">
          <h2>PORTAL MANAGEMENT</h2>
          <p>Administration modules</p>
        </div>

        <section className="admin-module-grid">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <article
                className="admin-module-card"
                key={module.title}
                onClick={() => module.path && navigate(module.path)}
                style={{
                  cursor: module.path ? "pointer" : "default"
                }}
              >
                <div className="admin-module-icon">
                  <Icon size={25} />
                </div>

                <h3>{module.title}</h3>
                <p>{module.description}</p>

                <span
                  className={
                    module.restricted
                      ? "admin-module-status restricted"
                      : "admin-module-status"
                  }
                >
                  {module.status}
                </span>
              </article>
            );
          })}
        </section>

        <p className="admin-notice">
          Administrator access is subject to assigned permissions.
        </p>

      </div>
    </main>
  );
}

export default AdminDashboard;
