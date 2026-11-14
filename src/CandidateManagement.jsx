
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Users,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
} from "lucide-react";

import { supabase } from "./supabase";
import "./CandidateManagement.css";

function CandidateManagement() {
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCandidates = async () => {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, mobile_number, address, pin_code, email, role, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setCandidates([]);
    } else {
      setCandidates(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const filteredCandidates = candidates.filter((candidate) => {
    const term = search.toLowerCase();

    return (
      (candidate.full_name || "").toLowerCase().includes(term) ||
      (candidate.email || "").toLowerCase().includes(term) ||
      (candidate.mobile_number || "").includes(term)
    );
  });

  const formatDate = (date) => {
    if (!date) return "Not available";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <main className="candidate-management-page">
      <div className="candidate-management-container">

        <button
          className="candidate-back-button"
          onClick={() => navigate("/admin")}
        >
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>

        <div className="candidate-management-heading">
          <div>
            <span>ADMINISTRATION</span>
            <h1>Candidate Management</h1>
            <p>View and manage registered quiz candidates.</p>
          </div>

          <button
            className="candidate-refresh-button"
            onClick={loadCandidates}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        <section className="candidate-stats">
          <div className="candidate-stat-icon">
            <Users size={25} />
          </div>
          <div>
            <p>TOTAL REGISTERED ACCOUNTS</p>
            <h2>{candidates.length}</h2>
          </div>
        </section>

        <div className="candidate-search">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search by name, email or mobile number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="candidate-message">
            Loading registered candidates...
          </div>
        ) : error ? (
          <div className="candidate-error">
            Unable to load candidates: {error}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="candidate-message">
            No matching candidates found.
          </div>
        ) : (
          <section className="candidate-list">
            <div className="candidate-list-heading">
              <h2>REGISTERED ACCOUNTS</h2>
              <span>{filteredCandidates.length} records</span>
            </div>

            {filteredCandidates.map((candidate) => (
              <article
                className="candidate-card"
                key={candidate.id}
              >
                <div className="candidate-card-top">
                  <div className="candidate-avatar">
                    {(candidate.full_name || "C")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="candidate-name">
                    <h3>{candidate.full_name || "Unnamed Candidate"}</h3>
                    <span className="candidate-id">
                      ID: {candidate.id.slice(0, 8)}
                    </span>
                  </div>

                  <span className={`candidate-role ${candidate.role}`}>
                    {(candidate.role || "candidate").replace("_", " ")}
                  </span>
                </div>

                <div className="candidate-details">
                  <div>
                    <Mail size={16} />
                    <span>{candidate.email || "Not available"}</span>
                  </div>

                  <div>
                    <Phone size={16} />
                    <span>{candidate.mobile_number || "Not available"}</span>
                  </div>

                  <div>
                    <MapPin size={16} />
                    <span>
                      {candidate.address || "Not available"}
                      {candidate.pin_code
                        ? ` - ${candidate.pin_code}`
                        : ""}
                    </span>
                  </div>

                  <div>
                    <CalendarDays size={16} />
                    <span>
                      Registered: {formatDate(candidate.created_at)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

      </div>
    </main>
  );
}

export default CandidateManagement;
