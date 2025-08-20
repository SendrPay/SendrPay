import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { bot } from "../src/bot.js";

const app = Fastify({ logger: true });

const secret = process.env.TG_SECRET;
if (!secret) {
  console.error("Missing TG_SECRET env");
  process.exit(1);
}
if (!bot) {
  console.error("Bot token not configured (BOT_TOKEN missing?)");
  process.exit(1);
}

app.get("/healthz", async () => ({ ok: true }));
app.post(`/telegram/${secret}`, webhookCallback(bot, "fastify"));

if (process.env.DEBUG) {
  bot.start();
  console.log("Polling enabled");
}

const port = Number(process.env.PORT || 5000);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`SendrPay listening on :${port}`);
    console.log(`Webhook path /telegram/${secret}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
