import { BrevoClient } from "@getbrevo/brevo";

const apiKey = process.env.BREVO_API_KEY;

if (!apiKey) {
  throw new Error("BREVO_API_KEY is missing.");
}

const client = new BrevoClient({
  apiKey,
});

type SendEmailParams = {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
};

export const sendEmail = async ({
  to,
  subject,
  htmlContent,
  textContent,
}: SendEmailParams) => {
  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is missing.");
  }

  const payload: {
    sender: {
      email: string;
      name: string;
    };
    to: { email: string }[];
    subject: string;
    htmlContent: string;
    textContent?: string;
  } = {
    sender: {
      email: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME || "UniVentry System",
    },
    to: [{ email: to }],
    subject,
    htmlContent,
  };

  if (textContent) {
    payload.textContent = textContent;
  }

  const response = await client.transactionalEmails.sendTransacEmail(payload);

  return response;
};
