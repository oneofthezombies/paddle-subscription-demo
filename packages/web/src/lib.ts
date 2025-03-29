import { type Environments } from "@paddle/paddle-js";

export const envConfig = parseEnvConfig();

function parseEnvConfig() {
  const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!paddleClientToken) {
    throw new Error("Please set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN env var.");
  }

  const paddleEnv: Environments =
    process.env.NODE_ENV === "production" ? "production" : "sandbox";

  return {
    paddleClientToken,
    paddleEnv,
  };
}
