
import React, { useEffect, useState } from "react";
import "./Dashboard.css";
import {
  CalendarDays,
  ClipboardList,
  Trophy,
  FileText,
  ChartNoAxesColumn,
  UserRound,
  LogOut
} from "lucide-react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();

  const [candidateName, setCandidateName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCandidate = async () => {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError) throw userError;

        const user = userData.user;

        if (!user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        setCandidateName(data.full_name);
      } catch (error) {
        console.error("Candidate profile error:", error.message);
      } finally {
        setLoading(false);
      }
    };

    loadCandidate();
  }, [navigate]);

  const sections = [
    { title: "Upcoming Examinations", icon: CalendarDays },
    { title: "Available Mock Tests", icon: ClipboardList },
    { title: "Completed Examinations", icon: FileText },
    { title: "My Results & PDF Reports", icon: FileText },
    { title: "Performance Analytics", icon: ChartNoAxesColumn },
    { title: "Leaderboard", icon: Trophy },
    {
      title: "My Profile & Settings",
      icon: UserRound,
      action: () => navigate("/profile")
    },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <section className="dashboard-section">
      <div className="dashboard-container">

        <div className="dashboard-heading">
          <div>
            <h2>Candidate Dashboard</h2>

            <p>
              {loading
                ? "Loading your profile..."
                : `Welcome, ${candidateName || "Candidate"}!`}
            </p>

            <p>Welcome to Khatme Nubuwwat Quiz 2026 Portal</p>
          </div>

          <button onClick={handleLogout} className="logout-button">
            <LogOut size={18} /> Logout
          </button>
        </div>

        <div className="dashboard-grid">
          {sections.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                className="dashboard-card"
                key={index}
                onClick={item.action}
                style={{
                  cursor: item.action ? "pointer" : "default"
                }}
              >
                <Icon size={30} />
                <h3>{item.title}</h3>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

export default Dashboard;
