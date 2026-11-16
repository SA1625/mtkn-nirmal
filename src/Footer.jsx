
import React from "react";
import { MapPin, Phone, PhoneCall } from "lucide-react";
import "./Footer.css";

const contactNumbers = [
  "9440933980",
  "9640463320",
  "9398984245",
];

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">

        {/* Address */}
        <div className="footer-item address-footer-item">
          <MapPin size={22} />

          <div className="address-details">
            <h3>Our Address</h3>

            <a
              href="https://www.google.com/maps/search/?api=1&query=Saleem+Complex+Opp+Masjid-e-Budhwarpeth+Nirmal"
              target="_blank"
              rel="noopener noreferrer"
              className="address-card"
            >
              <MapPin size={19} />

              <span>
                Saleem Complex, Opp. Masjid-e-Budhwarpeth,
                Nirmal
              </span>

              <span className="map-label">MAP ↗</span>
            </a>
          </div>
        </div>

        {/* Contact Numbers */}
        <div className="footer-item contact-footer-item">
          <Phone size={22} />

          <div className="contact-details">
            <h3>Contact Us</h3>

            <div className="contact-cards">
              {contactNumbers.map((number) => (
                <a
                  key={number}
                  href={`tel:${number}`}
                  className="contact-card"
                  aria-label={`Call ${number}`}
                >
                  <PhoneCall size={18} />
                  <span>{number}</span>
                  <span className="call-label">CALL</span>
                </a>
              ))}
            </div>
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
