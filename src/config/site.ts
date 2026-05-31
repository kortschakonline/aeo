// Zentrale Stammdaten — werden in Footer, Kontakt & Impressum genutzt.
// TODO: Mit echten Daten des Nutzers füllen (Adresse, Telefon, UID …).
type SiteConfig = {
  brand: string;
  legalName: string;
  tagline: string;
  street: string;
  zipCity: string;
  phone: string;
  email: string;
  web: string;
  uid: string;
  authority: string;
};

export const SITE: SiteConfig = {
  brand: "Kortschak",
  legalName: "Kortschak", // TODO: vollständiger Firmenname/Inhaber
  tagline:
    "Werbeagentur & Werbetechnik. Wir machen deine Marke sichtbar — auch für KI.",
  street: "", // TODO
  zipCity: "", // TODO
  phone: "", // TODO
  email: "office@kortschak.online", // TODO: öffentliche Kontaktadresse bestätigen
  web: "kortschak.online",
  uid: "", // TODO: UID/Firmenbuch
  authority: "", // TODO: Gewerbebehörde/Kammer
};
