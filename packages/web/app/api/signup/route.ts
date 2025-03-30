import { ErrorCode, errorObject, SignUp } from "@/lib/common";
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
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return Response.json(errorObject("MISSING_IDEMPOTENCY_KEY"), {
      status: 400,
    });
  }

  const { email, password } = await SignUp.parseAsync(await request.json());
  // Check email from db.

  const customer = await paddle.customers.create({
    email,
  });
  // Create user to db; retry N times.
  // If failed update paddle customer email to <reason>:<uuid>:<email> and archived.

  return Response.json({});
}
