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
  scheduledAt?: string | Date;
  attachments?: Array<{
    filename?: string;
    content?: Buffer | string;
    path?: string;
    contentType?: string;
  }>;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendTemplateEmailOptions<
  T extends Record<string, any> = Record<string, any>,
> {
  to: string | string[];
  template: string;
  variables: T;
  subject?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  scheduledAt?: string | Date;
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
 * Standard Production Card Layout (🟢 Alpha Must-Have)
 */
export const CARD_LAYOUT = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px; line-height: 1.6; }
    .card { max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { padding: 24px; text-align: center; border-bottom: 1px solid #e2e8f0; background-color: #ffffff; }
    .header h2 { margin: 0; color: #0284c7; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .content { padding: 32px 24px; }
    .content.centered { text-align: center; }
    h3 { margin-top: 0; color: #1d1b20; font-size: 19px; font-weight: 700; }
    p { color: #49454f; margin-bottom: 24px; font-size: 15px; }
    .footer { padding: 20px; text-align: center; font-size: 13px; color: #79747e; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h2>Hosanna</h2></div>
    {{{body}}}
    <div class="footer">© {{year}} Hosanna. All rights reserved.</div>
  </div>
</body>
</html>`;

/**
 * Normalizes variables so templates can be called using snake_case or camelCase aliases.
 */
function normalizeVariables(variables: Record<string, any> = {}): Record<string, any> {
  const currentYear = new Date().getFullYear();
  const normalized: Record<string, any> = {
    year: variables.year ?? currentYear,
    ...variables,
  };

  // Name normalization
  if (normalized.first_name === undefined) {
    normalized.first_name =
      variables.firstName ||
      (variables.name ? String(variables.name).split(" ")[0] : "");
  }

  // Dashboard / Workspace URL normalization
  if (normalized.dashboard_url === undefined) {
    normalized.dashboard_url =
      variables.dashboardUrl ||
      variables.appUrl ||
      env.publicAppUrl ||
      "https://hosanna.live";
  }
  if (normalized.workspace_url === undefined) {
    normalized.workspace_url =
      variables.workspaceUrl ||
      variables.appUrl ||
      env.publicAppUrl ||
      "https://hosanna.live";
  }
  if (normalized.workspace_settings_url === undefined) {
    normalized.workspace_settings_url =
      variables.workspaceSettingsUrl ||
      `${normalized.workspace_url}/settings`;
  }

  // Link normalizations
  if (normalized.verify_link === undefined) {
    normalized.verify_link = variables.verifyLink || variables.url || "";
  }
  if (normalized.reset_link === undefined) {
    normalized.reset_link = variables.resetLink || variables.url || "";
  }
  if (normalized.confirm_email_link === undefined) {
    normalized.confirm_email_link =
      variables.confirmEmailLink || variables.url || "";
  }
  if (normalized.invite_link === undefined) {
    normalized.invite_link = variables.inviteLink || variables.inviteUrl || "";
  }

  // 2FA code normalization
  if (normalized["2fa_code"] === undefined) {
    normalized["2fa_code"] =
      variables.twoFactorCode ||
      variables.otp ||
      variables.code ||
      variables["2faCode"] ||
      "";
  }

  // Time / Expiry normalization
  if (normalized.expiry_time === undefined) {
    normalized.expiry_time =
      variables.expiryTime ||
      variables.expireMinutes ||
      variables.expiresIn ||
      "60";
  }
  if (normalized.lockout_minutes === undefined) {
    normalized.lockout_minutes =
      variables.lockoutMinutes ||
      variables.lockout_minutes ||
      "15";
  }

  // Church / Org normalization
  if (normalized.church_name === undefined) {
    normalized.church_name =
      variables.churchName ||
      variables.organizationName ||
      variables.orgName ||
      "Hosanna";
  }
  if (normalized.inviter_name === undefined) {
    normalized.inviter_name =
      variables.inviterName || variables.senderName || "A leader";
  }
  if (normalized.new_role === undefined) {
    normalized.new_role = variables.newRole || variables.role || "Member";
  }
  if (normalized.new_email === undefined) {
    normalized.new_email = variables.newEmail || variables.email || "";
  }

  return normalized;
}

/**
 * Registers an email template by name.
 */
export function registerEmailTemplate(
  name: string,
  bodyContent: string,
  options?: { defaultSubject?: string; wrapWithLayout?: boolean },
): void {
  const wrap = options?.wrapWithLayout ?? true;
  const fullHtml = wrap ? CARD_LAYOUT.replace("{{{body}}}", bodyContent) : bodyContent;

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

// ---------------------------------------------------------------------------
// Register 🟢 Alpha (Must Have) Templates
// ---------------------------------------------------------------------------

// 1. Authentication Emails

// 1.1 Welcome to Hosanna
registerEmailTemplate(
  "welcome",
  `
    <div class="content">
      <h3>Welcome to Hosanna{{#if first_name}}, {{first_name}}{{/if}}!</h3>
      <p>We are thrilled to have you join our community. Hosanna is designed to help you connect, engage, and grow with your church family effortlessly.</p>
      <p>To get started, you can explore your dashboard or set up your profile.</p>
      <a href="{{dashboard_url}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Go to Dashboard</a>
    </div>
  `,
  { defaultSubject: "Welcome to Hosanna" },
);

// 1.2 Verify your email address (Action Button)
registerEmailTemplate(
  "verify-email",
  `
    <div class="content centered" style="text-align: center;">
      <h3>Verify your email address</h3>
      <p>Thanks for signing up for Hosanna! Please click the button below to verify your email address and secure your account.</p>
      <a href="{{verify_link}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Verify Email</a>
      <p style="margin-top: 24px; font-size: 13px; color: #79747e;">If you didn't create an account, you can safely ignore this email.</p>
    </div>
  `,
  { defaultSubject: "Verify your email address - Hosanna" },
);
// Register alias
rawTemplates.set("verification", rawTemplates.get("verify-email")!);
templateCache.set("verification", templateCache.get("verify-email")!);

// 1.3 Forgot password (Action Button)
registerEmailTemplate(
  "forgot-password",
  `
    <div class="content centered" style="text-align: center;">
      <h3>Reset your password</h3>
      <p>We received a request to reset the password for your Hosanna account. Click the button below to choose a new password.</p>
      <a href="{{reset_link}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Reset Password</a>
      <p style="margin-top: 24px; font-size: 13px; color: #79747e;">This link will expire in {{expiry_time}} minutes. If you did not request a password reset, no further action is required.</p>
    </div>
  `,
  { defaultSubject: "Reset your Hosanna password" },
);
// Register alias
rawTemplates.set("password-reset", rawTemplates.get("forgot-password")!);
templateCache.set("password-reset", templateCache.get("forgot-password")!);

// 1.4 Email 2FA verification code (Plain / Minimal)
registerEmailTemplate(
  "2fa-code",
  `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #ffffff; margin: 0; padding: 30px; color: #1d1b20; }
    .code { font-size: 32px; font-weight: bold; color: #075985; letter-spacing: 4px; padding: 12px 0; }
  </style>
</head>
<body>
  <p>Here is your Hosanna login code:</p>
  <div class="code">{{2fa_code}}</div>
  <p style="color: #79747e; font-size: 13px;">This code will expire in {{#if expiry_time}}{{expiry_time}}{{else}}10{{/if}} minutes. If you didn't request this, you can ignore this email.</p>
</body>
</html>`,
  { defaultSubject: "Your Hosanna verification code", wrapWithLayout: false },
);
// Register aliases
rawTemplates.set("otp", rawTemplates.get("2fa-code")!);
templateCache.set("otp", templateCache.get("2fa-code")!);
rawTemplates.set("two-factor", rawTemplates.get("2fa-code")!);
templateCache.set("two-factor", templateCache.get("2fa-code")!);

// 1.5 Password reset successful
registerEmailTemplate(
  "password-reset-success",
  `
    <div class="content">
      <h3>Password updated successfully</h3>
      <p>Your Hosanna account password has been successfully changed.</p>
      <p>If you did not make this change, please contact your administrator or Hosanna support immediately to secure your account.</p>
    </div>
  `,
  { defaultSubject: "Password updated successfully - Hosanna" },
);

// 1.6 Too many login attempts (Account locked)
registerEmailTemplate(
  "account-locked",
  `
    <div class="content">
      <h3>Account temporarily locked</h3>
      <p>We detected multiple failed login attempts on your account. To protect your security, your account has been temporarily locked.</p>
      <p>You will be able to try logging in again in <strong>{{lockout_minutes}} minutes</strong>.</p>
    </div>
  `,
  { defaultSubject: "Account temporarily locked - Hosanna" },
);

// ---------------------------------------------------------------------------
// 2. Account Emails
// ---------------------------------------------------------------------------

// 2.1 Change email verification (Action Button)
registerEmailTemplate(
  "change-email-verification",
  `
    <div class="content">
      <h3>Verify your new email address</h3>
      <p>You recently requested to change the email address associated with your Hosanna account to <strong>{{new_email}}</strong>.</p>
      <p>Please click the button below to confirm this change.</p>
      <a href="{{confirm_email_link}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Approve Email Change</a>
    </div>
  `,
  { defaultSubject: "Verify your new email address - Hosanna" },
);

// 2.2 Email changed successfully
registerEmailTemplate(
  "email-changed-success",
  `
    <div class="content">
      <h3>Email address updated</h3>
      <p>Your account email has been successfully updated to <strong>{{new_email}}</strong>. You will use this new email to log in moving forward.</p>
    </div>
  `,
  { defaultSubject: "Email address updated - Hosanna" },
);

// 2.3 Account deleted (Goodbye)
registerEmailTemplate(
  "account-deleted",
  `
    <div class="content">
      <h3>Your account has been deleted</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>We confirm that your Hosanna account has been permanently deleted as requested. All associated data has been removed from our active systems.</p>
      <p>We're sad to see you go. If you ever need us in the future, you're always welcome back.</p>
    </div>
  `,
  { defaultSubject: "Your Hosanna account has been deleted" },
);

// ---------------------------------------------------------------------------
// 3. Workspace / Church Emails
// ---------------------------------------------------------------------------

// 3.1 You've been invited to join a church (Action Button)
registerEmailTemplate(
  "church-invitation",
  `
    <div class="content">
      <h3>You've been invited to {{church_name}}</h3>
      <p><strong>{{inviter_name}}</strong> has invited you to join their workspace on Hosanna.</p>
      <p>Join {{church_name}} to connect with your community, view events, and stay up to date.</p>
      <a href="{{invite_link}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 10px;">Accept Invitation</a>
    </div>
  `,
  { defaultSubject: "You've been invited to join a church - Hosanna" },
);
// Register alias
rawTemplates.set("org-invitation", rawTemplates.get("church-invitation")!);
templateCache.set("org-invitation", templateCache.get("church-invitation")!);

// 3.2 Request received (Join Request)
registerEmailTemplate(
  "join-request-received",
  `
    <div class="content">
      <h3>Join request received</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>Your request to join <strong>{{church_name}}</strong> has been received and is currently pending admin approval.</p>
      <p>We will notify you via email as soon as an admin reviews your request.</p>
    </div>
  `,
  { defaultSubject: "Join request received - Hosanna" },
);

// 3.3 Your request has been approved (Action Button)
registerEmailTemplate(
  "join-request-approved",
  `
    <div class="content">
      <h3>You're in! Request approved</h3>
      <p>Great news! Your request to join <strong>{{church_name}}</strong> has been approved by an admin.</p>
      <p>You can now access the workspace, view members, and get involved.</p>
      <a href="{{workspace_url}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 10px;">Join Workspace</a>
    </div>
  `,
  { defaultSubject: "You're in! Join request approved - Hosanna" },
);

// 3.4 Your request has been denied
registerEmailTemplate(
  "join-request-denied",
  `
    <div class="content">
      <h3>Update on your join request</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>Your request to join <strong>{{church_name}}</strong> could not be approved at this time.</p>
      <p>If you believe this was a mistake, please reach out directly to the church administration.</p>
    </div>
  `,
  { defaultSubject: "Update on your join request - Hosanna" },
);

// 3.5 You've been promoted to Admin
registerEmailTemplate(
  "promoted-to-admin",
  `
    <div class="content">
      <h3>You are now an Admin</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>Your role in <strong>{{church_name}}</strong> has been updated. You are now an <strong>Admin</strong>.</p>
      <p>You now have access to workspace settings, member management, and administrative tools.</p>
      <a href="{{workspace_settings_url}}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 10px;">View Admin Dashboard</a>
    </div>
  `,
  { defaultSubject: "You are now an Admin - Hosanna" },
);

// 3.6 Your role has changed
registerEmailTemplate(
  "role-changed",
  `
    <div class="content">
      <h3>Your role has been updated</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>Your role in <strong>{{church_name}}</strong> has been changed to <strong>{{new_role}}</strong>.</p>
      <p>If you have any questions about this change, please contact your workspace administrator.</p>
    </div>
  `,
  { defaultSubject: "Your role has been updated - Hosanna" },
);

// 3.7 You've been removed from the church
registerEmailTemplate(
  "removed-from-church",
  `
    <div class="content">
      <h3>Workspace access removed</h3>
      <p>Hi{{#if first_name}} {{first_name}}{{/if}},</p>
      <p>You have been removed from the <strong>{{church_name}}</strong> workspace. You will no longer have access to this community's dashboard or member information.</p>
    </div>
  `,
  { defaultSubject: "Workspace access removed - Hosanna" },
);

/**
 * Compiles and renders a template string or named template with variables.
 */
export function renderEmailTemplate<T extends Record<string, any>>(
  templateNameOrHtml: string,
  variables: T,
): string {
  const normVars = normalizeVariables(variables);
  let compiled = templateCache.get(templateNameOrHtml);

  if (!compiled) {
    // If not a pre-registered template name, treat templateNameOrHtml as raw Handlebars HTML
    const htmlToCompile = templateNameOrHtml.includes("<html")
      ? templateNameOrHtml
      : CARD_LAYOUT.replace("{{{body}}}", `<div class="content">${templateNameOrHtml}</div>`);

    compiled = Handlebars.compile(htmlToCompile);
  }

  return compiled(normVars);
}

/**
 * Sends a raw or custom email using the Resend provider.
 * Supports scheduling email sending at a specific time via `scheduledAt`.
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

    if (options.scheduledAt) {
      payload.scheduledAt =
        options.scheduledAt instanceof Date
          ? options.scheduledAt.toISOString()
          : options.scheduledAt;
    }

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
 * Main function that receives the template, receivers, variables, and sends via Resend.
 *
 * @param options SendTemplateEmailOptions containing template name/source, receivers (to), variables, and options
 * @returns Resend send result
 *
 * @example
 * ```ts
 * await sendTemplateEmail({
 *   to: 'user@example.com',
 *   template: 'welcome',
 *   variables: { first_name: 'Alex', dashboard_url: 'https://hosanna.live' }
 * });
 * ```
 */
export async function sendTemplateEmail<
  T extends Record<string, any> = Record<string, any>,
>(options: SendTemplateEmailOptions<T>) {
  const normVars = normalizeVariables(options.variables);
  const registered = rawTemplates.get(options.template);

  // Dynamic subject resolution from template
  let subject = options.subject;
  if (!subject && registered?.subject) {
    subject = Handlebars.compile(registered.subject)(normVars);
  }
  if (!subject) {
    subject = (normVars as any).subject || "Hosanna Notification";
  }

  const html = renderEmailTemplate(options.template, normVars);

  return sendEmail({
    to: options.to,
    subject: subject as string,
    html,
    from: options.from,
    cc: options.cc,
    bcc: options.bcc,
    replyTo: options.replyTo,
    scheduledAt: options.scheduledAt,
    attachments: options.attachments,
    headers: options.headers,
    tags: options.tags,
  });
}

// ---------------------------------------------------------------------------
// Specialized Helper Functions for 🟢 Alpha Emails
// ---------------------------------------------------------------------------

/**
 * 1.1 Welcome to Hosanna
 */
export async function sendWelcomeEmail(
  to: string | string[],
  data: {
    first_name?: string;
    firstName?: string;
    name?: string;
    dashboard_url?: string;
    dashboardUrl?: string;
    organizationName?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "welcome",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 1.2 Verify email address
 */
export async function sendVerificationEmail(
  to: string | string[],
  data: {
    verify_link?: string;
    verifyLink?: string;
    url?: string;
    token?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    expiry_time?: number | string;
    expiryTime?: number | string;
    expireMinutes?: number | string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "verify-email",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 1.3 Forgot password
 */
export async function sendPasswordResetEmail(
  to: string | string[],
  data: {
    reset_link?: string;
    resetLink?: string;
    url?: string;
    expiry_time?: number | string;
    expiryTime?: number | string;
    expireMinutes?: number | string;
    token?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "forgot-password",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 1.4 Two-Factor Authentication / 2FA verification code
 */
export async function sendOtpEmail(
  to: string | string[],
  data: {
    "2fa_code"?: string;
    twoFactorCode?: string;
    otp?: string;
    code?: string;
    expiry_time?: number | string;
    expiryTime?: number | string;
    expireMinutes?: number | string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "2fa-code",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 1.5 Password reset successful
 */
export async function sendPasswordResetSuccessEmail(
  to: string | string[],
  data?: {
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "password-reset-success",
    variables: data || {},
    scheduledAt: data?.scheduledAt,
  });
}

/**
 * 1.6 Too many login attempts / Account locked
 */
export async function sendAccountLockedEmail(
  to: string | string[],
  data: {
    lockout_minutes?: number | string;
    lockoutMinutes?: number | string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "account-locked",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 2.1 Change email verification
 */
export async function sendChangeEmailVerificationEmail(
  to: string | string[],
  data: {
    new_email: string;
    newEmail?: string;
    confirm_email_link: string;
    confirmEmailLink?: string;
    url?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "change-email-verification",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 2.2 Email changed successfully
 */
export async function sendEmailChangedSuccessEmail(
  to: string | string[],
  data: {
    new_email: string;
    newEmail?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "email-changed-success",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 2.3 Account deleted
 */
export async function sendAccountDeletedEmail(
  to: string | string[],
  data: {
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "account-deleted",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.1 Church / Organization invitation
 */
export async function sendChurchInvitationEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    inviter_name: string;
    inviterName?: string;
    invite_link: string;
    inviteLink?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "church-invitation",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.2 Join request received
 */
export async function sendJoinRequestReceivedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-received",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.3 Join request approved
 */
export async function sendJoinRequestApprovedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    workspace_url: string;
    workspaceUrl?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-approved",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.4 Join request denied
 */
export async function sendJoinRequestDeniedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-denied",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.5 Promoted to admin
 */
export async function sendPromotedToAdminEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    workspace_settings_url: string;
    workspaceSettingsUrl?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "promoted-to-admin",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.6 Role changed
 */
export async function sendRoleChangedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    new_role: string;
    newRole?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "role-changed",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 3.7 Removed from church
 */
export async function sendRemovedFromChurchEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
  },
) {
  return sendTemplateEmail({
    to,
    template: "removed-from-church",
    variables: data,
    scheduledAt: data.scheduledAt,
  });
}

export const emailService = {
  sendEmail,
  sendTemplateEmail,
  renderEmailTemplate,
  registerEmailTemplate,
  hasTemplate,
  getRegisteredTemplates,
  // 1. Authentication
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOtpEmail,
  sendPasswordResetSuccessEmail,
  sendAccountLockedEmail,
  // 2. Account
  sendChangeEmailVerificationEmail,
  sendEmailChangedSuccessEmail,
  sendAccountDeletedEmail,
  // 3. Workspace / Church
  sendChurchInvitationEmail,
  sendJoinRequestReceivedEmail,
  sendJoinRequestApprovedEmail,
  sendJoinRequestDeniedEmail,
  sendPromotedToAdminEmail,
  sendRoleChangedEmail,
  sendRemovedFromChurchEmail,
};

export default emailService;
