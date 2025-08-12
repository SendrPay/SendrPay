import { REST, Routes, SlashCommandBuilder } from "discord.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);
const APP_ID = process.env.DISCORD_APP_ID!;

const commands = [
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("Start using SendrPay"),
    
  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send crypto")
    .addStringOption(o => o.setName("target").setDescription("@handle / platform:@handle / url").setRequired(true))
    .addStringOption(o => o.setName("amount").setDescription("e.g., 0.1").setRequired(true))
    .addStringOption(o => o.setName("token").setDescription("e.g., SOL, USDC").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Optional note")),
    
  new SlashCommandBuilder()
    .setName("tip")
    .setDescription("Tip a user")
    .addStringOption(o => o.setName("amount").setDescription("e.g., 1").setRequired(true))
    .addStringOption(o => o.setName("token").setDescription("e.g., BONK").setRequired(true)),
    
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View balances"),
    
  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Get deposit address")
    .addStringOption(o => o.setName("token").setDescription("Optional token")),
    
  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw funds")
    .addStringOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
    .addStringOption(o => o.setName("token").setDescription("Token").setRequired(true))
    .addStringOption(o => o.setName("address").setDescription("Recipient address").setRequired(true)),
    
  new SlashCommandBuilder()
    .setName("linktelegram")
    .setDescription("Link your Telegram account"),
    
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show detailed help and command information"),
    
  new SlashCommandBuilder()
    .setName("history")
    .setDescription("View your recent transaction history"),
].map(c => c.toJSON());

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(APP_ID), { body: commands });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();