
import React from "react";
import {
  MapPin,
  Phone,
  PhoneCall,
  UserRound,
} from "lucide-react";
import "./Footer.css";

const contacts = [
  {
    number: "9440933980",
    name: "MUFTI ILYAS AHMED HAMID QASMI",
    designation: "SARPARAST · MTKN.NIRMAL DIST",
  },
  {
    number: "9640463320",
    name: "MOULANA SYED ABID HUSSAIN",
    designation: "GENERAL SECRETARY · MTKN.NIRMAL DIST",
  },
  {
    number: "9398984245",
    name: "SALMAN AHMED",
    designation: "WEBSITE DEVELOPER · MTKN.NIRMAL DIST",
  },
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

        {/* Contact 1 */}
        <div className="footer-item contact-footer-item">
          <Phone size={22} />

          <div className="contact-details">
            <h3>Contact Person</h3>

            <a
              href={`tel:${contacts[0].number}`}
              className="contact-card"
            >
              <PhoneCall size={18} />
              <div className="contact-person">
                <strong>{contacts[0].name}</strong>
                <small>{contacts[0].designation}</small>
                <span>{contacts[0].number}</span>
              </div>
              <span className="call-label">CALL</span>
            </a>
          </div>
        </div>

        {/* Contact 2 */}
        <div className="footer-item contact-footer-item">
          <Phone size={22} />

          <div className="contact-details">
            <h3>Contact Person</h3>

            <a
              href={`tel:${contacts[1].number}`}
              className="contact-card"
            >
              <PhoneCall size={18} />
              <div className="contact-person">
                <strong>{contacts[1].name}</strong>
                <small>{contacts[1].designation}</small>
                <span>{contacts[1].number}</span>
              </div>
              <span className="call-label">CALL</span>
            </a>
          </div>
        </div>

        {/* Contact 3 */}
        <div className="footer-item contact-footer-item">
          <Phone size={22} />

          <div className="contact-details">
            <h3>Website Developer</h3>

            <a
              href={`tel:${contacts[2].number}`}
              className="contact-card"
            >
              <PhoneCall size={18} />
              <div className="contact-person">
                <strong>{contacts[2].name}</strong>
                <small>{contacts[2].designation}</small>
                <span>{contacts[2].number}</span>
              </div>
              <span className="call-label">CALL</span>
            </a>
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
