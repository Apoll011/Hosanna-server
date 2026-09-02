import Handlebars from "handlebars";
import { env } from "../config/env.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
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
  /** BCP-47 locale tag (e.g. "pt-PT", "en-US"). Defaults to DEFAULT_LOCALE. */
  locale?: string;
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
 * Standard Production Card Layout
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
    p { color: #49454f; margin-bottom: 20px; font-size: 15px; }
    .btn-wrap { text-align: center; margin: 4px 0 28px; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.2px; }
    .hint { margin-top: 16px; font-size: 13px !important; color: #79747e !important; }
    .footer { padding: 20px; text-align: center; font-size: 13px; color: #79747e; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h2>Hosanna</h2></div>
    {{{body}}}
    <div class="footer">{{t_footer}}</div>
  </div>
</body>
</html>`;

/**
 * Compiles a raw translation string as a mini Handlebars template using the
 * already-normalized variables so that placeholders like {{first_name}} are filled in.
 */
function compileTString(raw: string, vars: Record<string, any>): string {
  try {
    return Handlebars.compile(raw)(vars);
  } catch {
    return raw;
  }
}

/**
 * Builds flat t_* translation variables for all email templates.
 * They are resolved at render time using the provided locale and normalized vars.
 */
function buildTranslationVars(
  locale: string,
  normVars: Record<string, any>,
): Record<string, string> {
  const loc = locale || DEFAULT_LOCALE;
  const tc = (key: string) => compileTString(t(loc, key as any), normVars);

  return {
    // Layout
    t_footer: tc("email.footer"),

    // 1.1 welcome
    t_welcome_subject: tc("email.welcome.subject"),
    t_welcome_heading: tc("email.welcome.heading"),
    t_welcome_body1: tc("email.welcome.body1"),
    t_welcome_body2: tc("email.welcome.body2"),
    t_welcome_cta: tc("email.welcome.cta"),

    // 1.2 verify-email
    t_verify_email_subject: tc("email.verify_email.subject"),
    t_verify_email_heading: tc("email.verify_email.heading"),
    t_verify_email_body1: tc("email.verify_email.body1"),
    t_verify_email_cta: tc("email.verify_email.cta"),
    t_verify_email_ignore: tc("email.verify_email.ignore"),

    // 1.3 forgot-password
    t_forgot_password_subject: tc("email.forgot_password.subject"),
    t_forgot_password_heading: tc("email.forgot_password.heading"),
    t_forgot_password_body1: tc("email.forgot_password.body1"),
    t_forgot_password_cta: tc("email.forgot_password.cta"),
    t_forgot_password_expiry: tc("email.forgot_password.expiry"),

    // 1.4 otp / 2fa
    t_otp_subject: tc("email.otp.subject"),
    t_otp_heading: tc("email.otp.heading"),
    t_otp_expiry: tc("email.otp.expiry"),

    // 1.5 password-reset-success
    t_password_reset_success_subject: tc("email.password_reset_success.subject"),
    t_password_reset_success_heading: tc("email.password_reset_success.heading"),
    t_password_reset_success_body1: tc("email.password_reset_success.body1"),
    t_password_reset_success_body2: tc("email.password_reset_success.body2"),

    // 1.6 account-locked
    t_account_locked_subject: tc("email.account_locked.subject"),
    t_account_locked_heading: tc("email.account_locked.heading"),
    t_account_locked_body1: tc("email.account_locked.body1"),
    t_account_locked_body2: tc("email.account_locked.body2"),

    // 2.1 change-email-verification
    t_change_email_verification_subject: tc("email.change_email_verification.subject"),
    t_change_email_verification_heading: tc("email.change_email_verification.heading"),
    t_change_email_verification_body1: tc("email.change_email_verification.body1"),
    t_change_email_verification_body2: tc("email.change_email_verification.body2"),
    t_change_email_verification_cta: tc("email.change_email_verification.cta"),

    // 2.2 email-changed-success
    t_email_changed_success_subject: tc("email.email_changed_success.subject"),
    t_email_changed_success_heading: tc("email.email_changed_success.heading"),
    t_email_changed_success_body1: tc("email.email_changed_success.body1"),

    // 2.3 account-deleted
    t_account_deleted_subject: tc("email.account_deleted.subject"),
    t_account_deleted_heading: tc("email.account_deleted.heading"),
    t_account_deleted_salutation: tc("email.account_deleted.salutation"),
    t_account_deleted_body1: tc("email.account_deleted.body1"),
    t_account_deleted_body2: tc("email.account_deleted.body2"),

    // 3.1 church-invitation
    t_church_invitation_subject: tc("email.church_invitation.subject"),
    t_church_invitation_heading: tc("email.church_invitation.heading"),
    t_church_invitation_body1: tc("email.church_invitation.body1"),
    t_church_invitation_body2: tc("email.church_invitation.body2"),
    t_church_invitation_cta: tc("email.church_invitation.cta"),

    // 3.2 join-request-received
    t_join_request_received_subject: tc("email.join_request_received.subject"),
    t_join_request_received_heading: tc("email.join_request_received.heading"),
    t_join_request_received_salutation: tc("email.join_request_received.salutation"),
    t_join_request_received_body1: tc("email.join_request_received.body1"),
    t_join_request_received_body2: tc("email.join_request_received.body2"),

    // 3.3 join-request-approved
    t_join_request_approved_subject: tc("email.join_request_approved.subject"),
    t_join_request_approved_heading: tc("email.join_request_approved.heading"),
    t_join_request_approved_body1: tc("email.join_request_approved.body1"),
    t_join_request_approved_body2: tc("email.join_request_approved.body2"),
    t_join_request_approved_cta: tc("email.join_request_approved.cta"),

    // 3.4 join-request-denied
    t_join_request_denied_subject: tc("email.join_request_denied.subject"),
    t_join_request_denied_heading: tc("email.join_request_denied.heading"),
    t_join_request_denied_salutation: tc("email.join_request_denied.salutation"),
    t_join_request_denied_body1: tc("email.join_request_denied.body1"),
    t_join_request_denied_body2: tc("email.join_request_denied.body2"),

    // 3.5 promoted-to-admin
    t_promoted_to_admin_subject: tc("email.promoted_to_admin.subject"),
    t_promoted_to_admin_heading: tc("email.promoted_to_admin.heading"),
    t_promoted_to_admin_salutation: tc("email.promoted_to_admin.salutation"),
    t_promoted_to_admin_body1: tc("email.promoted_to_admin.body1"),
    t_promoted_to_admin_body2: tc("email.promoted_to_admin.body2"),
    t_promoted_to_admin_cta: tc("email.promoted_to_admin.cta"),

    // 3.6 role-changed
    t_role_changed_subject: tc("email.role_changed.subject"),
    t_role_changed_heading: tc("email.role_changed.heading"),
    t_role_changed_salutation: tc("email.role_changed.salutation"),
    t_role_changed_body1: tc("email.role_changed.body1"),
    t_role_changed_body2: tc("email.role_changed.body2"),

    // 3.7 removed-from-church
    t_removed_from_church_subject: tc("email.removed_from_church.subject"),
    t_removed_from_church_heading: tc("email.removed_from_church.heading"),
    t_removed_from_church_salutation: tc("email.removed_from_church.salutation"),
    t_removed_from_church_body1: tc("email.removed_from_church.body1"),

    // 4.1 billing-trial-started
    t_billing_trial_started_subject: tc("email.billing_trial_started.subject"),
    t_billing_trial_started_heading: tc("email.billing_trial_started.heading"),
    t_billing_trial_started_body1: tc("email.billing_trial_started.body1"),
    t_billing_trial_started_body2: tc("email.billing_trial_started.body2"),

    // 4.2 billing-trial-ended
    t_billing_trial_ended_subject: tc("email.billing_trial_ended.subject"),
    t_billing_trial_ended_heading: tc("email.billing_trial_ended.heading"),
    t_billing_trial_ended_body1: tc("email.billing_trial_ended.body1"),
    t_billing_trial_ended_body2: tc("email.billing_trial_ended.body2"),

    // 4.3 billing-trial-expired
    t_billing_trial_expired_subject: tc("email.billing_trial_expired.subject"),
    t_billing_trial_expired_heading: tc("email.billing_trial_expired.heading"),
    t_billing_trial_expired_body1: tc("email.billing_trial_expired.body1"),
    t_billing_trial_expired_body2: tc("email.billing_trial_expired.body2"),

    // 4.4 billing-subscribed
    t_billing_subscribed_subject: tc("email.billing_subscribed.subject"),
    t_billing_subscribed_heading: tc("email.billing_subscribed.heading"),
    t_billing_subscribed_body1: tc("email.billing_subscribed.body1"),
    t_billing_subscribed_body2: tc("email.billing_subscribed.body2"),

    // 4.5 billing-canceled
    t_billing_canceled_subject: tc("email.billing_canceled.subject"),
    t_billing_canceled_heading: tc("email.billing_canceled.heading"),
    t_billing_canceled_body1: tc("email.billing_canceled.body1"),
    t_billing_canceled_body2: tc("email.billing_canceled.body2"),
  };
}

/**
 * Normalizes variables so templates can be called using snake_case or camelCase aliases.
 * Also injects t_* translation variables for the given locale.
 */
function normalizeVariables(
  variables: Record<string, any> = {},
  locale: string = DEFAULT_LOCALE,
): Record<string, any> {
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
      variables.workspaceSettingsUrl || `${normalized.workspace_url}/settings`;
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
      variables.lockoutMinutes || variables.lockout_minutes || "15";
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

  // Plan normalization (billing emails)
  if (normalized.plan === undefined) {
    normalized.plan = variables.planName || variables.plan || "Hosanna";
  }

  // Inject translation variables — built after data vars are ready so they can interpolate them
  const tVars = buildTranslationVars(locale, normalized);
  Object.assign(normalized, tVars);

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
  const fullHtml = wrap
    ? CARD_LAYOUT.replace("{{{body}}}", bodyContent)
    : bodyContent;

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
// All text content is provided via t_* translation variables injected at render time.
// ---------------------------------------------------------------------------

// 1. Authentication Emails

// 1.1 Welcome to Hosanna
registerEmailTemplate(
  "welcome",
  `
    <div class="content centered">
      <h3>{{t_welcome_heading}}</h3>
      <p>{{t_welcome_body1}}</p>
      <p>{{t_welcome_body2}}</p>
      <div class="btn-wrap">
        <a href="{{dashboard_url}}" class="btn">{{t_welcome_cta}}</a>
      </div>
    </div>
  `,
  { defaultSubject: "{{t_welcome_subject}}" },
);

// 1.2 Verify your email address (Action Button)
registerEmailTemplate(
  "verify-email",
  `
    <div class="content centered">
      <h3>{{t_verify_email_heading}}</h3>
      <p>{{t_verify_email_body1}}</p>
      <div class="btn-wrap">
        <a href="{{verify_link}}" class="btn">{{t_verify_email_cta}}</a>
      </div>
      <p class="hint">{{t_verify_email_ignore}}</p>
    </div>
  `,
  { defaultSubject: "{{t_verify_email_subject}}" },
);
// Register alias
rawTemplates.set("verification", rawTemplates.get("verify-email")!);
templateCache.set("verification", templateCache.get("verify-email")!);

// 1.3 Forgot password (Action Button)
registerEmailTemplate(
  "forgot-password",
  `
    <div class="content centered">
      <h3>{{t_forgot_password_heading}}</h3>
      <p>{{t_forgot_password_body1}}</p>
      <div class="btn-wrap">
        <a href="{{reset_link}}" class="btn">{{t_forgot_password_cta}}</a>
      </div>
      <p class="hint">{{t_forgot_password_expiry}}</p>
    </div>
  `,
  { defaultSubject: "{{t_forgot_password_subject}}" },
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
  <p>{{t_otp_heading}}</p>
  <div class="code">{{2fa_code}}</div>
  <p style="color: #79747e; font-size: 13px;">{{t_otp_expiry}}</p>
</body>
</html>`,
  { defaultSubject: "{{t_otp_subject}}", wrapWithLayout: false },
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
      <h3>{{t_password_reset_success_heading}}</h3>
      <p>{{t_password_reset_success_body1}}</p>
      <p>{{t_password_reset_success_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_password_reset_success_subject}}" },
);

// 1.6 Too many login attempts (Account locked)
registerEmailTemplate(
  "account-locked",
  `
    <div class="content">
      <h3>{{t_account_locked_heading}}</h3>
      <p>{{t_account_locked_body1}}</p>
      <p>{{t_account_locked_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_account_locked_subject}}" },
);

// ---------------------------------------------------------------------------
// 2. Account Emails
// ---------------------------------------------------------------------------

// 2.1 Change email verification (Action Button)
registerEmailTemplate(
  "change-email-verification",
  `
    <div class="content centered">
      <h3>{{t_change_email_verification_heading}}</h3>
      <p>{{t_change_email_verification_body1}}</p>
      <p>{{t_change_email_verification_body2}}</p>
      <div class="btn-wrap">
        <a href="{{confirm_email_link}}" class="btn">{{t_change_email_verification_cta}}</a>
      </div>
    </div>
  `,
  { defaultSubject: "{{t_change_email_verification_subject}}" },
);

// 2.2 Email changed successfully
registerEmailTemplate(
  "email-changed-success",
  `
    <div class="content">
      <h3>{{t_email_changed_success_heading}}</h3>
      <p>{{t_email_changed_success_body1}}</p>
    </div>
  `,
  { defaultSubject: "{{t_email_changed_success_subject}}" },
);

// 2.3 Account deleted (Goodbye)
registerEmailTemplate(
  "account-deleted",
  `
    <div class="content">
      <h3>{{t_account_deleted_heading}}</h3>
      <p>{{t_account_deleted_salutation}}</p>
      <p>{{t_account_deleted_body1}}</p>
      <p>{{t_account_deleted_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_account_deleted_subject}}" },
);

// ---------------------------------------------------------------------------
// 3. Workspace / Church Emails
// ---------------------------------------------------------------------------

// 3.1 You've been invited to join a church (Action Button)
registerEmailTemplate(
  "church-invitation",
  `
    <div class="content centered">
      <h3>{{t_church_invitation_heading}}</h3>
      <p>{{t_church_invitation_body1}}</p>
      <p>{{t_church_invitation_body2}}</p>
      <div class="btn-wrap">
        <a href="{{invite_link}}" class="btn">{{t_church_invitation_cta}}</a>
      </div>
    </div>
  `,
  { defaultSubject: "{{t_church_invitation_subject}}" },
);
// Register alias
rawTemplates.set("org-invitation", rawTemplates.get("church-invitation")!);
templateCache.set("org-invitation", templateCache.get("church-invitation")!);

// 3.2 Request received (Join Request)
registerEmailTemplate(
  "join-request-received",
  `
    <div class="content">
      <h3>{{t_join_request_received_heading}}</h3>
      <p>{{t_join_request_received_salutation}}</p>
      <p>{{t_join_request_received_body1}}</p>
      <p>{{t_join_request_received_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_join_request_received_subject}}" },
);

// 3.3 Your request has been approved (Action Button)
registerEmailTemplate(
  "join-request-approved",
  `
    <div class="content centered">
      <h3>{{t_join_request_approved_heading}}</h3>
      <p>{{t_join_request_approved_body1}}</p>
      <p>{{t_join_request_approved_body2}}</p>
      <div class="btn-wrap">
        <a href="{{workspace_url}}" class="btn">{{t_join_request_approved_cta}}</a>
      </div>
    </div>
  `,
  { defaultSubject: "{{t_join_request_approved_subject}}" },
);

// 3.4 Your request has been denied
registerEmailTemplate(
  "join-request-denied",
  `
    <div class="content">
      <h3>{{t_join_request_denied_heading}}</h3>
      <p>{{t_join_request_denied_salutation}}</p>
      <p>{{t_join_request_denied_body1}}</p>
      <p>{{t_join_request_denied_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_join_request_denied_subject}}" },
);

// 3.5 You've been promoted to Admin
registerEmailTemplate(
  "promoted-to-admin",
  `
    <div class="content centered">
      <h3>{{t_promoted_to_admin_heading}}</h3>
      <p>{{t_promoted_to_admin_salutation}}</p>
      <p>{{t_promoted_to_admin_body1}}</p>
      <p>{{t_promoted_to_admin_body2}}</p>
      <div class="btn-wrap">
        <a href="{{workspace_settings_url}}" class="btn">{{t_promoted_to_admin_cta}}</a>
      </div>
    </div>
  `,
  { defaultSubject: "{{t_promoted_to_admin_subject}}" },
);

// 3.6 Your role has changed
registerEmailTemplate(
  "role-changed",
  `
    <div class="content">
      <h3>{{t_role_changed_heading}}</h3>
      <p>{{t_role_changed_salutation}}</p>
      <p>{{t_role_changed_body1}}</p>
      <p>{{t_role_changed_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_role_changed_subject}}" },
);

// 3.7 You've been removed from the church
registerEmailTemplate(
  "removed-from-church",
  `
    <div class="content">
      <h3>{{t_removed_from_church_heading}}</h3>
      <p>{{t_removed_from_church_salutation}}</p>
      <p>{{t_removed_from_church_body1}}</p>
    </div>
  `,
  { defaultSubject: "{{t_removed_from_church_subject}}" },
);

// ---------------------------------------------------------------------------
// 4. Billing / Subscription Emails
// ---------------------------------------------------------------------------

// 4.1 Free trial started
registerEmailTemplate(
  "billing-trial-started",
  `
    <div class="content">
      <h3>{{t_billing_trial_started_heading}}</h3>
      <p>{{t_billing_trial_started_body1}}</p>
      <p>{{t_billing_trial_started_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_billing_trial_started_subject}}" },
);

// 4.2 Free trial ended (subscription now active)
registerEmailTemplate(
  "billing-trial-ended",
  `
    <div class="content">
      <h3>{{t_billing_trial_ended_heading}}</h3>
      <p>{{t_billing_trial_ended_body1}}</p>
      <p>{{t_billing_trial_ended_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_billing_trial_ended_subject}}" },
);

// 4.3 Free trial expired (no valid payment method)
registerEmailTemplate(
  "billing-trial-expired",
  `
    <div class="content">
      <h3>{{t_billing_trial_expired_heading}}</h3>
      <p>{{t_billing_trial_expired_body1}}</p>
      <p>{{t_billing_trial_expired_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_billing_trial_expired_subject}}" },
);

// 4.4 Subscription active
registerEmailTemplate(
  "billing-subscribed",
  `
    <div class="content">
      <h3>{{t_billing_subscribed_heading}}</h3>
      <p>{{t_billing_subscribed_body1}}</p>
      <p>{{t_billing_subscribed_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_billing_subscribed_subject}}" },
);

// 4.5 Subscription canceled
registerEmailTemplate(
  "billing-canceled",
  `
    <div class="content">
      <h3>{{t_billing_canceled_heading}}</h3>
      <p>{{t_billing_canceled_body1}}</p>
      <p>{{t_billing_canceled_body2}}</p>
    </div>
  `,
  { defaultSubject: "{{t_billing_canceled_subject}}" },
);

/**
 * Compiles and renders a template string or named template with variables.
 */
export function renderEmailTemplate<T extends Record<string, any>>(
  templateNameOrHtml: string,
  variables: T,
  locale: string = DEFAULT_LOCALE,
): string {
  const normVars = normalizeVariables(variables, locale);
  let compiled = templateCache.get(templateNameOrHtml);

  if (!compiled) {
    // If not a pre-registered template name, treat templateNameOrHtml as raw Handlebars HTML
    const htmlToCompile = templateNameOrHtml.includes("<html")
      ? templateNameOrHtml
      : CARD_LAYOUT.replace(
          "{{{body}}}",
          `<div class="content">${templateNameOrHtml}</div>`,
        );

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
 *   locale: 'pt-PT',
 *   variables: { first_name: 'Alex', dashboard_url: 'https://hosanna.live' }
 * });
 * ```
 */
export async function sendTemplateEmail<
  T extends Record<string, any> = Record<string, any>,
>(options: SendTemplateEmailOptions<T>) {
  const locale = options.locale || DEFAULT_LOCALE;
  const normVars = normalizeVariables(options.variables, locale);
  const registered = rawTemplates.get(options.template);

  // Dynamic subject resolution from template
  let subject = options.subject;
  if (!subject && registered?.subject) {
    subject = Handlebars.compile(registered.subject)(normVars);
  }
  if (!subject) {
    subject = (normVars as any).subject || "Hosanna Notification";
  }

  const html = renderEmailTemplate(options.template, normVars, locale);

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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "welcome",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "verify-email",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "forgot-password",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "2fa-code",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "password-reset-success",
    variables: data || {},
    locale: data?.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "account-locked",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "change-email-verification",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "email-changed-success",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "account-deleted",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "church-invitation",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-received",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-approved",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "join-request-denied",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "promoted-to-admin",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "role-changed",
    variables: data,
    locale: data.locale,
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
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "removed-from-church",
    variables: data,
    locale: data.locale,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 4.1 Free trial started
 */
export async function sendTrialStartedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    plan: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "billing-trial-started",
    variables: data,
    locale: data.locale,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 4.2 Free trial ended (subscription now active)
 */
export async function sendTrialEndedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    plan: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "billing-trial-ended",
    variables: data,
    locale: data.locale,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 4.3 Free trial expired (no valid payment method)
 */
export async function sendTrialExpiredEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    plan: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "billing-trial-expired",
    variables: data,
    locale: data.locale,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 4.4 Subscription active
 */
export async function sendSubscribedEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    plan: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "billing-subscribed",
    variables: data,
    locale: data.locale,
    scheduledAt: data.scheduledAt,
  });
}

/**
 * 4.5 Subscription canceled
 */
export async function sendCanceledEmail(
  to: string | string[],
  data: {
    church_name: string;
    churchName?: string;
    plan: string;
    first_name?: string;
    firstName?: string;
    name?: string;
    scheduledAt?: string | Date;
    locale?: string;
  },
) {
  return sendTemplateEmail({
    to,
    template: "billing-canceled",
    variables: data,
    locale: data.locale,
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
  // 4. Billing / Subscription
  sendTrialStartedEmail,
  sendTrialEndedEmail,
  sendTrialExpiredEmail,
  sendSubscribedEmail,
  sendCanceledEmail,
};

export default emailService;
