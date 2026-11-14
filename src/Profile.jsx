
import React, { useEffect, useState } from "react";
import {
  UserRound,
  Mail,
  Phone,
  MapPin,
  Hash,
  CalendarDays,
  ArrowLeft
} from "lucide-react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";
import "./Profile.css";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/login", { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, mobile_number, address, pin_code, email, created_at")
        .eq("id", user.id)
        .single();

      if (!error) setProfile(data);

      setLoading(false);
    };

    loadProfile();
  }, [navigate]);

  if (loading) {
    return <div className="profile-loading">Loading your profile...</div>;
  }

  if (!profile) {
    return <div className="profile-loading">Unable to load your profile.</div>;
  }

  const details = [
    { label: "Email Address", value: profile.email, icon: Mail },
    { label: "Mobile Number", value: profile.mobile_number, icon: Phone },
    { label: "Residential Address", value: profile.address, icon: MapPin },
    { label: "PIN Code", value: profile.pin_code, icon: Hash },
    {
      label: "Registration Date",
      value: new Date(profile.created_at).toLocaleDateString("en-IN"),
      icon: CalendarDays
    }
  ];

  return (
    <section className="profile-section">
      <div className="profile-container">

        <div className="profile-heading">
          <h2>My Profile</h2>
          <p>View your registered candidate information</p>
        </div>

        <div className="profile-card">

          <div className="profile-top">
            <div className="profile-avatar">
              <UserRound size={38} />
            </div>

            <h3>{profile.full_name}</h3>
            <span className="profile-status">Registered Candidate</span>
          </div>

          <div className="profile-divider"></div>

          <div className="profile-details">
            {details.map((item, index) => {
              const Icon = item.icon;

              return (
                <div className="profile-detail-row" key={index}>
                  <div className="profile-detail-icon">
                    <Icon size={20} />
                  </div>

                  <div className="profile-detail-text">
                    <span>{item.label}</span>
                    <strong>{item.value || "Not available"}</strong>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        <button
          className="profile-back-button"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={18} />
          Back to Dashboard
        </button>

      </div>
    </section>
  );
}

export default Profile;
