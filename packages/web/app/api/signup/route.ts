import { Db, db } from "@/db";
import { error, MaybePromise, resultify, SignUp } from "@/lib/common";
import {
  createPaddleCustomer,
  decryptAes256Gcm,
  deletePaddleCustomer,
  encryptAes256Gcm,
  hashEmail,
  hashPassword,
  IdemTaskCtx,
  idemTasks,
  respondJson,
  users,
} from "@/lib/server";

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return respondJson(400, error("IDEMPOTENCY_KEY_REQUIRED"));
  }

  const { email, password } = await SignUp.parseAsync(await request.json());
  const emailHash = await hashEmail(email);
  const emailEncrypted = encryptAes256Gcm(email);
  const passwordHash = await hashPassword(password);

  const t0Res = await resultify(async () => {
    return await db.transaction(async (tx) => {
      const usersDb = users(tx);
      const user = await usersDb.findByEmail(emailHash);
      if (user) {
        return respondJson(409, error("EMAIL_ALREADY_EXISTS"));
      }

      const idemTasksDb = idemTasks(tx);
      await idemTasksDb.tryInsert({ idempotencyKey, operation: "create_user" });
      const task = await idemTasksDb.selectForUpdate(idempotencyKey);
      if (!task) {
        throw new Error("Task must exist.");
      }

      const { status, context, operation, step } = task;
      if (operation !== "create_user") {
        return respondJson(400, error("IDEMPOTENCY_KEY_MISMATCH"));
      }

      if (status === "to_request") {
        return respondJson(409, error("DUPLICATE_REQUEST"));
      }

      if (status === "failed") {
        return respondJson(409, error("IDEMPOTENT_REQUEST_FAILED"));
      }

      if (status === "succeeded") {
        const { userId } =
          await IdemTaskCtx.create_user__user_created.parseAsync(context);
        const user = await usersDb.findById(userId);
        if (!user) {
          throw new Error("User must exist.");
        }

        const emailDecrypted = decryptAes256Gcm(emailEncrypted);
        return respondJson(200, {
          id: userId,
          email: emailDecrypted,
        });
      }

      if (status === "started" || status === "retryable") {
        await idemTasksDb.update(idempotencyKey, {
          status: "to_request",
        });

        if (step === null) {
          await idemTasksDb.update(idempotencyKey, {
            step: "create_user__paddle_customer_creation_to_request",
          });
          return null;
        }

        if (step === "create_user__paddle_customer_creation_to_request") {
          return null;
        }

        throw new Error(`Unexpected step. ${step}`);
      }

      throw new Error(`Unexpected status. ${status}`);
    });
  });

  if (!t0Res.ok) {
    await idemTasks(db).update(idempotencyKey, { status: "retryable" });
    console.error("Failed to create_user t0.", t0Res.error);
    return respondJson(503, error("TEMPORARY_UNAVAILABLE"), {
      "Retry-After": "5",
    });
  }

  if (t0Res.data) {
    return t0Res.data;
  }

  // TODO: Add timeout to handle cases where the server shuts down or hangs while status is in_progress.
  const e0Res = await resultify(() => createPaddleCustomer(email));

  const t1Res = await resultify(async () => {
    return await db.transaction(async (tx) => {
      const idemTasksDb = idemTasks(tx);
      const task = await idemTasksDb.selectForUpdate(idempotencyKey);
      if (!task) {
        throw new Error("Task must exist.");
      }

      if (!e0Res.ok) {
        await idemTasksDb.update(idempotencyKey, { status: "retryable" });
        return respondJson(503, error("TEMPORARY_UNAVAILABLE"), {
          "Retry-After": "5",
        });
      }

      const paddleCustomer = e0Res.data;
      const { context } = task;
      const usersDb = users(tx);
      const user = await usersDb.insert({
        emailEncrypted,
        emailHash,
        passwordHash,
        paddleCustomerId: paddleCustomer.id,
      });

      Reflect.set(context as object, "paddleCustomerId", paddleCustomer.id);
      Reflect.set(context as object, "userId", user.id);
      await idemTasksDb.update(idempotencyKey, {
        context,
        step: "create_user__user_created",
        status: "succeeded",
      });
      return user;
    });
  });

  if (!t1Res.ok) {
    if (e0Res.ok) {
      const paddleCustomer = e0Res.data;
      const paddleRes = await resultify(() =>
        deletePaddleCustomer(paddleCustomer.id, email)
      );
      if (!paddleRes.ok) {
        console.error("Failed to delete paddle customer.", paddleRes.error);
      }
    }

    const taskRes = await resultify(() =>
      idemTasks(db).update(idempotencyKey, { status: "retryable" })
    );
    if (!taskRes.ok) {
      console.error(
        "Failed to update status of task to failed.",
        taskRes.error
      );
    }

    console.error("Failed to create_user t1.", t1Res.error);
    return respondJson(503, error("TEMPORARY_UNAVAILABLE"), {
      "Retry-After": "5",
    });
  }

  if (t1Res.data instanceof Response) {
    return t1Res.data;
  }

  const user = t1Res.data;
  const emailDecrypted = decryptAes256Gcm(emailEncrypted);
  return respondJson(201, {
    id: user.id,
    email: emailDecrypted,
  });
}
