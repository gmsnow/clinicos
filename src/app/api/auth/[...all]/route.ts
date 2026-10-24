import { auth } from "@/core/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const GET = async (req: Request) => {
  try {
    return await handlers.GET(req);
  } catch (e) {
    console.error("[auth][GET]", e);
    throw e;
  }
};

export const POST = async (req: Request) => {
  try {
    return await handlers.POST(req);
  } catch (e) {
    console.error("[auth][POST]", e);
    throw e;
  }
};
