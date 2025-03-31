import { db } from "@/db";
import { error, SignUp, tryAsync } from "@/lib/common";
import {
  createPaddleCustomer,
  createUser,
  decryptAes256Gcm,
  deletePaddleCustomer,
  encryptAes256Gcm,
  findUserByEmail,
  findUserById,
  hashEmail,
  hashPassword,
  IdemTaskCtx,
  respondJson,
  selectIdemTaskForUpdate,
  tryInsertIdemTask,
  updateIdemCols,
  updateIdemTaskStatus,
  updateIdemTaskStep,
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

  const tx0Res = await tryAsync(async () => {
    return await db.transaction(async (tx) => {
      const user = await findUserByEmail(tx, emailHash);
      if (user) {
        return respondJson(409, error("EMAIL_ALREADY_EXISTS"));
      }

      await tryInsertIdemTask(tx, idempotencyKey, "create_user");
      const task = await selectIdemTaskForUpdate(tx, idempotencyKey);
      if (!task) {
        throw new Error("Task must exist.");
      }

      const { status, context, operation, step } = task;
      if (operation !== "create_user") {
        return respondJson(400, error("IDEMPOTENCY_KEY_MISMATCH"));
      }

      if (status === "in_progress") {
        return respondJson(409, error("DUPLICATE_REQUEST"));
      }

      if (status === "succeeded") {
        const { userId } =
          await IdemTaskCtx.create_user__user_created.parseAsync(context);
        const user = await findUserById(tx, userId);
        if (!user) {
          throw new Error("User must exist.");
        }

        const emailDecrypted = decryptAes256Gcm(emailEncrypted);
        return respondJson(200, {
          id: userId,
          email: emailDecrypted,
        });
      }

      if (status === null || status === "failed") {
        await updateIdemTaskStatus(tx, idempotencyKey, "in_progress");

        if (step === null) {
          await updateIdemTaskStep(
            tx,
            idempotencyKey,
            "create_user__paddle_customer_creation_requested"
          );
          return null;
        }

        if (step === "create_user__paddle_customer_creation_requested") {
          return null;
        }

        throw new Error(`Unexpected step. ${step}`);
      }

      throw new Error(`Unexpected status. ${status}`);
    });
  });

  if (!tx0Res.ok) {
    await updateIdemTaskStatus(db, idempotencyKey, "failed");
    throw tx0Res.error;
  }

  if (tx0Res.data) {
    return tx0Res.data;
  }

  // TODO: A timeout is needed to cover the case where the server stops when status is in_progress.
  const paddleCustomer = await createPaddleCustomer(email);

  const tx1Res = await tryAsync(async () => {
    return await db.transaction(async (tx) => {
      const task = await selectIdemTaskForUpdate(tx, idempotencyKey);
      if (!task) {
        throw new Error("Task must exist.");
      }

      const { context } = task;
      const user = await createUser(
        tx,
        emailEncrypted,
        emailHash,
        passwordHash,
        paddleCustomer.id
      );

      Reflect.set(context as object, "paddleCustomerId", paddleCustomer.id);
      Reflect.set(context as object, "userId", user.id);
      await updateIdemCols(tx, idempotencyKey, {
        context,
        step: "create_user__user_created",
        status: "succeeded",
      });
      return user;
    });
  });

  if (!tx1Res.ok) {
    const paddleRes = await tryAsync(() =>
      deletePaddleCustomer(paddleCustomer.id, email)
    );
    if (!paddleRes.ok) {
      console.error("Failed to delete paddle customer.", paddleRes.error);
    }

    const taskRes = await tryAsync(() =>
      updateIdemTaskStatus(db, idempotencyKey, "failed")
    );
    if (!taskRes.ok) {
      console.error(
        "Failed to update status of task to failed.",
        taskRes.error
      );
    }

    throw tx1Res.error;
  }

  const user = tx1Res.data;
  const emailDecrypted = decryptAes256Gcm(emailEncrypted);
  return respondJson(201, {
    id: user.id,
    email: emailDecrypted,
  });
}
