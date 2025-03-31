"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { SignUp } from "@/lib/common";

export function SignUpForm() {
  const form = useForm<SignUp>({
    resolver: zodResolver(SignUp),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: SignUp) {
    const signUpIdempotencyKey =
      localStorage.getItem("signUpIdempotencyKey") || crypto.randomUUID();
    localStorage.setItem("signUpIdempotencyKey", signUpIdempotencyKey);

    // TODO: For testing idempotent requests
    for (let i = 0; i < 10; ++i) {
      fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": signUpIdempotencyKey,
        },
        body: JSON.stringify(values),
      })
        .then(async (res) => {
          const { status } = res;
          if (res.ok || (400 <= status && status < 500)) {
            localStorage.removeItem("signUpIdempotencyKey");
          }

          if (!res.ok) {
            toast.error(`Sign Up failed. ${status} ${await res.text()}`);
          } else {
            toast.success("Sign Up succeeded.");
          }
        })
        .catch((err) => toast.error(`Sign Up request failed. ${err}`));
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 max-w-sm mx-auto"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Sign Up
        </Button>
      </form>
    </Form>
  );
}

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <SignUpForm />
    </main>
  );
}
