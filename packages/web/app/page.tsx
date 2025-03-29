"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { initializePaddle, Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";

export default function Home() {
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!paddleClientToken) {
      throw new Error("Please set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN env var.");
    }

    initializePaddle({
      token: paddleClientToken,
      environment: "sandbox",
      debug: true,
      eventCallback: (ev) => {
        console.log(ev);
      },
      checkout: {
        settings: {
          displayMode: "overlay",
          showAddDiscounts: true,
          showAddTaxId: true,
          successUrl: "http://localhost:3000/checkout-success",
          allowedPaymentMethods: ["card", "paypal", "apple_pay"],
          allowDiscountRemoval: true,
          variant: "one-page",
        },
      },
    });
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-row gap-[32px] row-start-2 items-center sm:items-start">
        <Button asChild>
          <Link href="/signup">Sign Up</Link>
        </Button>
        <Button asChild>
          <Link href="/signin">Sign In</Link>
        </Button>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center"></footer>
    </div>
  );
}
