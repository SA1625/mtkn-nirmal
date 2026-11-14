
import React from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";

import logo from "./assets/logo.png";
import "./Welcome.css";

function Welcome() {
  return (
    <main className="welcome-page">
      <section className="welcome-card">

        <div className="welcome-icon">
          <img src={logo} alt="MTKN Trust Logo" />
        </div>

        <p className="welcome-label">
          WELCOME TO THE STATE LEVEL ISLAMIC QUIZ
        </p>

        <h1>ISLAMIC QUIZ 2026</h1>

        <div className="welcome-divider" />

        <h2>TEST YOUR KNOWLEDGE ON</h2>

        <h3>
          MUQTASAR AQAID AHL-E-SUNNAT WAL JAMAT AUR
          MOUJUDAH DOUR KE BATIL FIRQHE
        </h3>

        <p className="welcome-description">
          LEARN • UNDERSTAND • TEST YOUR KNOWLEDGE
        </p>

        <div className="welcome-features">
          <div>
            <BookOpen size={20} />
            <span>ISLAMIC KNOWLEDGE</span>
          </div>

          <div>
            <ShieldCheck size={20} />
            <span>TEST YOUR UNDERSTANDING</span>
          </div>
        </div>

        <div className="welcome-buttons">

          <Link to="/register" className="welcome-register">
            CANDIDATE REGISTRATION
          </Link>

          <Link to="/login" className="welcome-login">
            CANDIDATE LOGIN
          </Link>

          <Link to="/admin-login" className="welcome-admin">
            <LockKeyhole size={17} />
            ADMIN LOGIN
          </Link>

        </div>

        <div className="welcome-organizer">
          <p>ORGANIZED BY</p>

          <h4>
            MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST
          </h4>

          <span>NIRMAL DIST, TG</span>
        </div>

      </section>
    </main>
  );
}

export default Welcome;
