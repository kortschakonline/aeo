import nodemailer from 'nodemailer'

export async function notifyLead(email: string, domain: string, total: number): Promise<void> {
  if (!process.env.SMTP_HOST) { console.warn('SMTP nicht konfiguriert, überspringe Mail'); return }
  const port = Number(process.env.SMTP_PORT ?? 587)
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implizites TLS, 587 = STARTTLS
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `Neuer AEO-Lead: ${domain} (Score ${total})`,
    text: `E-Mail: ${email}\nDomain: ${domain}\nScore: ${total}/100`,
  })
}
