// Zentrale Stammdaten — werden in Footer, Kontakt, Impressum & Datenschutz genutzt.
type SiteConfig = {
  brand: string;
  legalName: string;
  managingDirector: string;
  tagline: string;
  services: string[];
  /** Interne Adresse für Anfragen/CTA & Lead-Benachrichtigungen (nicht das Office). */
  inquiryEmail: string;
  street: string;
  zipCity: string;
  phone: string;
  email: string;
  web: string;
  uid: string;
  registerNumber: string;
  registerCourt: string;
  gln: string;
  trade: string;
  chamber: string;
  supervisoryAuthority: string;
};

export const SITE: SiteConfig = {
  brand: "Kortschak Schriften GmbH",
  legalName: "Kortschak Schriften GmbH",
  managingDirector: "Anja Brandl",
  tagline:
    "Werbetechnik, Fahrzeugbeschriftung & Web aus Trofaiach. Wir machen deine Marke sichtbar — auch für KI.",
  services: ["Werbetechnik", "Fahrzeugbeschriftungen", "Web & Online-Tools"],
  inquiryEmail: "mail@kortschak.online",
  street: "Bahnhofstraße 6",
  zipCity: "8793 Trofaiach",
  phone: "+43 (0)3847 / 67666",
  email: "office@schriften-kortschak.at",
  web: "schriften-kortschak.at",
  uid: "ATU71916536",
  registerNumber: "465703h",
  registerCourt: "Landesgericht Leoben",
  gln: "9110024368190",
  trade: "Beschriftungsdesigner und Werbetechniker",
  chamber: "WKO Steiermark",
  supervisoryAuthority: "Bezirkshauptmannschaft Leoben",
};
