
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Dashboard.css";

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const verifyEmail = async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (!code) {
        setMessage("Verification link is invalid or expired. Please register again.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        setMessage("Verification failed: " + error.message);
        return;
      }

      navigate("/success", { replace: true });
    };

    verifyEmail();
  }, [navigate]);

  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <h2>{message}</h2>
      <p>Please wait...</p>
    </div>
  );
}

export default AuthCallback;
