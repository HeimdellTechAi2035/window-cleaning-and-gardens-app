import twilio from "twilio";
import { Resend } from "resend";

let twilioClient: ReturnType<typeof twilio> | null = null;
let resendClient: Resend | null = null;

function getTwilio() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials are not configured");
  twilioClient = twilio(sid, token);
  return twilioClient;
}

function getResend() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendSms(params: { to: string; body: string }) {
  const client = getTwilio();
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER is not configured");
  return client.messages.create({ to: params.to, from, body: params.body });
}

export async function sendWhatsApp(params: { to: string; body: string }) {
  const client = getTwilio();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error("TWILIO_WHATSAPP_FROM is not configured");
  return client.messages.create({
    to: `whatsapp:${params.to}`,
    from: `whatsapp:${from}`,
    body: params.body,
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}) {
  const client = getResend();
  const from = params.from ?? process.env.RESEND_FROM_EMAIL ?? "notifications@roundflow.app";
  return client.emails.send({
    to: params.to,
    from,
    subject: params.subject,
    html: params.html,
  });
}

export function preArrivalMessage(customerName: string, windowLabel: string) {
  return `Hi ${customerName}, this is a reminder that our team is scheduled to visit ${windowLabel}. Please ensure access is clear. Reply STOP to opt out.`;
}

export function jobCompletedMessage(customerName: string, serviceTitle: string, amount: string) {
  return `Hi ${customerName}, we've completed your ${serviceTitle} today. Amount due: ${amount}. Thank you for your business!`;
}

export function paymentReceiptEmail(params: {
  customerName: string;
  serviceTitle: string;
  amount: string;
  invoiceNumber: string;
}) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111827;">Payment Receipt</h2>
      <p>Hi ${params.customerName},</p>
      <p>Thanks for your payment for <strong>${params.serviceTitle}</strong>.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:8px 0; color:#6b7280;">Invoice</td><td style="text-align:right;">${params.invoiceNumber}</td></tr>
        <tr><td style="padding:8px 0; color:#6b7280;">Amount</td><td style="text-align:right; font-weight:600;">${params.amount}</td></tr>
      </table>
      <p style="color:#6b7280; font-size:12px;">This is an automated receipt from RoundFlow.</p>
    </div>
  `;
}

export function mandateInviteEmail(params: { customerName: string; mandateUrl: string }) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#111827;">Set up Direct Debit</h2>
      <p>Hi ${params.customerName},</p>
      <p>Please set up a Direct Debit mandate so we can automatically collect payment after each visit.</p>
      <a href="${params.mandateUrl}" style="display:inline-block; background:#6366f1; color:white; padding:12px 20px; border-radius:8px; text-decoration:none; margin-top:12px;">Set up Direct Debit</a>
    </div>
  `;
}
