import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

export function hasSmtpConfig() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

export function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587", 10),
    secure: SMTP_SECURE === "true",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

export async function sendQrEmail(input) {
  if (!hasSmtpConfig()) {
    throw new Error("SMTP is not configured.");
  }

  const defaultSubject = "Your event QR code";
  const defaultBody = `
    <p>Hello {{name}},</p>
    <p>Your event QR code is attached below. Please show it at the registration desk.</p>
    <p>{{qr_code_image}}</p>
    <p>If the image does not load, contact the organizing team.</p>
  `;

  let subject = input.subjectTemplate || defaultSubject;
  let html = input.bodyTemplate || defaultBody;

  // Prepare template variables
  const templateVars = {
    ...input.variables,
    qr_code_image: '<img src="cid:qrcode" alt="Event QR code" style="max-width: 260px; height: auto;" />'
  };

  // Interpolation function
  const interpolate = (str) => {
    return str.replace(/{{(.*?)}}/g, (match, key) => {
      const val = templateVars[key.trim()];
      return val !== undefined ? String(val) : match;
    });
  };

  subject = interpolate(subject);
  html = interpolate(html);

  const transport = createTransport();
  return transport.sendMail({
    from: SMTP_FROM || "Amaze Reg Desk <noreply@example.com>",
    to: input.to,
    subject: subject,
    html: html,
    attachments: [
      {
        filename: "qrcode.png",
        path: input.qrDataUrl,
        cid: "qrcode"
      }
    ]
  });
}
