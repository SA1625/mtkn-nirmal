import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { Eye, EyeOff } from "lucide-react";
import "./Login.css";

function Login() {
    const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
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
    if (!email.trim()) {
      setMessage("Please enter your registered email address first.");
      return;
    }

    setResetLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (error) throw error;

      setMessage("Password reset email sent. Please check your inbox.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <section className="login-section">
      <div className="login-card">
        <h2>Candidate Login</h2>

        <p className="login-subtitle">
          Login to your Islamic Quiz account
        </p>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email Address</label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>

          <div className="forgot-password">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
            >
              {resetLoading ? "Sending..." : "Forgot Password?"}
            </button>
          </div>

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
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default Login;
