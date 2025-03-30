import { SignUp } from "@/lib/schemas";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";

const paddleApiKey = process.env.PADDLE_API_KEY;
if (!paddleApiKey) {
  throw new Error("Please set Paddle API Key.");
}

const paddle = new Paddle(paddleApiKey, {
  environment: Environment.sandbox,
  logLevel: LogLevel.verbose,
});

export async function POST(request: Request) {
  const { email, password } = await SignUp.parseAsync(await request.json());
  const customer = await paddle.customers.create({
    email,
  });
  return Response.json({});
}
