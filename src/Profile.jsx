
import React, { useEffect, useState } from "react";
import {
  UserRound, Mail, Phone, MapPin, Hash,
  CalendarDays, ArrowLeft, Save, RefreshCw,
  ShieldCheck, AlertCircle, CheckCircle
} from "lucide-react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";
import "./Profile.css";

function Profile() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    mobile_number: "",
    address: "",
    pin_code: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/login", { replace: true });
        return;
      }

      setUserId(user.id);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, mobile_number, address, pin_code, email, created_at")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      setProfile(data);
      setForm({
        full_name: data.full_name || "",
        mobile_number: data.mobile_number || "",
        address: data.address || "",
        pin_code: data.pin_code || ""
      });
    } catch (err) {
      setError(err.message || "Unable to load your profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((old) => ({ ...old, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!form.full_name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!form.mobile_number.trim()) {
      setError("Please enter your mobile number.");
      return;
    }

    if (!form.address.trim()) {
      setError("Please enter your residential address.");
      return;
    }

    if (!form.pin_code.trim()) {
      setError("Please enter your PIN code.");
      return;
    }

    if (!/^[0-9]{6}$/.test(form.pin_code.trim())) {
      setError("PIN code must contain exactly 6 digits.");
      return;
    }

    setSaving(true);

    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          mobile_number: form.mobile_number.trim(),
          address: form.address.trim(),
          pin_code: form.pin_code.trim(),
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .select("full_name, mobile_number, address, pin_code, email, created_at")
        .single();

      if (updateError) throw updateError;

      setProfile(data);
      setMessage("Your profile has been updated successfully.");
    } catch (err) {
      setError(err.message || "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="profile-loading">Loading your profile...</div>;
  }

  if (!profile) {
    return (
      <div className="profile-loading">
        <p>{error || "Unable to load your profile."}</p>
        <button onClick={loadProfile}><RefreshCw size={16} /> Try Again</button>
      </div>
    );
  }

  return (
    <section className="profile-section">
      <div className="profile-container">
        <div className="profile-heading">
          <h2>My Profile</h2>
          <p>View and update your registered candidate information.</p>
        </div>

        <div className="profile-card">
          <div className="profile-top">
            <div className="profile-avatar">
              <UserRound size={38} />
            </div>
            <h3>{profile.full_name || "Candidate"}</h3>
            <span className="profile-status">Registered Candidate</span>
          </div>

          <div className="profile-divider" />

          {error && (
            <div style={{
              background: "#fff1f0", color: "#b42318",
              borderRadius: 8, padding: 12, marginBottom: 16,
              display: "flex", gap: 8, alignItems: "center"
            }}>
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {message && (
            <div style={{
              background: "#edf8f1", color: "#176b50",
              borderRadius: 8, padding: 12, marginBottom: 16,
              display: "flex", gap: 8, alignItems: "center"
            }}>
              <CheckCircle size={18} /> {message}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: "grid", gap: 15 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Full Name
              </label>
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                required
                maxLength={120}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Email Address
              </label>
              <div style={readOnlyStyle}>
                <Mail size={18} />
                <span>{profile.email || "Not available"}</span>
              </div>
              <small style={{ color: "#718078" }}>
                Login email cannot be changed from this profile page.
              </small>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Mobile Number
              </label>
              <input
                name="mobile_number"
                value={form.mobile_number}
                onChange={handleChange}
                required
                maxLength={20}
                style={fieldStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Residential Address
              </label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                required
                rows={3}
                maxLength={500}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                PIN Code
              </label>
              <input
                name="pin_code"
                value={form.pin_code}
                onChange={handleChange}
                required
                maxLength={6}
                inputMode="numeric"
                style={fieldStyle}
              />
            </div>

            <div style={readOnlyStyle}>
              <CalendarDays size={18} />
              <span>
                Registration Date:{" "}
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString("en-IN")
                  : "Not available"}
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%",
                border: 0,
                borderRadius: 8,
                padding: "13px 16px",
                background: "#176b50",
                color: "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}
            >
              <Save size={18} />
              {saving ? "Saving Changes..." : "Save Profile"}
            </button>
          </form>
        </div>

        <button
          className="profile-back-button"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={18} /> Back to Dashboard
        </button>
      </div>
    </section>
  );
}

const fieldStyle = {
  width: "100%",
  padding: "12px 13px",
  border: "1px solid #d4dfd8",
  borderRadius: 8,
  background: "#fff",
  color: "#173d32",
  fontSize: 14,
  outlineColor: "#176b50"
};

const readOnlyStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 13px",
  border: "1px solid #e0e8e2",
  borderRadius: 8,
  background: "#f7faf8",
  color: "#53675d",
  fontSize: 14
};

export default Profile;
