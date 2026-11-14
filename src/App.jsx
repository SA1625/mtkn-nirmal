
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Header from "./Header";
import Footer from "./Footer";

import Welcome from "./Welcome";
import Register from "./Register";
import Login from "./Login";
import AdminLogin from "./AdminLogin";
import AuthCallback from "./AuthCallback";
import Success from "./Success";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import AdminDashboard from "./AdminDashboard";
import CandidateManagement from "./CandidateManagement";
import QuestionBank from "./QuestionBank";
import QuestionImport from "./QuestionImport";
import ProtectedRoute from "./ProtectedRoute";

function App() {
  return (
    <>
      <Header />

      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/success" element={<Success />} />

        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />

        <Route
          path="/profile"
          element={<ProtectedRoute><Profile /></ProtectedRoute>}
        />

        <Route
          path="/admin"
          element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>}
        />

        <Route
          path="/admin/candidates"
          element={<ProtectedRoute><CandidateManagement /></ProtectedRoute>}
        />

        <Route
          path="/admin/questions"
          element={<ProtectedRoute><QuestionBank /></ProtectedRoute>}
        />
        <Route
          path="/admin/questions/import"
          element={<ProtectedRoute><QuestionImport /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
