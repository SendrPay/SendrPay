import Fastify from "fastify";
import { handleTelegramUpdate } from "../adapters/telegram";

const fastify = Fastify({ logger: true });

const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  throw new Error("WEBHOOK_SECRET environment variable is required");
}

fastify.post(`/telegram/${secret}`, async (request, reply) => {
  handleTelegramUpdate(request.body);
  reply.status(200).send();
});

fastify.get("/healthz", async (_request, reply) => {
  reply.status(200).send();
});

const port = Number(process.env.PORT) || 3000;
fastify
  .listen({ port, host: "0.0.0.0" })
  .catch(err => {
    fastify.log.error(err);
    process.exit(1);
  });
