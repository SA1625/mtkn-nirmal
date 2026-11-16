
import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

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
import CandidateExam from "./CandidateExam";
import ExamHistory from "./ExamHistory";
import Leaderboard from "./Leaderboard";
import PerformanceAnalytics from "./PerformanceAnalytics";

import ProtectedRoute from "./ProtectedRoute";

import AdminDashboard from "./AdminDashboard";
import CandidateManagement from "./CandidateManagement";
import QuestionBank from "./QuestionBank";
import QuestionImport from "./QuestionImport";
import QuestionReview from "./QuestionReview";
import IslamicBookReview from "./IslamicBookReview";

import ExamManagement from "./ExamManagement";
import AdminResults from "./AdminResults";
import AdminManagement from "./AdminManagement";

function AppLayout() {
  const location = useLocation();

  // Hide Header and Footer only on candidate exam page.
  const isExamPage = /^\/exam\/[^/]+$/.test(
    location.pathname
  );

  return (
    <>
      {!isExamPage && <Header />}

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

        <Route
          path="/exam/:examId"
          element={
            <ProtectedRoute>
              <CandidateExam />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-exams"
          element={
            <ProtectedRoute>
              <ExamHistory />
            </ProtectedRoute>
          }
        />

        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <PerformanceAnalytics />
            </ProtectedRoute>
          }
        />


        {/* ADMIN PAGES */}

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/candidates"
          element={
            <ProtectedRoute>
              <CandidateManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/questions"
          element={
            <ProtectedRoute>
              <QuestionBank />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/questions/import"
          element={
            <ProtectedRoute>
              <QuestionImport />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/question-review"
          element={
            <ProtectedRoute>
              <QuestionReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/islamic-book-review"
          element={
            <ProtectedRoute>
              <IslamicBookReview />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/exams"
          element={
            <ProtectedRoute>
              <ExamManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/results"
          element={
            <ProtectedRoute>
              <AdminResults />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/management"
          element={
            <ProtectedRoute>
              <AdminManagement />
            </ProtectedRoute>
          }
        />


        {/* INVALID URL */}

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>

      {!isExamPage && <Footer />}
    </>
  );
}

function App() {
  return <AppLayout />;
}

export default App;
