import { stripe } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  bearer,
  captcha,
  haveIBeenPwned,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { inbox } from "better-inbox";
import Stripe from "stripe";
import { prisma } from "../database/prisma.js";
import { RESPONSIBILITIES } from "../locales/responsabilities.js";
import { roles } from "../permissions/index.js";
import {
  sendAccountDeletedEmail,
  sendChangeEmailVerificationEmail,
  sendChurchInvitationEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendPromotedToAdminEmail,
  sendRemovedFromChurchEmail,
  sendRoleChangedEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from "../services/email.service.js";
import { notifyOrg } from "../utils/notify.js";
import { DEFAULT_LOCALE, t } from "./i18n.js";
import {
  isBase64Image,
  isExternalImageUrl,
  uploadBase64Avatar,
  uploadUrlAvatar,
} from "./supabase.js";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-08-26.dahlia", // Latest API version as of Stripe SDK v22.0.0
});

/*
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        email: profile.email ?? `${profile.sub}@apple.placeholder.local`,
      }),
    },
  },
 */
/*
import { redisStorage } from "@better-auth/redis-storage";

const redis = new Redis({
  host: "localhost",
  port: 6379,
});

const secondaryStorage = redisStorage({
    client: redis,
    keyPrefix: "better-auth:", // optional, defaults to "better-auth:"
  })
*/
const appUrl = process.env.STUDIO_URL || "https://studio.hosanna.live";

/** Reads the locale configured in an organisation's settings metadata. */
async function getOrgLocale(organizationId: string): Promise<string> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    });
    let meta: any = {};
    if (typeof org?.metadata === "string") {
      try {
        meta = JSON.parse(org.metadata);
      } catch {
        /* ignore */
      }
    } else if (org?.metadata && typeof org.metadata === "object") {
      meta = org.metadata as any;
    }
    const locale = meta?.settings?.general?.locale ?? meta?.locale;
    if (typeof locale === "string" && locale.length > 0) return locale;
  } catch {
    /* non-fatal */
  }
  return DEFAULT_LOCALE;
}

