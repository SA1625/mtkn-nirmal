
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Settings, Save, RefreshCw } from "lucide-react";
import { supabase } from "./supabase";
import "./PortalSettings.css";

export default function PortalSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [exam, setExam] = useState({
    duration_minutes: 180,
    total_questions: 100,
    true_false_count: 40,
    mcq_count: 60,
    correct_marks: 1,
    negative_marks: 0,
    attempt_limit: 1
  });
  const [info, setInfo] = useState({
    portal_name: "ISLAMIC QUIZ 2026",
    organization: "MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST",
    location: "NIRMAL DIST, TG"
  });

  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate("/admin-login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["admin", "super_admin"].includes(profile.role)) {
        navigate("/admin-login");
        return;
      }

      setRole(profile.role);

      const { data, error } = await supabase
        .from("portal_settings")
        .select("setting_key, setting_value");

      if (error) {
        setMessage(error.message);
      } else {
        data?.forEach((item) => {
          if (item.setting_key === "exam_defaults") {
            setExam((old) => ({ ...old, ...item.setting_value }));
          }
          if (item.setting_key === "portal_info") {
            setInfo((old) => ({ ...old, ...item.setting_value }));
          }
        });
      }

      setLoading(false);
    };

    loadSettings();
  }, [navigate]);

  const updateExam = (key, value) => {
    setExam((old) => ({ ...old, [key]: Number(value) }));
  };

  const saveSettings = async () => {
    if (role !== "super_admin") {
      setMessage("Only Super Admin can save portal settings.");
      return;
    }

    if (
      exam.total_questions !== 100 ||
      exam.true_false_count !== 40 ||
      exam.mcq_count !== 60 ||
      exam.duration_minutes < 1 ||
      exam.duration_minutes > 180 ||
      exam.correct_marks !== 1 ||
      exam.negative_marks !== 0 ||
      exam.attempt_limit !== 1
    ) {
      setMessage("The official exam pattern is fixed: 100 questions, 40 True/False, 60 MCQs, +1, no negative marking, one attempt and maximum 180 minutes.");
      return;
    }

    setSaving(true);
    setMessage("");

    const updates = [
      { setting_key: "exam_defaults", setting_value: exam },
      { setting_key: "portal_info", setting_value: info }
    ];

    const { error } = await supabase
      .from("portal_settings")
      .upsert(
        updates.map((item) => ({
          ...item,
          updated_at: new Date().toISOString()
        })),
        { onConflict: "setting_key" }
      );

    setSaving(false);
    setMessage(error ? error.message : "Portal settings saved successfully.");
  };

  if (loading) return <div className="ps-loading">Loading Portal Settings...</div>;

  return (
    <main className="ps-page">
      <div className="ps-container">
        <button className="ps-back" onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Back to Dashboard
        </button>

        <header className="ps-header">
          <div className="ps-icon"><Settings size={28} /></div>
          <div>
            <h1>PORTAL SETTINGS</h1>
            <p>Configure examination defaults and portal information</p>
          </div>
        </header>

        {message && <div className="ps-message">{message}</div>}

        <section className="ps-card">
          <div className="ps-card-heading">
            <div>
              <h2>Examination Configuration</h2>
              <p>Official Islamic Quiz examination pattern</p>
            </div>
            <span className="ps-fixed">FIXED PATTERN</span>
          </div>

          <div className="ps-grid">
            <label>Duration (minutes)
              <input type="number" min="1" max="180" value={exam.duration_minutes}
                disabled={role !== "super_admin"}
                onChange={(e) => updateExam("duration_minutes", e.target.value)} />
            </label>

            <label>Total Questions
              <input type="number" value={exam.total_questions} disabled />
            </label>

            <label>True / False Questions
              <input type="number" value={exam.true_false_count} disabled />
            </label>

            <label>MCQ Questions
              <input type="number" value={exam.mcq_count} disabled />
            </label>

            <label>Marks for Correct Answer
              <input type="number" value={exam.correct_marks} disabled />
            </label>

            <label>Negative Marks
              <input type="number" value={exam.negative_marks} disabled />
            </label>

            <label>Attempts Per Candidate
              <input type="number" value={exam.attempt_limit} disabled />
            </label>
          </div>
        </section>

        <section className="ps-card">
          <h2>Portal Information</h2>
          <p className="ps-description">Organization details displayed in the portal.</p>

          <div className="ps-grid">
            <label>Portal Name
              <input value={info.portal_name} disabled={role !== "super_admin"}
                onChange={(e) => setInfo({ ...info, portal_name: e.target.value })} />
            </label>

            <label>Organization Name
              <input value={info.organization} disabled={role !== "super_admin"}
                onChange={(e) => setInfo({ ...info, organization: e.target.value })} />
            </label>

            <label>Location
              <input value={info.location} disabled={role !== "super_admin"}
                onChange={(e) => setInfo({ ...info, location: e.target.value })} />
            </label>
          </div>
        </section>

        <div className="ps-actions">
          <span>{role === "super_admin" ? "Super Admin access" : "View only — Admin access"}</span>
          {role === "super_admin" && (
            <button onClick={saveSettings} disabled={saving}>
              {saving ? <RefreshCw size={17} /> : <Save size={17} />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
