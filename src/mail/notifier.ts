import nodemailer from 'nodemailer'

function createTransport() {
  if (!process.env.SMTP_HOST) return null
  const port = Number(process.env.SMTP_PORT ?? 587)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
}

export async function notifyLead(email: string, domain: string, total: number): Promise<void> {
  const transport = createTransport()
  if (!transport) { console.warn('SMTP nicht konfiguriert, überspringe Mail'); return }
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `Neuer AEO-Lead: ${domain} (Score ${total})`,
    text: `E-Mail: ${email}\nDomain: ${domain}\nScore: ${total}/100`,
  })
}

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const transport = createTransport()
  if (!transport) { console.warn('SMTP nicht konfiguriert, überspringe Magic-Link'); return }
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Dein Login-Link für aeo.kortschak.online',
    text: `Hallo,\n\nhier ist dein Login-Link für das AEO-Tool:\n${link}\n\nDer Link ist 15 Minuten gültig und kann nur einmal verwendet werden. Falls du keinen Login angefordert hast, ignoriere diese E-Mail.\n\n— AEO-Tool, Kortschak`,
  })
}
