
import React, { useState } from "react";
import { supabase } from "./supabase";
import "./Register.css";

function Register() {
  const [form, setForm] = useState({
    full_name: "",
    mobile_number: "",
    address: "",
    pin_code: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    if (form.password !== form.confirm_password) {
      setMessage("Passwords do not match.");
      return;
    }

    if (form.password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: form.full_name,
            mobile_number: form.mobile_number,
            address: form.address,
            pin_code: form.pin_code,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        setMessage(
          "Registration successful! Please check your email for verification."
        );

        setForm({
          full_name: "",
          mobile_number: "",
          address: "",
          pin_code: "",
          email: "",
          password: "",
          confirm_password: "",
        });
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="register-section">
      <div className="register-card">
        <h2>Candidate Registration</h2>
        <p className="register-subtitle">
          Register for the State Level Islamic Quiz
        </p>

        <form className="register-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label>Full Name</label>
            <input name="full_name" value={form.full_name}
              onChange={handleChange} required placeholder="Enter your full name" />
          </div>

          <div className="form-group">
            <label>Mobile Number</label>
            <input name="mobile_number" type="tel" value={form.mobile_number}
              onChange={handleChange} required placeholder="Enter mobile number" />
          </div>

          <div className="form-group">
            <label>Address</label>
            <input name="address" value={form.address}
              onChange={handleChange} required placeholder="Enter your address" />
          </div>

          <div className="form-group">
            <label>PIN Code</label>
            <input name="pin_code" value={form.pin_code}
              onChange={handleChange} required placeholder="Enter PIN code" />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email}
              onChange={handleChange} required placeholder="Enter email address" />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password" value={form.password}
              onChange={handleChange} required placeholder="Create a password" />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input name="confirm_password" type="password"
              value={form.confirm_password} onChange={handleChange}
              required placeholder="Confirm password" />
          </div>

          {message && <p role="status">{message}</p>}

          <button type="submit" className="register-button" disabled={loading}>
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="login-link">
          Already registered? <a href="#">Login here</a>
        </p>
      </div>
    </section>
  );
}

export default Register;
