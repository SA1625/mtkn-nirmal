
import React from "react";
import "./Header.css";
import logo from "./assets/logo.png";

function Header() {
  return (
    <header className="site-header">
      <div className="header-brand">
        <img
          src={logo}
          alt="Majlise Tahaffuze Khatme Nubuwwat Trust Logo"
          className="organization-logo"
        />

        <div className="organization-details">
          <h1>MAJLISE TAHAFFUZE KHATME NUBUWWAT TRUST</h1>
          <p>NIRMAL DIST, TG</p>
        </div>
      </div>
    </header>
  );
}

export default Header;
