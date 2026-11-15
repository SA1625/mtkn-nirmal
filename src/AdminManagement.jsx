
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Users, UserCog, Search, RefreshCw } from "lucide-react";
import { supabase } from "./supabase";
import "./AdminManagement.css";

export default function AdminManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setMessage("");

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      navigate("/admin-login");
      return;
    }

    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (me?.role !== "super_admin") {
      navigate("/admin");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, mobile_number, role, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setUsers(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const changeRole = async (person, newRole) => {
    const action = newRole === "admin" ? "make this user an Admin" : "remove Admin access";

    if (!window.confirm(`Are you sure you want to ${action} for ${person.full_name}?`)) {
      return;
    }

    setBusy(person.id);
    setMessage("");

    const { error } = await supabase.rpc("change_user_role", {
      p_user_id: person.id,
      p_new_role: newRole
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Updated ${person.full_name} successfully.`);
      await loadUsers();
    }

    setBusy("");
  };

  const filteredUsers = users.filter((person) =>
    `${person.full_name} ${person.email} ${person.mobile_number}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const adminCount = users.filter((u) => u.role === "admin").length;
  const candidateCount = users.filter((u) => u.role === "candidate").length;

  return (
    <main className="am-page">
      <div className="am-container">
        <button className="am-back" onClick={() => navigate("/admin")}>
          <ArrowLeft size={18} /> Back to Dashboard
        </button>

        <header className="am-header">
          <div className="am-heading-icon"><ShieldCheck size={28} /></div>
          <div>
            <h1>ADMIN MANAGEMENT</h1>
            <p>Manage administrator access and permissions</p>
          </div>
        </header>

        <section className="am-stats">
          <div><Users /><span>Total Accounts</span><strong>{users.length}</strong></div>
          <div><ShieldCheck /><span>Administrators</span><strong>{adminCount}</strong></div>
          <div><UserCog /><span>Candidates</span><strong>{candidateCount}</strong></div>
        </section>

        {message && <div className="am-message">{message}</div>}

        <div className="am-toolbar">
          <div className="am-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or mobile..."
            />
          </div>
          <button onClick={loadUsers}><RefreshCw size={17} /> Refresh</button>
        </div>

        {loading ? (
          <div className="am-empty">Loading accounts...</div>
        ) : (
          <div className="am-table-wrap">
            <table className="am-table">
              <thead>
                <tr>
                  <th>Candidate / Admin</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Access Management</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.full_name || "Unnamed User"}</strong>
                      <small>{person.email}</small>
                    </td>
                    <td>{person.mobile_number || "—"}</td>
                    <td>
                      <span className={`am-role ${person.role}`}>
                        {person.role?.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {person.role === "super_admin" ? (
                        <span className="am-protected">Protected Account</span>
                      ) : person.role === "admin" ? (
                        <button
                          className="am-demote"
                          disabled={busy === person.id}
                          onClick={() => changeRole(person, "candidate")}
                        >
                          {busy === person.id ? "Updating..." : "Revoke Admin"}
                        </button>
                      ) : (
                        <button
                          className="am-promote"
                          disabled={busy === person.id}
                          onClick={() => changeRole(person, "admin")}
                        >
                          {busy === person.id ? "Updating..." : "Make Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="am-empty">No accounts found.</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
