
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Header from "./Header";
import Footer from "./Footer";

import Register from "./Register";
import Login from "./Login";
import AuthCallback from "./AuthCallback";
import Success from "./Success";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import ProtectedRoute from "./ProtectedRoute";

function App() {
  return (
    <>
      <Header />

      <Routes>
        <Route path="/" element={<Register />} />

        <Route path="/login" element={<Login />} />

        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route path="/success" element={<Success />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
