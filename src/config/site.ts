// Zentrale Stammdaten — werden in Footer, Kontakt, Impressum & Datenschutz genutzt.
type SiteConfig = {
  brand: string;
  legalName: string;
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
  authority: string;
};

export const SITE: SiteConfig = {
  brand: "Kortschak Schriften GmbH",
  legalName: "Kortschak Schriften GmbH",
  tagline:
    "Werbetechnik, Fahrzeugbeschriftung & Web aus Trofaiach. Wir machen deine Marke sichtbar — auch für KI.",
  services: ["Werbetechnik", "Fahrzeugbeschriftungen", "Web & Online-Tools"],
  inquiryEmail: "mail@kortschak.online",
  street: "Bahnstraße 6",
  zipCity: "8793 Trofaiach",
  phone: "+43 3847 67666",
  email: "office@schriften-kortschak.at",
  web: "schriften-kortschak.at",
  uid: "ATU71916536",
  authority: "WKO Steiermark",
};
