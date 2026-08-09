import { passkey } from "@better-auth/passkey";
import { redisStorage } from "@better-auth/redis-storage";
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

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia", // Latest API version as of Stripe SDK v22.0.0
});

const redis = new Redis({
  host: "localhost",
  port: 6379,
});

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      //...
    },
    resetPasswordTokenExpiresIn: 60 * 60,

    revokeSessionsOnPasswordReset: true,

    minPasswordLength: 12,
    maxPasswordLength: 128,

    autoSignIn: false,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }, request) => {
      //...
    },
    sendOnSignUp: true,
  },
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
  plugins: [
    passkey(),
    inbox(), // index("notification_user_created_idx").on(table.userId, table.createdAt)
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
          await sendTwoFactorEmail({
            email: user.email,
            otp,
          });
        },
      },
    }),
    organization({
      organizationLimit: 1,
      membershipLimit: 250,
      teams: {
        enabled: true,
        maximumTeams: 10,
      },
    }),
    stripe({
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
  ],
  advanced: {
    cookiePrefix: "hosanna",
    crossSubDomainCookies: {
      enabled: true,
      domain: "example.com",
    },
  },
  secondaryStorage: redisStorage({
    client: redis,
    keyPrefix: "better-auth:", // optional, defaults to "better-auth:"
  }),
  session: {
    freshAge: 60 * 15,
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 15 * 60,
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  rateLimit: {
    enabled: true,

    window: 60,
    max: 100,
  },
});

//app.all("/api/auth/*", toNodeHandler(auth)); // For ExpressJS v4
