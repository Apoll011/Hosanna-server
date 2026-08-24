import Handlebars from "handlebars";
import { env } from "../config/env.js";
import { getResendClient } from "../lib/resend.js";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  attachments?: Array<{
    filename?: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendTemplateEmailOptions<T extends Record<string, any> = Record<string, any>> {
  to: string | string[];
  template: string;
  variables: T;
  subject?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  attachments?: Array<{
    filename?: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

// Global template cache for compiled Handlebars templates
const templateCache = new Map<string, Handlebars.TemplateDelegate>();
const rawTemplates = new Map<string, { subject?: string; body: string }>();

// Register default Handlebars helpers
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("currentYear", () => new Date().getFullYear());

/**
 * Base email layout wrapper with modern responsive styling and Hosanna branding.
 */
const BASE_LAYOUT = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{#if subject}}{{subject}}{{else}}Hosanna{{/if}}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0d1117;
      color: #e6edf3;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0d1117;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .header {
      padding: 32px 32px 24px;
      text-align: center;
      border-bottom: 1px solid #21262d;
    }
    .brand {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #44e0ff;
      text-decoration: none;
      display: inline-block;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 15px;
      color: #c9d1d9;
    }
    .content h1, .content h2, .content h3 {
      color: #ffffff;
      margin-top: 0;
    }
    .button-container {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background-color: #44e0ff;
      color: #0d1117 !important;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(68, 224, 255, 0.3);
    }
    .code-box {
      background-color: #0d1117;
      border: 1px dashed #30363d;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 6px;
      color: #44e0ff;
      margin: 24px 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .footer {
      padding: 24px 32px;
      background-color: #0d1117;
      border-top: 1px solid #21262d;
      text-align: center;
      font-size: 12px;
      color: #8b949e;
    }
    .footer a {
      color: #58a6ff;
      text-decoration: none;
    }
    .note {
      font-size: 13px;
      color: #8b949e;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <a href="{{#if appUrl}}{{appUrl}}{{else}}https://hosanna.live{{/if}}" class="brand">Hosanna</a>
      </div>
      <div class="content">
        {{{body}}}
      </div>
      <div class="footer">
        <p>&copy; {{currentYear}} Hosanna. All rights reserved.</p>
        <p>If you did not request this email, you can safely ignore it.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

/**
 * Registers an email template by name.
 */
export function registerEmailTemplate(
  name: string,
  bodyContent: string,
  options?: { defaultSubject?: string; wrapWithLayout?: boolean },
): void {
  const wrap = options?.wrapWithLayout ?? true;
  const fullHtml = wrap ? BASE_LAYOUT.replace("{{{body}}}", bodyContent) : bodyContent;
  
  rawTemplates.set(name, {
    subject: options?.defaultSubject,
    body: fullHtml,
  });
  
  templateCache.set(name, Handlebars.compile(fullHtml));
}

/**
 * Checks if a named template is registered.
 */
export function hasTemplate(name: string): boolean {
  return rawTemplates.has(name) || templateCache.has(name);
}

/**
 * Returns a list of all registered template names.
 */
export function getRegisteredTemplates(): string[] {
  return Array.from(rawTemplates.keys());
}

// Initialize Built-in Templates
registerEmailTemplate(
  "verification",
  `
  <h2>Verify your email address</h2>
  <p>Hello{{#if name}} {{name}}{{/if}},</p>
  <p>Thank you for signing up with Hosanna. Please verify your email address by clicking the button below:</p>
  <div class="button-container">
    <a href="{{url}}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
  </div>
  <p class="note">This link is valid for {{#if expireMinutes}}{{expireMinutes}}{{else}}60{{/if}} minutes.</p>
  <p class="note">If the button doesn't work, copy and paste this link into your browser:<br>
  <a href="{{url}}" style="color: #58a6ff; word-break: break-all;">{{url}}</a></p>
  `,
  { defaultSubject: "Verify your email address - Hosanna" },
);

registerEmailTemplate(
  "password-reset",
  `
  <h2>Reset your password</h2>
  <p>Hello{{#if name}} {{name}}{{/if}},</p>
  <p>We received a request to reset your Hosanna account password. Click the button below to choose a new password:</p>
  <div class="button-container">
    <a href="{{url}}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
  </div>
  <p class="note">This link will expire in {{#if expireMinutes}}{{expireMinutes}}{{else}}60{{/if}} minutes.</p>
  <p class="note">If you didn't ask for a password reset, you can safely ignore this email. Your password won't change until you create a new one.</p>
  <p class="note">Link URL: <a href="{{url}}" style="color: #58a6ff; word-break: break-all;">{{url}}</a></p>
  `,
  { defaultSubject: "Reset your Hosanna password" },
);

registerEmailTemplate(
  "otp",
  `
  <h2>Two-Factor Verification Code</h2>
  <p>Hello{{#if name}} {{name}}{{/if}},</p>
  <p>Your authentication code for Hosanna is:</p>
  <div class="code-box">{{otp}}</div>
  <p class="note">This code will expire in {{#if expireMinutes}}{{expireMinutes}}{{else}}10{{/if}} minutes.</p>
  <p class="note">Do not share this code with anyone. Hosanna staff will never ask for your code.</p>
  `,
  { defaultSubject: "Your Hosanna verification code" },
);

registerEmailTemplate(
  "welcome",
  `
  <h2>Welcome to Hosanna! 🎉</h2>
  <p>Hello{{#if name}} {{name}}{{/if}},</p>
  <p>We're thrilled to have you{{#if organizationName}} as part of <strong>{{organizationName}}</strong>{{/if}}!</p>
  <p>Hosanna helps your worship team manage songs, folders, services, and live musicians seamlessly.</p>
  <div class="button-container">
    <a href="{{#if appUrl}}{{appUrl}}{{else}}https://hosanna.live{{/if}}" class="btn" target="_blank" rel="noopener noreferrer">Open Hosanna Studio</a>
  </div>
  <p>If you have any questions or need assistance, feel free to reach out to your team admin or support.</p>
  `,
  { defaultSubject: "Welcome to Hosanna" },
);

registerEmailTemplate(
  "org-invitation",
  `
  <h2>You've been invited to join {{organizationName}}</h2>
  <p>Hello{{#if recipientName}} {{recipientName}}{{/if}},</p>
  <p>{{#if inviterName}}<strong>{{inviterName}}</strong> has{{else}}You have been{{/if}} invited to join <strong>{{organizationName}}</strong>{{#if role}} as a <strong>{{role}}</strong>{{/if}} on Hosanna.</p>
  <div class="button-container">
    <a href="{{inviteUrl}}" class="btn" target="_blank" rel="noopener noreferrer">Accept Invitation</a>
  </div>
  <p class="note">If you don't want to accept this invitation, you can ignore this email.</p>
  <p class="note">Direct link: <a href="{{inviteUrl}}" style="color: #58a6ff; word-break: break-all;">{{inviteUrl}}</a></p>
  `,
  { defaultSubject: "Invitation to join an organization on Hosanna" },
);

registerEmailTemplate(
  "notification",
  `
  <h2>{{title}}</h2>
  <p>Hello{{#if recipientName}} {{recipientName}}{{/if}},</p>
  <p>{{message}}</p>
  {{#if details}}
  <ul style="color: #c9d1d9; padding-left: 20px;">
    {{#each details}}
      <li>{{this}}</li>
    {{/each}}
  </ul>
  {{/if}}
  {{#if actionUrl}}
  <div class="button-container">
    <a href="{{actionUrl}}" class="btn" target="_blank" rel="noopener noreferrer">{{#if actionText}}{{actionText}}{{else}}View Details{{/if}}</a>
  </div>
  {{/if}}
  `,
  { defaultSubject: "Notification from Hosanna" },
);

/**
 * Compiles and renders a template string or named template with variables.
 */
export function renderEmailTemplate<T extends Record<string, any>>(
  templateNameOrHtml: string,
  variables: T,
): string {
  let compiled = templateCache.get(templateNameOrHtml);

  if (!compiled) {
    // If it's not a pre-registered template name, treat templateNameOrHtml as raw Handlebars HTML
    const htmlToCompile = templateNameOrHtml.includes("<html")
      ? templateNameOrHtml
      : BASE_LAYOUT.replace("{{{body}}}", templateNameOrHtml);
    
    compiled = Handlebars.compile(htmlToCompile);
  }

  return compiled({
    appUrl: env.publicAppUrl,
    ...variables,
  });
}

/**
 * Sends a raw or custom email using the Resend provider.
 */
export async function sendEmail(options: SendEmailOptions) {
  const resend = getResendClient();
  const from = options.from || env.emailFrom;

  try {
    const payload: any = {
      from,
      to: options.to,
      subject: options.subject,
    };

    if (options.html) payload.html = options.html;
    if (options.text) payload.text = options.text;
    if (!options.html && !options.text) payload.html = "";

    if (options.cc) payload.cc = options.cc;
    if (options.bcc) payload.bcc = options.bcc;
    if (options.replyTo) payload.replyTo = options.replyTo;
    if (options.attachments) payload.attachments = options.attachments;
    if (options.headers) payload.headers = options.headers;
    if (options.tags) payload.tags = options.tags;

    const response = await resend.emails.send(payload);

    if (response.error) {
      console.error("[resend] Failed to send email:", response.error);
      throw new Error(`Email delivery failed: ${response.error.message}`);
    }

    return response.data;
  } catch (error) {
    console.error("[resend] Exception sending email:", error);
    throw error;
  }
}

/**
 * Main function that receives the template, receivers, and variables, renders it, and sends via Resend.
 *
 * @param options SendTemplateEmailOptions containing template name/source, receivers (to), variables, and options
 * @returns Resend send result
 *
 * @example
 * ```ts
 * await sendTemplateEmail({
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   variables: { name: 'John Doe', organizationName: 'Worship Team' }
 * });
 * ```
 */
export async function sendTemplateEmail<T extends Record<string, any> = Record<string, any>>(
  options: SendTemplateEmailOptions<T>,
) {
  const registered = rawTemplates.get(options.template);
  const subject = options.subject || registered?.subject || (options.variables as any)?.subject || "Hosanna Notification";
  const html = renderEmailTemplate(options.template, {
    ...options.variables,
    subject,
  });

  return sendEmail({
    to: options.to,
    subject,
    html,
    from: options.from,
    cc: options.cc,
    bcc: options.bcc,
    replyTo: options.replyTo,
    attachments: options.attachments,
    headers: options.headers,
    tags: options.tags,
  });
}

// ---------------------------------------------------------------------------
// Specialized Helper Functions
// ---------------------------------------------------------------------------

/**
 * Sends an email verification link.
 */
export async function sendVerificationEmail(
  to: string | string[],
  data: {
    name?: string;
    url: string;
    token?: string;
    expireMinutes?: number;
  },
) {
  return sendTemplateEmail({
    to,
    template: "verification",
    variables: data,
    subject: "Verify your email address - Hosanna",
  });
}

/**
 * Sends a password reset email.
 */
export async function sendPasswordResetEmail(
  to: string | string[],
  data: {
    name?: string;
    url: string;
    token?: string;
    expireMinutes?: number;
  },
) {
  return sendTemplateEmail({
    to,
    template: "password-reset",
    variables: data,
    subject: "Reset your Hosanna password",
  });
}

/**
 * Sends a Two-Factor Authentication / OTP verification code.
 */
export async function sendOtpEmail(
  to: string | string[],
  data: {
    name?: string;
    otp: string;
    expireMinutes?: number;
  },
) {
  return sendTemplateEmail({
    to,
    template: "otp",
    variables: data,
    subject: `Your Hosanna verification code: ${data.otp}`,
  });
}

/**
 * Sends a welcome email to a new user or new organization member.
 */
export async function sendWelcomeEmail(
  to: string | string[],
  data: {
    name?: string;
    organizationName?: string;
    appUrl?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "welcome",
    variables: data,
    subject: data.organizationName
      ? `Welcome to ${data.organizationName} on Hosanna`
      : "Welcome to Hosanna!",
  });
}

/**
 * Sends an organization member invitation email.
 */
export async function sendOrgInvitationEmail(
  to: string | string[],
  data: {
    organizationName: string;
    inviteUrl: string;
    inviterName?: string;
    recipientName?: string;
    role?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "org-invitation",
    variables: data,
    subject: `Invitation to join ${data.organizationName} on Hosanna`,
  });
}

/**
 * Sends a generic notification or alert email with optional call to action button.
 */
export async function sendNotificationEmail(
  to: string | string[],
  data: {
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    recipientName?: string;
    details?: string[];
  },
) {
  return sendTemplateEmail({
    to,
    template: "notification",
    variables: data,
    subject: `${data.title} - Hosanna`,
  });
}

export const emailService = {
  sendEmail,
  sendTemplateEmail,
  renderEmailTemplate,
  registerEmailTemplate,
  hasTemplate,
  getRegisteredTemplates,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  sendOrgInvitationEmail,
  sendNotificationEmail,
};

export default emailService;
