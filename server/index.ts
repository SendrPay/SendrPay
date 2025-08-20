import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { bot } from "../src/bot";

const app = Fastify({ logger: false });

app.get("/healthz", async () => ({ ok: true }));

const secret = process.env.TG_SECRET;
if (!secret) { console.error("Missing TG_SECRET env"); process.exit(1); }
if (!bot) { console.error("Bot token not configured (BOT_TOKEN missing?)"); process.exit(1); }

app.post(`/telegram/${secret}`, webhookCallback(bot, "fastify"));

const port = Number(process.env.PORT || 5000);
app.listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`[sendrpay] webhook ready at /telegram/${secret}, port ${port}`))
  .catch((err) => { console.error(err); process.exit(1); });
