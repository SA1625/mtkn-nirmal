
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "./supabase";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      navigate("/dashboard", { replace: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setMessage("");

    if (!email.trim()) {
      setMessage("Please enter your registered email address first.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) throw error;

      setMessage("Password reset link sent. Please check your email.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-section">
      <div className="login-card">

        <div className="login-icon">
          <LockKeyhole size={32} />
        </div>

        <h2>CANDIDATE LOGIN</h2>

        <p className="login-subtitle">
          Welcome back to Islamic Quiz 2026
        </p>

        <form onSubmit={handleLogin} className="login-form">

          <div className="login-form-group">
            <label>Email Address</label>
            <div className="login-input-wrap">
              <Mail size={19} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter registered email"
                required
              />
            </div>
          </div>

          <div className="login-form-group">
            <label>Password</label>
            <div className="login-input-wrap">
              <LockKeyhole size={19} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="forgot-password"
            onClick={handleForgotPassword}
            disabled={loading}
          >
            Forgot Password?
          </button>

          {message && (
            <p className="login-message" role="status">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "PLEASE WAIT..." : "LOGIN TO YOUR ACCOUNT"}
          </button>

        </form>

        <p className="register-link">
          New candidate? <Link to="/register">Register here</Link>
        </p>

        <Link to="/" className="back-home">
          Back to Home
        </Link>

      </div>
    </main>
  );
}

export default Login;
