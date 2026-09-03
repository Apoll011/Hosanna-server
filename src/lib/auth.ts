import { i18n, locales } from "@better-auth/i18n";
import { dash, sentinel } from "@better-auth/infra";
import { stripe } from "@better-auth/stripe";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import {
  admin,
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
  sendCanceledEmail,
  sendChangeEmailVerificationEmail,
  sendChurchInvitationEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendPromotedToAdminEmail,
  sendRemovedFromChurchEmail,
  sendRoleChangedEmail,
  sendSubscribedEmail,
  sendTrialEndedEmail,
  sendTrialExpiredEmail,
  sendTrialStartedEmail,
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

const pluginLocaleOverrides = {
  en: {
    ORGANIZATION_NOT_FOUND: "Organization not found",
    ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
    ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
    YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
      "You are not allowed to create a new organization",
    YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
      "You have reached the maximum number of organizations",
    USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
      "User is not a member of the organization",
    YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
      "You are not allowed to access this organization as an owner",
    YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
      "You are not a member of this organization",
    TEAM_NOT_FOUND: "Team not found",
    TEAM_ALREADY_EXISTS: "Team already exists",
    INVITATION_NOT_FOUND: "Invitation not found",
    INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
    OTP_NOT_ENABLED: "OTP not enabled",
    OTP_HAS_EXPIRED: "OTP has expired",
    TOTP_NOT_ENABLED: "TOTP not enabled",
    TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
    INVALID_BACKUP_CODE: "Invalid backup code",
    INVALID_CODE: "Invalid code",
    SUBSCRIPTION_NOT_FOUND: "Subscription not found",
    SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
    ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
      "Organization subscription is not enabled",
    EMAIL_VERIFICATION_REQUIRED: "Email verification is required",
    NOTIFICATION_NOT_FOUND: "Notification not found",
    USER_OR_ORGANIZATION_REQUIRED:
      "Provide exactly one of userId or organizationId",
    ORGANIZATION_PLUGIN_REQUIRED:
      "organizationId requires the organization plugin",
    ORGANIZATION_HAS_NO_MEMBERS: "Organization has no matching members",
    FAN_OUT_LIMIT_EXCEEDED: "Organization member count exceeds maxFanout",
    USER_ALREADY_EXISTS: "User already exists",
    FAILED_TO_CREATE_USER: "Failed to create user",
    VERIFICATION_FAILED: "Captcha verification failed",
    MISSING_RESPONSE: "Missing CAPTCHA response",
    UNKNOWN_ERROR: "Something went wrong",
    SERVICE_UNAVAILABLE: "CAPTCHA service unavailable",
  },
  pt: {
    ORGANIZATION_NOT_FOUND: "Organização não encontrada",
    ORGANIZATION_ALREADY_EXISTS: "A organização já existe",
    ORGANIZATION_SLUG_ALREADY_TAKEN:
      "O identificador da organização já está em uso",
    YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
      "Não tem permissão para criar uma nova organização",
    YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
      "Atingiu o número máximo de organizações",
    USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
      "O utilizador não é membro da organização",
    YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
      "Não tem permissão para aceder a esta organização como proprietário",
    YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "Não é membro desta organização",
    TEAM_NOT_FOUND: "Equipa não encontrada",
    TEAM_ALREADY_EXISTS: "A equipa já existe",
    INVITATION_NOT_FOUND: "Convite não encontrado",
    INVALID_TWO_FACTOR_COOKIE: "Cookie de autenticação em duas etapas inválido",
    OTP_NOT_ENABLED: "OTP não está ativado",
    OTP_HAS_EXPIRED: "O código OTP expirou",
    TOTP_NOT_ENABLED: "TOTP não está ativado",
    TWO_FACTOR_NOT_ENABLED: "A autenticação em duas etapas não está ativada",
    INVALID_BACKUP_CODE: "Código de recuperação inválido",
    INVALID_CODE: "Código inválido",
    SUBSCRIPTION_NOT_FOUND: "Subscrição não encontrada",
    SUBSCRIPTION_PLAN_NOT_FOUND: "Plano de subscrição não encontrado",
    ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
      "A subscrição da organização não está ativa",
    EMAIL_VERIFICATION_REQUIRED: "É necessário verificar o email",
    NOTIFICATION_NOT_FOUND: "Notificação não encontrada",
    USER_OR_ORGANIZATION_REQUIRED:
      "Forneça exatamente um de userId ou organizationId",
    ORGANIZATION_PLUGIN_REQUIRED:
      "organizationId requer o plugin da organização",
    ORGANIZATION_HAS_NO_MEMBERS:
      "A organização não tem membros correspondentes",
    FAN_OUT_LIMIT_EXCEEDED: "O número de membros excede o máximo permitido",
    USER_ALREADY_EXISTS: "O utilizador já existe",
    FAILED_TO_CREATE_USER: "Falha ao criar utilizador",
    VERIFICATION_FAILED: "Falha na verificação do CAPTCHA",
    MISSING_RESPONSE: "Falta a resposta do CAPTCHA",
    UNKNOWN_ERROR: "Ocorreu um erro",
    SERVICE_UNAVAILABLE: "O serviço de CAPTCHA está indisponível",
  },
  es: {
    ORGANIZATION_NOT_FOUND: "No se encontró la organización",
    ORGANIZATION_ALREADY_EXISTS: "La organización ya existe",
    ORGANIZATION_SLUG_ALREADY_TAKEN:
      "El identificador de la organización ya está en uso",
    YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
      "No tienes permiso para crear una nueva organización",
    YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
      "Has alcanzado el número máximo de organizaciones",
    USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
      "El usuario no es miembro de la organización",
    YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
      "No tienes permiso para acceder a esta organización como propietario",
    YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
      "No eres miembro de esta organización",
    TEAM_NOT_FOUND: "Equipo no encontrado",
    TEAM_ALREADY_EXISTS: "El equipo ya existe",
    INVITATION_NOT_FOUND: "Invitación no encontrada",
    INVALID_TWO_FACTOR_COOKIE:
      "Cookie de autenticación de dos factores no válido",
    OTP_NOT_ENABLED: "OTP no está habilitado",
    OTP_HAS_EXPIRED: "El código OTP ha expirado",
    TOTP_NOT_ENABLED: "TOTP no está habilitado",
    TWO_FACTOR_NOT_ENABLED:
      "La autenticación de dos factores no está habilitada",
    INVALID_BACKUP_CODE: "Código de recuperación no válido",
    INVALID_CODE: "Código no válido",
    SUBSCRIPTION_NOT_FOUND: "Suscripción no encontrada",
    SUBSCRIPTION_PLAN_NOT_FOUND: "Plan de suscripción no encontrado",
    ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
      "La suscripción de la organización no está habilitada",
    EMAIL_VERIFICATION_REQUIRED: "Se requiere verificar el correo electrónico",
    NOTIFICATION_NOT_FOUND: "Notificación no encontrada",
    USER_OR_ORGANIZATION_REQUIRED:
      "Proporciona exactamente uno de userId u organizationId",
    ORGANIZATION_PLUGIN_REQUIRED:
      "organizationId requiere el plugin de organización",
    ORGANIZATION_HAS_NO_MEMBERS:
      "La organización no tiene miembros coincidentes",
    FAN_OUT_LIMIT_EXCEEDED: "El número de miembros excede el máximo permitido",
    USER_ALREADY_EXISTS: "El usuario ya existe",
    FAILED_TO_CREATE_USER: "No se pudo crear el usuario",
    VERIFICATION_FAILED: "La verificación del CAPTCHA falló",
    MISSING_RESPONSE: "Falta la respuesta del CAPTCHA",
    UNKNOWN_ERROR: "Algo salió mal",
    SERVICE_UNAVAILABLE: "El servicio de CAPTCHA no está disponible",
  },
} as const;

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

async function isOrgMember(userId: string, organizationId: string) {
  const member = await prisma.member.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  });
  return member !== null;
}