async function isOrgOwner(userId: string, organizationId: string) {
  const member = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: { role: true },
  });
  return member?.role === "owner";
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.PUBLIC_APP_URL,
  appName: "Hosanna",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost",
    "https://*.hosanna.live",
    "https://hosanna.live",
    "hosanna://localhost",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignInAfterVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    autoSignIn: false,

    sendResetPassword: async ({ user, url, token }, request) => {
      try {
        const resetUrl = `${appUrl}/reset-password/?token=${token}`;
        await sendPasswordResetEmail(user.email, {
          name: user.name,
          url: resetUrl,
          expireMinutes: 60,
        });
      } catch (err) {
        console.error("[auth] Failed to send password reset email:", err);
      }
    },
    onPasswordReset: async ({ user }, request) => {
      try {
        await sendPasswordResetSuccessEmail(user.email, {
          first_name: user.name,
        });
      } catch (err) {
        console.error(
          "[auth] Failed to send password reset success email:",
          err,
        );
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          if (user.image && typeof user.image === "string") {
            try {
              let publicUrl: string | undefined;
              if (isBase64Image(user.image)) {
                publicUrl = await uploadBase64Avatar(user.id, user.image);
              } else if (isExternalImageUrl(user.image)) {
                publicUrl = await uploadUrlAvatar(user.id, user.image);
              }

              if (publicUrl) {
                return {
                  data: {
                    ...user,
                    image: publicUrl,
                  },
                };
              }
            } catch (err) {
              console.error(
                "[auth databaseHook] avatar upload failed on create:",
                err,
              );
            }
          }
        },
        after: async (user) => {
          try {
            await sendWelcomeEmail(user.email, {
              first_name: user.name,
            });
          } catch (err) {
            console.error("[auth] Failed to send user welcome email:", err);
          }
        },
      },
      update: {
        before: async (user, context) => {
          if (user.image && typeof user.image === "string") {
            try {
              const userId =
                (user as any).id ??
                context?.context?.session?.user?.id ??
                "unknown";

              let publicUrl: string | undefined;
              if (isBase64Image(user.image)) {
                publicUrl = await uploadBase64Avatar(userId, user.image);
              } else if (isExternalImageUrl(user.image)) {
                publicUrl = await uploadUrlAvatar(userId, user.image);
              }

              if (publicUrl) {
                return {
                  data: {
                    ...user,
                    image: publicUrl,
                  },
                };
              }
            } catch (err) {
              console.error(
                "[auth databaseHook] avatar upload failed on update:",
                err,
              );
            }
          }
        },
      },
      delete: {
        after: async (user) => {
          try {
            await sendAccountDeletedEmail(user.email, {
              first_name: user.name,
            });
          } catch (err) {
            console.error("[auth] Failed to send account deleted email:", err);
          }
        },
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      try {
        const resetUrl = `${appUrl}/verify-email/?token=${token}`;
        await sendVerificationEmail(user.email, {
          name: user.name,
          url: resetUrl,
          expireMinutes: 60,
        });
      } catch (err) {
        console.error("[auth] Failed to send verification email:", err);
      }
    },
  },
  plugins: [
    inbox(),
    bearer(),
    haveIBeenPwned(),
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
    }),
    twoFactor({
      issuer: "Hosanna",

      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          try {
            await sendOtpEmail(user.email, {
              name: user.name,
              otp,
              expireMinutes: 10,
            });
          } catch (err) {
            console.error("[auth] Failed to send 2FA OTP email:", err);
          }
        },
      },
    }),
    organization({
      organizationLimit: 1,
      membershipLimit: 500,
      teams: {
        enabled: true,
        maximumTeams: 50,
      },
      roles,
      sendInvitationEmail: async (data) => {
        try {
          const locale = await getOrgLocale(data.organization.id);
          const inviteUrl = `${appUrl}/accept-invitation/?id=${data.id}`;
          await sendChurchInvitationEmail(data.email, {
            church_name: data.organization.name,
            inviter_name: data.inviter?.user?.name || "A church leader",
            invite_link: inviteUrl,
            locale,
          });
        } catch (err) {
          console.error("[auth] Failed to send church invitation email:", err);
        }
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization, user }) => {
          const locale =
            (organization?.metadata?.["locale"] as string) || "pt-PT";
          return {
            data: {
              ...organization,
              metadata: {
                description:
                  (organization?.metadata?.["description"] as string) || "",
                shortName:
                  (organization?.metadata?.["shortName"] as string) ||
                  organization.name
                    ?.split(/\s+/)
                    .map((word) => word[0])
                    .join("") ||
                  "",
                settings: {
                  general: {
                    locale,
                    timezone:
                      (organization?.metadata?.["timezone"] as string) ||
                      "Europe/Lisbon",
                    weekStartsOn: 1,
                  },
                  services: {
                    defaultDurations: {
                      sermon: 2300,
                      song: 210,
                    },
                    showNotes: true,
                    showServiceDuration: true,
                    autoSave: true,
                  },
                  appearance: {
                    accentColor: "#44e0ff",
                    showBranding: true,
                  },
                  agenda: {
                    responsibilityCategories:
                      RESPONSIBILITIES[
                        locale as keyof typeof RESPONSIBILITIES
                      ] ?? RESPONSIBILITIES["pt-PT"],
                  },
                },
              },
            },
          };
        },

        afterAddMember: async ({ member, user, organization }) => {
          try {
            const locale = await getOrgLocale(organization.id);
            await sendWelcomeEmail(user.email, {
              first_name: user.name,
              organizationName: organization.name,
              dashboardUrl: appUrl,
              locale,
            });
          } catch (err) {
            console.error("[auth] Failed to send welcome email:", err);
          }

          notifyOrg({
            organizationId: organization.id,
            roles: ["admin", "owner"],
            type: "org.new_member",
            title: t(DEFAULT_LOCALE, "notification.new_member_title"),
            description: t(
              DEFAULT_LOCALE,
              "notification.new_member_description",
              {
                name: user.name,
              },
            ),
          });
        },

        afterUpdateMemberRole: async ({
          member,
          previousRole,
          user,
          organization,
        }) => {
          try {
            const locale = await getOrgLocale(organization.id);
            if (member.role === "admin" || member.role === "owner") {
              await sendPromotedToAdminEmail(user.email, {
                first_name: user.name,
                church_name: organization.name,
                workspace_settings_url: `${appUrl}/${organization.slug}/settings`,
                locale,
              });
            } else {
              await sendRoleChangedEmail(user.email, {
                first_name: user.name,
                church_name: organization.name,
                new_role: member.role,
                locale,
              });
            }
          } catch (err) {
            console.error(
              "[auth] Failed to send member role updated email:",
              err,
            );
          }
        },

        afterRemoveMember: async ({ member, user, organization }) => {
          try {
            const locale = await getOrgLocale(organization.id);
            await sendRemovedFromChurchEmail(user.email, {
              first_name: user.name,
              church_name: organization.name,
              locale,
            });
          } catch (err) {
            console.error(
              "[auth] Failed to send removed from church email:",
              err,
            );
          }
        },
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: false,
      subscription: {
        enabled: true,
        plans: [
          {
            name: "cloud",
            priceId: "price_1U8VA3RpLrnXO63sBlJexS4p",
            annualDiscountPriceId: "price_1UB1xcRpLrnXO63soQj5HG4Y",
            freeTrial: {
              days: 14,
              onTrialStart: async (subscription) => {
                notifyOrg({
                  organizationId: subscription.referenceId,
                  roles: ["owner"],
                  type: "billing.trial_started",
                  title: t(DEFAULT_LOCALE, "notification.trial_started_title"),
                  description: t(
                    DEFAULT_LOCALE,
                    "notification.trial_started_description",
                  ),
                });
              },
              onTrialEnd: async ({ subscription }) => {
                notifyOrg({
                  organizationId: subscription.referenceId,
                  roles: ["owner"],
                  type: "billing.trial_ended",
                  title: t(DEFAULT_LOCALE, "notification.trial_ended_title"),
                  description: t(
                    DEFAULT_LOCALE,
                    "notification.trial_ended_description",
                  ),
                });
              },
              onTrialExpired: async (subscription) => {
                notifyOrg({
                  organizationId: subscription.referenceId,
                  roles: ["owner"],
                  type: "billing.trial_expired",
                  title: t(DEFAULT_LOCALE, "notification.trial_expired_title"),
                  description: t(
                    DEFAULT_LOCALE,
                    "notification.trial_expired_description",
                  ),
                });
              },
            },
          },
        ],
        // We only ever bill organizations (referenceId === organization id),
        // so every action is authorized against org-owner membership.
        authorizeReference: async ({ user, referenceId }) => {
          return isOrgOwner(user.id, referenceId);
        },
        onSubscriptionComplete: async ({ subscription, plan }) => {
          try {
            notifyOrg({
              organizationId: subscription.referenceId,
              roles: ["owner", "admin"],
              type: "billing.subscribed",
              title: t(DEFAULT_LOCALE, "notification.subscribed_title"),
              description: t(
                DEFAULT_LOCALE,
                "notification.subscribed_description",
                { plan: plan.name },
              ),
            });
          } catch (err) {
            console.error(
              "[auth] Failed to notify org after subscription complete:",
              err,
            );
          }
        },
        onSubscriptionCancel: async ({ subscription }) => {
          try {
            notifyOrg({
              organizationId: subscription.referenceId,
              roles: ["owner", "admin"],
              type: "billing.canceled",
              title: t(DEFAULT_LOCALE, "notification.canceled_title"),
              description: t(
                DEFAULT_LOCALE,
                "notification.canceled_description",
              ),
            });
          } catch (err) {
            console.error(
              "[auth] Failed to notify org after subscription cancel:",
              err,
            );
          }
        },
      },
      organization: {
        enabled: true,
      },
    }),
  ],
  advanced: {
    cookiePrefix: "hosanna",
    defaultCookieAttributes: {
      sameSite: (process.env.DEV_MODE || "true") === "true" ? "None" : "Lax",
      secure: true,
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: "hosanna.live",
    },
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async (
        {
          user,
          newEmail,
          url,
          token,
        }: { user: any; newEmail: string; url: string; token: string },
        request?: any,
      ) => {
        try {
          await sendChangeEmailVerificationEmail(newEmail, {
            first_name: user.name,
            new_email: newEmail,
            confirm_email_link: url,
          });
        } catch (err) {
          console.error(
            "[auth] Failed to send change email verification:",
            err,
          );
        }
      },
    },
  },
  session: {
    freshAge: 0,
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 15 * 60,
      version: () => {
        return "1";
      },
    },
  },
  rateLimit: {
    enabled: true,

    window: 60,
    max: 100,
  },
});
