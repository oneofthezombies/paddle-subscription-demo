"use client";

import { initializePaddle, Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";
import { envConfig } from "@/lib";

export default function Home() {
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    initializePaddle({
      token: envConfig.paddleClientToken,
      environment: envConfig.paddleEnv,
    }).then(setPaddle);
  }, []);

  return (
    <div>
      <main>{paddle ? "Paddle loaded" : "Paddle loading..."}</main>
    </div>
  );
}
