"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { initializePaddle, Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Home() {
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    toast.error(`Please set Paddle Client Token.`);
    const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!paddleClientToken) {
      setTimeout(() => toast.error(`Please set Paddle Client Token.`));
      return;
    }

    initializePaddle({
      token: paddleClientToken,
      environment: "sandbox",
      debug: true,
      eventCallback: (ev) => {
        toast.info(`Paddle event. ${ev}`);
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
    })
      .then(setPaddle)
      .catch((err) => toast.error(`Paddle initialization failed. ${err}`));
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <p>{paddle ? "Paddle loaded" : "Paddle loading..."}</p>
        <div className="flex flex-row gap-[32px] row-start-2 items-center sm:items-start">
          <Button asChild>
            <Link href="/signup">Sign Up</Link>
          </Button>
          <Button asChild>
            <Link href="/signin">Sign In</Link>
          </Button>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center"></footer>
    </div>
  );
}
