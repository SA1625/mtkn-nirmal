
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";

function Success() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/login", { replace: true });
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <section style={{
      minHeight: "60vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "30px"
    }}>
      <div style={{ textAlign: "center" }}>
        <CheckCircle size={75} color="#16834a" />
        <h1 style={{ color: "#145c38" }}>
          Registration Successful!
        </h1>
        <p>Your email has been verified successfully.</p>
        <p>You will be redirected to the Login Page in 3 seconds...</p>
      </div>
    </section>
  );
}

export default Success;
