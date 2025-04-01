import { db } from "@/db";
import { MaybePromise, SignUp } from "@/lib/common";
import { Handler, JsonResponseError, Result } from "@/lib/idempotency-request";
import {
  createPaddleCustomer,
  deletePaddleCustomer,
  encryptAes256Gcm,
  hashEmail,
  hashPassword,
  users,
} from "@/lib/server";

export async function POST(req: Request) {
  const handler = new Handler({
    request: req,
    db,
    operation: "create_user",
    options: {},
    steps: {
      async onParseBefore1stTx(c) {
        const { email, password } = await SignUp.parseAsync(
          await c.request.json()
        );

        c.data.set("email", email);
        c.data.set("emailHash", await hashEmail(email));
        c.data.set("emailEncrypted", encryptAes256Gcm(email));
        c.data.set("passwordHash", await hashPassword(password));
      },
      async onParseIn1stTx(c) {
        const emailHash = c.data.get("emailHash") as string;
        const usersDb = users(c.tx);
        const user = await usersDb.findByEmail(emailHash);
        if (user) {
          throw new JsonResponseError(409, {
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Email is already in use.",
            },
          });
        }
      },
      async onExternalCall(c) {
        const email = c.data.get("email") as string;
        const paddleCustomer = await createPaddleCustomer(email);
        c.data.set("paddleCustomerId", paddleCustomer.id);
      },
      async onParseIn2ndTx(c): Promise<Result> {
        if (c.externalCallError !== null) {
          // TODO: Error details branch processing.
          return {
            kind: "retry",
            response: {
              status: 409,
              data: {
                error: {
                  code: "TEMPORARY_EXTERNAL_SERVICE_UNAVAILABLE",
                  message:
                    "An external service is temporarily unavailable. Please try again later.",
                },
              },
              headers: {
                "Retry-After": "5",
              },
            },
          } satisfies Result;
        }

        const usersDb = users(c.tx);
        const emailHash = c.data.get("emailHash") as string;
        const emailEncrypted = c.data.get("emailEncrypted") as string;
        const passwordHash = c.data.get("passwordHash") as string;
        const paddleCustomerId = c.data.get("paddleCustomerId") as string;
        const user = await usersDb.insert({
          emailEncrypted,
          emailHash,
          passwordHash,
          paddleCustomerId,
        });
        const email = c.data.get("email") as string;
        return {
          kind: "success",
          response: {
            status: 201,
            data: {
              id: user.id,
              email,
            },
            headers: {},
          },
        } satisfies Result;
      },
      async onErrorFrom2ndTx(c) {
        const paddleCustomerId = c.data.get("paddleCustomerId") as string;
        const email = c.data.get("email") as string;
        await deletePaddleCustomer(paddleCustomerId, email);
      },
    },
  });

  try {
    const response = await handler.handle();
    return Response.json(response.data, {
      status: response.status,
      headers: response.headers,
    });
  } catch (err) {
    if (err instanceof JsonResponseError) {
      return Response.json(err.data, {
        status: err.status,
        headers: err.headers,
      });
    }

    throw err;
  }
}