/**
 * Returns the org display name plus the emails/names of members with the
 * given roles, used to fan out billing emails to the org leadership.
 */
async function getOrgRecipients(
  organizationId: string,
  roles: string[],
): Promise<{
  churchName: string;
  recipients: Array<{ email: string; name: string }>;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      members: {
        where: { role: { in: roles } },
        select: { user: { select: { email: true, name: true } } },
      },
    },
  });
  return {
    churchName: org?.name ?? "Hosanna",
    recipients: org?.members?.map((m) => m.user) ?? [],
  };
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
    i18n({
      translations: {
        ...locales,
        en: { ...locales.en, ...pluginLocaleOverrides.en },
        es: { ...locales.es, ...pluginLocaleOverrides.es },
        pt: { ...locales.pt, ...pluginLocaleOverrides.pt },
        "en-US": { ...locales.en, ...pluginLocaleOverrides.en },
        "es-ES": { ...locales.es, ...pluginLocaleOverrides.es },
        "pt-BR": { ...locales.pt, ...pluginLocaleOverrides.pt },
        "pt-PT": { ...locales.pt, ...pluginLocaleOverrides.pt },
      },
      defaultLocale: "pt",
      detection: ["cookie", "header"],
      localeCookie: "locale",
    }),
    dash(),
    admin(),
    inbox(),
    bearer(),
    haveIBeenPwned(),
    sentinel({
      apiKey: process.env.BETTER_AUTH_API_KEY,
      security: {
        credentialStuffing: {
          enabled: true,
          thresholds: {
            challenge: 3,
            block: 5,
          },
          windowSeconds: 3600,
          cooldownSeconds: 900,
        },
        freeTrialAbuse: {
          enabled: true,
          thresholds: {
            challenge: 2,
            block: 3,
          },
          maxAccountsPerVisitor: 3,
          action: "block",
        },
        suspiciousIpBlocking: {
          action: "block",
        },
        emailValidation: {
          enabled: true,
          strictness: "medium", // "low", "medium", or "high"
          action: "block",
        },
        emailNormalization: {
          enabled: true,
        },
      },
    }),
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
    }),
    twoFactor({
      issuer: "Hosanna",

      otpOptions: {
        storeOTP: "hashed",
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
                try {
                  const locale = await getOrgLocale(subscription.referenceId);
                  const { churchName, recipients } = await getOrgRecipients(
                    subscription.referenceId,
                    ["owner"],
                  );
                  await Promise.all(
                    recipients.map((r) =>
                      sendTrialStartedEmail(r.email, {
                        first_name: r.name,
                        church_name: churchName,
                        plan: subscription.plan,
                        locale,
                      }),
                    ),
                  );
                } catch (err) {
                  console.error(
                    "[auth] Failed to send trial started email:",
                    err,
                  );
                }
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
                try {
                  const locale = await getOrgLocale(subscription.referenceId);
                  const { churchName, recipients } = await getOrgRecipients(
                    subscription.referenceId,
                    ["owner"],
                  );
                  await Promise.all(
                    recipients.map((r) =>
                      sendTrialEndedEmail(r.email, {
                        first_name: r.name,
                        church_name: churchName,
                        plan: subscription.plan,
                        locale,
                      }),
                    ),
                  );
                } catch (err) {
                  console.error(
                    "[auth] Failed to send trial ended email:",
                    err,
                  );
                }
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
                try {
                  const locale = await getOrgLocale(subscription.referenceId);
                  const { churchName, recipients } = await getOrgRecipients(
                    subscription.referenceId,
                    ["owner"],
                  );
                  await Promise.all(
                    recipients.map((r) =>
                      sendTrialExpiredEmail(r.email, {
                        first_name: r.name,
                        church_name: churchName,
                        plan: subscription.plan,
                        locale,
                      }),
                    ),
                  );
                } catch (err) {
                  console.error(
                    "[auth] Failed to send trial expired email:",
                    err,
                  );
                }
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
        getCheckoutSessionParams: async () => ({
          params: {
            allow_promotion_codes: true,
            consent_collection: {
              terms_of_service: "required",
            },
            mode: "subscription",
          },
        }),
        authorizeReference: async ({ user, referenceId, action }) => {
          if (action === "list-subscription") {
            return isOrgMember(user.id, referenceId);
          }
          return isOrgOwner(user.id, referenceId);
        },
        onSubscriptionComplete: async ({ subscription, plan }) => {
          try {
            const locale = await getOrgLocale(subscription.referenceId);
            const { churchName, recipients } = await getOrgRecipients(
              subscription.referenceId,
              ["owner", "admin"],
            );
            await Promise.all(
              recipients.map((r) =>
                sendSubscribedEmail(r.email, {
                  first_name: r.name,
                  church_name: churchName,
                  plan: plan.name,
                  locale,
                }),
              ),
            );
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
        onSubscriptionCancel: async ({ subscription, event }) => {
          try {
            const locale = await getOrgLocale(subscription.referenceId);
            const { churchName, recipients } = await getOrgRecipients(
              subscription.referenceId,
              ["owner", "admin"],
            );
            await Promise.all(
              recipients.map((r) =>
                sendCanceledEmail(r.email, {
                  first_name: r.name,
                  church_name: churchName,
                  plan: subscription.plan,
                  locale,
                }),
              ),
            );
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
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
    },
    cookiePrefix: "hosanna",
    defaultCookieAttributes: {
      sameSite: (process.env.DEV_MODE || "true") === "true" ? "None" : "Lax",
      secure: true,
    },
    crossSubDomainCookies: {
      enabled: true,
      domain: "hosanna.live",
    },
    database: {
      joins: true,
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
      strategy: "jwe",
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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      mapProfileToUser: (profile) => {
        return {
          email: profile.email,
          name: profile.name || profile.email.split("@")[0],
          image: profile.picture,
        };
      },
    },
  },
});
