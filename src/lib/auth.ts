import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  bearer,
  haveIBeenPwned,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { inbox } from "better-inbox";
import { prisma } from "../database/prisma.js";
import { roles } from "../permissions/index.js";
import { notifyOrg } from "../utils/notify.js";

/*import Stripe from "stripe";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia", // Latest API version as of Stripe SDK v22.0.0
});

const stripePlugin =     stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: false,
      subscription: {
        enabled: true,
        authorizeReference: async ({ user, session, referenceId, action }) => {
          if (
            action === "upgrade-subscription" ||
            action === "cancel-subscription" ||
            action === "restore-subscription"
          ) {
            const org = await prismaAdapter.member.findFirst({
              where: {
                organizationId: referenceId,
                userId: user.id,
              },
            });
            return org?.role === "owner";
          }
          return true;
        },
        plans: [
          {
            name: "Hosanna",
            priceId: "...",
            annualDiscountPriceId: "...",
            freeTrial: {
              days: 14,
            },
          },
        ],
      },
      organization: {
        enabled: true,
      },
    }),
*/
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
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.PUBLIC_APP_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: [
    "https://dashboard-hosanna.duckdns.org",
    "https://www.dashboard-hosanna.duckdns.org",
    "https://hosana.vercel.app",
    "http://localhost:3000",
    "http://localhost",
    "capacitor://localhost",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    autoSignIn: false,

    sendResetPassword: async ({ user, url, token }, request) => {
      //...
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }, request) => {
      //...
    },
  },
  plugins: [
    inbox(),
    bearer(),
    haveIBeenPwned(),
    //captcha({
    //provider: "cloudflare-turnstile",
    //secretKey:process.env.TURNSTILE_SECRET_KEY!,
    //}),
    twoFactor({
      issuer: "Hosanna",

      otpOptions: {
        sendOTP: async ({ user, otp }) => {},
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
      organizationHooks: {
        beforeCreateOrganization: async ({ organization, user }) => {
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
                    locale:
                      (organization?.metadata?.["locale"] as string) || "pt-PT",
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
                },
              },
            },
          };
        },

        afterAddMember: async ({ member, user, organization }) => {
          //await sendWelcomeEmail(user.email, organization.name);
          notifyOrg({
            organizationId: organization.id,
            roles: ["admin", "owner"],
            type: "org.new_member",
            title: "Um novo membro entrou!",
            description: `${user.name} agora faz parte da organização`,
          });
        },
      },
    }),
  ],
  advanced: {
    cookiePrefix: "hosanna",
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
    //crossSubDomainCookies: {
    //  enabled: true,
    //  domain: "example.com",
    //},
  },
  session: {
    freshAge: 60 * 15,
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 15 * 60,
      version: (_session, user) => {
        if (
          user?.image &&
          (user.image.startsWith("data:") || user.image.length > 500)
        ) {
          return "no-cache-" + Date.now();
        }
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
