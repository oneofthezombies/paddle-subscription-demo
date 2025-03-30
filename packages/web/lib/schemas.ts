import { z } from "zod";

export const SignUp = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required." })
    .email({ message: "Invalid email address." }),
  password: z
    .string()
    .min(1, { message: "Password must be at least 1 characters." }),
});
export type SignUp = z.infer<typeof SignUp>;
