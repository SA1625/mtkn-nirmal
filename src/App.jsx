
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
import QuestionReview from "./QuestionReview";
import ExamManagement from "./ExamManagement";
import AdminResults from "./AdminResults";
import AdminManagement from "./AdminManagement";
import PortalSettings from "./PortalSettings";

import CandidateExam from "./CandidateExam";

import ProtectedRoute from "./ProtectedRoute";

function App() {
  return (
    <>
      <Header />

      <Routes>
        {/* PUBLIC PAGES */}
        <Route path="/" element={<Welcome />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/success" element={<Success />} />

        {/* CANDIDATE PAGES */}
        <Route
          path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
        />

        <Route
          path="/profile"
          element={<ProtectedRoute><Profile /></ProtectedRoute>}
        />

        <Route
          path="/exam/:examId"
          element={<ProtectedRoute><CandidateExam /></ProtectedRoute>}
        />

        {/* ADMIN DASHBOARD */}
        <Route
          path="/admin"
          element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>}
        />

        {/* CANDIDATE MANAGEMENT */}
        <Route
          path="/admin/candidates"
          element={<ProtectedRoute><CandidateManagement /></ProtectedRoute>}
        />

        {/* QUESTION BANK */}
        <Route
          path="/admin/questions"
          element={<ProtectedRoute><QuestionBank /></ProtectedRoute>}
        />

        <Route
          path="/admin/questions/import"
          element={<ProtectedRoute><QuestionImport /></ProtectedRoute>}
        />

        <Route
          path="/admin/question-review"
          element={<ProtectedRoute><QuestionReview /></ProtectedRoute>}
        />

        {/* EXAMINATION MANAGEMENT */}
        <Route
          path="/admin/exams"
          element={<ProtectedRoute><ExamManagement /></ProtectedRoute>}
        />

        {/* RESULTS & RANKINGS */}
        <Route
          path="/admin/results"
          element={<ProtectedRoute><AdminResults /></ProtectedRoute>}
        />

        {/* SUPER ADMIN MODULES */}
        <Route
          path="/admin/management"
          element={<ProtectedRoute><AdminManagement /></ProtectedRoute>}
        />

        <Route
          path="/admin/settings"
          element={<ProtectedRoute><PortalSettings /></ProtectedRoute>}
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;
