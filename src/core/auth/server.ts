import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 5,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      roleId: {
        type: "string",
        required: true,
        defaultValue: "",
      },
      nameAr: {
        type: "string",
        required: false,
      },
      nameEn: {
        type: "string",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      clinicId: {
        type: "string",
        required: false,
      },
      currentClinicId: {
        type: "string",
        required: false,
      },
    },
  },
  plugins: [
    username({
      displayUsername: false,
      minUsernameLength: 3,
      maxUsernameLength: 30,
    }),
  ],
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    "https://clinicos-business.vercel.app",
    "https://clinicos-business1.vercel.app",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
  ].filter((origin): origin is string => Boolean(origin)),
});