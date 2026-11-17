
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

function AuthCallback() {
  const navigate = useNavigate();
  const started = useRef(false);
  const [message, setMessage] = useState("Verifying your email...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const verifyEmail = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        // PKCE verification link
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) throw exchangeError;

          setMessage("Email verified successfully. Opening Welcome page...");
          navigate("/", { replace: true });
          return;
        }

        // Email OTP verification link
        if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });

          if (verifyError) throw verifyError;

          setMessage("Email verified successfully. Opening Welcome page...");
          navigate("/", { replace: true });
          return;
        }

        // Supabase may already have processed the URL session.
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (data?.session) {
          setMessage("Your account is verified. Opening Welcome page...");
          navigate("/", { replace: true });
          return;
        }

        setError(
          "This verification link is invalid, expired, or already used."
        );
        setMessage("Email verification could not be completed.");
      } catch (err) {
        setError(err.message || "Email verification failed.");
        setMessage("Email verification could not be completed.");
      }
    };

    verifyEmail();
  }, [navigate]);

  return (
    <main
      style={{
        minHeight: "65vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        background: "#f5f8f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 30,
          background: "#fff",
          border: "1px solid #dce9e1",
          borderRadius: 14,
          textAlign: "center",
          boxShadow: "0 8px 25px #173d3210",
        }}
      >
        <h2 style={{ color: error ? "#b42318" : "#176b50" }}>
          {message}
        </h2>

        {error && (
          <>
            <p style={{ color: "#718078", lineHeight: 1.6 }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              style={{
                marginTop: 12,
                padding: "11px 22px",
                background: "#176b50",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Go to Welcome Page
            </button>
          </>
        )}

        {!error && <p style={{ color: "#718078" }}>Please wait...</p>}
      </div>
    </main>
  );
}

export default AuthCallback;
