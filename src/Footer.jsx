
import React from "react";
import { MapPin, Phone } from "lucide-react";
import "./Footer.css";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">

        <div className="footer-item">
          <MapPin size={22} />
          <div>
            <h3>Our Address</h3>
            <p>
              Saleem Complex, Opp. Masjid-e-Budhwarpeth,
              Nirmal
            </p>
          </div>
        </div>

        <div className="footer-item">
          <Phone size={22} />
          <div>
            <h3>Contact Us</h3>
            <p>9440933980 · 9640463320 · 9398984245</p>
          </div>
        </div>

      </div>

      <div className="footer-bottom">
        © {new Date().getFullYear()} Majlise Tahaffuze Khatme
        Nubuwwat Trust. All Rights Reserved.
      </div>
    </footer>
  );
}

export default Footer;
