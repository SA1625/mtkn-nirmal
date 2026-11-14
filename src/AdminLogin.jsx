
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, LockKeyhole, Mail, Eye, EyeOff } from "lucide-react";
import { supabase } from "./supabase";
import "./AdminLogin.css";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError) throw profileError;

      if (!["admin", "super_admin"].includes(profile.role)) {
        await supabase.auth.signOut();
        setMessage("Access denied. Administrator account required.");
        return;
      }

      navigate("/admin", { replace: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">

        <div className="admin-login-icon">
          <ShieldCheck size={36} />
        </div>

        <p className="admin-login-label">SECURE ACCESS</p>
        <h1>ADMIN LOGIN</h1>

        <p className="admin-login-subtitle">
          ISLAMIC QUIZ 2026 MANAGEMENT PORTAL
        </p>

        <form onSubmit={handleLogin} className="admin-login-form">

          <label>Administrator Email</label>
          <div className="admin-login-input">
            <Mail size={19} />
            <input
              type="email"
              placeholder="Enter admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <label>Password</label>
          <div className="admin-login-input">
            <LockKeyhole size={19} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          {message && (
            <p className="admin-login-message" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="admin-login-button"
            disabled={loading}
          >
            {loading ? "VERIFYING..." : "SECURE ADMIN LOGIN"}
          </button>

        </form>

        <Link to="/" className="admin-login-home">
          Back to Home
        </Link>

      </section>
    </main>
  );
}

export default AdminLogin;
