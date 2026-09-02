import type { I18nKeys } from "./pt-PT.js";

/**
 * en-US — English locale.
 */
const en = {
  // ── errors / middleware ─────────────────────────────────────────────────
  error: {
    route_not_found: "No route matches {{method}} {{path}}",
    resource_not_found: "The resource does not exist.",
    duplicate_resource: "A resource with this unique value already exists.",
    internal_error: "An unexpected error occurred.",
    validation_failed: "Request validation failed.",
    unauthenticated: "Unauthenticated",
    missing_permission: "Insufficient permissions",
    forbidden_default: "You do not have permission to perform this action.",
    unauthorized_session: "Invalid or missing authentication session.",
    workspace_required: "An active workspace/organization context is required.",
    subscription_required:
      "The organization has no active subscription or ongoing trial. Only read access is allowed.",
    rate_limit_exceeded: "Too many requests. Please try again later.",
  },

  // ── conflict / optimistic concurrency ──────────────────────────────────
  conflict: {
    default:
      "The resource was modified by someone else. Please reload and try again.",
    song: "This song was modified by someone else since you last loaded it.",
    folder:
      "This folder was modified by someone else since you last loaded it.",
    service:
      "This service was modified by someone else since you last loaded it.",
  },

  // ── songs ───────────────────────────────────────────────────────────────
  song: {
    not_found: "The song does not exist.",
    unknown_artist: "Unknown Artist",
    varios: "Various",
  },

  // ── folders ─────────────────────────────────────────────────────────────
  folder: {
    not_found: "The folder does not exist.",
    deleted: "Folder deleted",
  },

  // ── services ────────────────────────────────────────────────────────────
  service: {
    not_found: "The service does not exist.",
  },

  // ── backup ──────────────────────────────────────────────────────────────
  backup: {
    restored_successfully: "Backup restored successfully",
    invalid_file: "Invalid or corrupted backup file.",
    missing_arrays: "The backup file does not contain the expected arrays.",
  },

  // ── notifications ───────────────────────────────────────────────────────
  notification: {
    new_member_title: "A new member has joined!",
    new_member_description: "{{name}} is now part of the organization",
    folder_deleted_title: "Folder deleted with all its contents",
    folder_deleted_description:
      "{{songs}} song(s) and {{folders}} subfolder(s) were permanently removed.",
    backup_restored_title: "Backup restored — all data replaced",
    backup_restored_description:
      "A full restore imported {{folders}} folder(s), {{songs}} song(s), and {{services}} service(s).",
    trial_started_title: "Free trial started",
    trial_started_description:
      "Your free trial has started. Enjoy all Hosanna features!",
    trial_ended_title: "Free trial ended",
    trial_ended_description:
      "Your trial has ended and your subscription is now active.",
    trial_expired_title: "Free trial expired",
    trial_expired_description:
      "Your trial expired without payment. Renew your subscription to keep access.",
    subscribed_title: "Subscription active",
    subscribed_description: "Your {{plan}} subscription is now active.",
    canceled_title: "Subscription canceled",
    canceled_description:
      "Your subscription has been canceled. Access remains available until the end of the billing period.",
  },

  // ── email templates ─────────────────────────────────────────────────────
  email: {
    footer: "© {{year}} Hosanna. All rights reserved.",
    welcome: {
      subject: "Welcome to Hosanna",
      heading: "Welcome to Hosanna{{#if first_name}}, {{first_name}}{{/if}}!",
      body1: "We are thrilled to have you join our community. Hosanna is designed to help you connect, engage, and grow with your church family effortlessly.",
      body2: "To get started, you can explore your dashboard or set up your profile.",
      cta: "Go to Dashboard",
    },
    verify_email: {
      subject: "Verify your email address - Hosanna",
      heading: "Verify your email address",
      body1: "Thanks for signing up for Hosanna! Please click the button below to verify your email address and secure your account.",
      cta: "Verify Email",
      ignore: "If you didn't create an account, you can safely ignore this email.",
    },
    forgot_password: {
      subject: "Reset your Hosanna password",
      heading: "Reset your password",
      body1: "We received a request to reset the password for your Hosanna account. Click the button below to choose a new password.",
      cta: "Reset Password",
      expiry: "This link will expire in {{expiry_time}} minutes. If you did not request a password reset, no further action is required.",
    },
    otp: {
      subject: "Your Hosanna verification code",
      heading: "Here is your Hosanna login code:",
      expiry: "This code will expire in {{expiry_time}} minutes. If you didn't request this, you can ignore this email.",
    },
    password_reset_success: {
      subject: "Password updated successfully - Hosanna",
      heading: "Password updated successfully",
      body1: "Your Hosanna account password has been successfully changed.",
      body2: "If you did not make this change, please contact your administrator or Hosanna support immediately to secure your account.",
    },
    account_locked: {
      subject: "Account temporarily locked - Hosanna",
      heading: "Account temporarily locked",
      body1: "We detected multiple failed login attempts on your account. To protect your security, your account has been temporarily locked.",
      body2: "You will be able to try logging in again in {{lockout_minutes}} minutes.",
    },
    change_email_verification: {
      subject: "Verify your new email address - Hosanna",
      heading: "Verify your new email address",
      body1: "You recently requested to change the email address associated with your Hosanna account to {{new_email}}.",
      body2: "Please click the button below to confirm this change.",
      cta: "Approve Email Change",
    },
    email_changed_success: {
      subject: "Email address updated - Hosanna",
      heading: "Email address updated",
      body1: "Your account email has been successfully updated to {{new_email}}. You will use this new email to log in moving forward.",
    },
    account_deleted: {
      subject: "Your Hosanna account has been deleted",
      heading: "Your account has been deleted",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "We confirm that your Hosanna account has been permanently deleted as requested. All associated data has been removed from our active systems.",
      body2: "We're sad to see you go. If you ever need us in the future, you're always welcome back.",
    },
    church_invitation: {
      subject: "You've been invited to join a church - Hosanna",
      heading: "You've been invited to {{church_name}}",
      body1: "{{inviter_name}} has invited you to join their workspace on Hosanna.",
      body2: "Join {{church_name}} to connect with your community, view events, and stay up to date.",
      cta: "Accept Invitation",
    },
    join_request_received: {
      subject: "Join request received - Hosanna",
      heading: "Join request received",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Your request to join {{church_name}} has been received and is currently pending admin approval.",
      body2: "We will notify you via email as soon as an admin reviews your request.",
    },
    join_request_approved: {
      subject: "You're in! Join request approved - Hosanna",
      heading: "You're in! Request approved",
      body1: "Great news! Your request to join {{church_name}} has been approved by an admin.",
      body2: "You can now access the workspace, view members, and get involved.",
      cta: "Join Workspace",
    },
    join_request_denied: {
      subject: "Update on your join request - Hosanna",
      heading: "Update on your join request",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Your request to join {{church_name}} could not be approved at this time.",
      body2: "If you believe this was a mistake, please reach out directly to the church administration.",
    },
    promoted_to_admin: {
      subject: "You are now an Admin - Hosanna",
      heading: "You are now an Admin",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Your role in {{church_name}} has been updated. You are now an Admin.",
      body2: "You now have access to workspace settings, member management, and administrative tools.",
      cta: "View Admin Dashboard",
    },
    role_changed: {
      subject: "Your role has been updated - Hosanna",
      heading: "Your role has been updated",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Your role in {{church_name}} has been changed to {{new_role}}.",
      body2: "If you have any questions about this change, please contact your workspace administrator.",
    },
    removed_from_church: {
      subject: "Workspace access removed - Hosanna",
      heading: "Workspace access removed",
      salutation: "Hi{{#if first_name}} {{first_name}}{{/if}},",
      body1: "You have been removed from the {{church_name}} workspace. You will no longer have access to this community's dashboard or member information.",
    },

    // ── 4. billing / subscription ─────────────────────────────────────────
    billing_trial_started: {
      subject: "Your free trial has started - Hosanna",
      heading: "Your free trial has started",
      body1: "Your free trial of the {{plan}} plan is now active for {{church_name}}.",
      body2: "Explore all Hosanna features during your trial period.",
    },
    billing_trial_ended: {
      subject: "Your free trial has ended - Hosanna",
      heading: "Your free trial has ended",
      body1: "The trial period for {{church_name}} has ended and your {{plan}} subscription is now active.",
      body2: "You can manage your subscription from the workspace settings.",
    },
    billing_trial_expired: {
      subject: "Your free trial has expired - Hosanna",
      heading: "Your free trial has expired",
      body1: "The trial period for {{church_name}} has expired without a valid payment method.",
      body2: "To keep access, please renew your subscription from the workspace settings.",
    },
    billing_subscribed: {
      subject: "Subscription active - Hosanna",
      heading: "Subscription active",
      body1: "The {{church_name}} subscription to the {{plan}} plan is now active.",
      body2: "Thank you for choosing Hosanna!",
    },
    billing_canceled: {
      subject: "Subscription canceled - Hosanna",
      heading: "Subscription canceled",
      body1: "The {{church_name}} subscription has been canceled.",
      body2: "Access will remain available until the end of the billing period. If you change your mind, you can reactivate your subscription at any time.",
    },
  },
} as const satisfies I18nKeys;

export default en;
