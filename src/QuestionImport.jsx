import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileUp, FileText, ShieldCheck } from "lucide-react";
import { supabase } from "./supabase";
import "./QuestionImport.css";

export default function QuestionImport() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const uploadPdf = async (event) => {
    event.preventDefault();
    setMessage(""); setError("");
    if (!file) return setError("Please select the organisation's PDF question bank.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setError("Only PDF files are accepted.");
    }
    setBusy(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please login again as an administrator.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${userData.user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("question-bank-pdfs")
        .upload(filePath, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { error: recordError } = await supabase.from("question_import_batches").insert({
        file_name: file.name,
        file_path: filePath,
        status: "uploaded",
        uploaded_by: userData.user.id,
      });
      if (recordError) throw recordError;
      setMessage("PDF uploaded securely. It is saved as a pending import; no questions have been added to the live bank yet.");
      setFile(null);
      event.target.reset();
    } catch (e) {
      setError(e.message || "PDF upload failed.");
    } finally { setBusy(false); }
  };

  return <main className="qi-page"><div className="qi-wrap">
    <button className="qi-back" onClick={() => navigate("/admin/questions")}><ArrowLeft size={18}/> Back to Question Bank</button>
    <header className="qi-head"><span>ADMINISTRATION</span><h1>PDF QUESTION IMPORT</h1><p>Upload the organisation's original question bank for controlled processing.</p></header>
    <section className="qi-card">
      <div className="qi-icon"><FileText size={30}/></div>
      <h2>Upload Original Question Bank</h2>
      <p>Select the PDF supplied by the organisation. The file will be stored securely for the import workflow.</p>
      <form onSubmit={uploadPdf}>
        <label className="qi-drop"><FileUp size={25}/><strong>{file ? file.name : "Choose PDF file"}</strong><small>PDF format only</small><input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
        <button className="qi-upload" disabled={busy || !file}>{busy ? "Uploading..." : "Upload PDF"}</button>
      </form>
      {message && <p className="qi-success">{message}</p>}{error && <p className="qi-error">{error}</p>}
    </section>
    <section className="qi-note"><ShieldCheck size={22}/><div><strong>Admin approval required</strong><p>Uploaded PDFs are not automatically published. Extraction, Section A/B classification, AI-generated distractors, duplicate checks and admin review must happen before questions enter the live bank. This processing stage will be connected after the organisation provides the actual PDF and its layout can be checked.</p></div></section>
  </div></main>;
}
