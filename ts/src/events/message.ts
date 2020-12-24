import Discord from "discord.js";
import { devs, someServers } from "../../config/config.json";
import { Client } from "../types";
import {
  ConsoleColors,
  log,
  missingPermissions,
  msToTime,
  processArguments,
} from "../utils/utils";

const cooldowns = new Discord.Collection<
  string,
  Discord.Collection<string, number>
>();
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async (client: Client, message: Discord.Message) => {
  try {
    if (
      message.author.bot ||
      message.channel.type === "dm" ||
      client.blacklistCache.has(message.author.id)
    )
      return;

    let guildInfo = client.guildInfoCache.get(message.guild!.id)!;
    if (!guildInfo) {
      const fetch = await client.DBGuild.findByIdAndUpdate(
        message.guild!.id,
        {},
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      //@ts-ignore
      guildInfo = {};
      guildInfo.prefix = fetch.prefix;
      if (fetch.disabledCommands)
        guildInfo.disabledCommands = fetch.disabledCommands;
      if (fetch.commandPerms) guildInfo.commandPerms = fetch.commandPerms;
      if (fetch.commandCooldowns)
        guildInfo.commandCooldowns = fetch.commandCooldowns;
      client.guildInfoCache.set(message.guild!.id, guildInfo);
    }

    const prefixRegex = new RegExp(
      `^(<@!?${client.user!.id}>|${escapeRegex(guildInfo.prefix)})\\s*`
    );
    if (!prefixRegex.test(message.content)) return;

    const [, matchedPrefix] = message.content.match(prefixRegex);
    let msgargs = message.content
      .slice(matchedPrefix.length)
      .trim()
      .split(/ +/);
    let cmdName = msgargs.shift()!.toLowerCase();

    if (message.mentions.has(client.user!) && !cmdName)
      return message.channel.send(
        `My prefix is \`${guildInfo.prefix}\` or ${
          client.user
        }\nTo view a list of my commands, type either \`${
          guildInfo.prefix
        }help\` or \`@${client.user!.tag} help\``
      );

    const command = client.commands.get(cmdName);

    if (!command) return;
    //@ts-ignore
    if (command.devOnly && !devs.includes(message.author.id)) return;
    //@ts-ignore
    if (command.someServersOnly && !someServers.includes(message.guild!.id))
      return;
    if (command.serverOwnerOnly && message.guild!.ownerID !== message.author.id)
      return;

    if (guildInfo.disabledCommands!.includes(command.name)) return;

    if (
      command.clientPerms &&
      !message.guild!.me!.permissions.has(command.clientPerms)
    ) {
      return message.channel
        .send(
          `${
            message.author.username
          }, I am missing the following permissions: ${missingPermissions(
            message.guild!.me!,
            //@ts-ignore
            command.clientPerms
          )}`
        )
        .catch();
    }

    if (
      guildInfo.commandPerms &&
      guildInfo.commandPerms[command.name] &&
      !message.member!.hasPermission(guildInfo.commandPerms[command.name])
    ) {
      return message.channel.send(
        `${
          message.author.username
        }, you are missing the following permissions: ${missingPermissions(
          message.member!,
          guildInfo.commandPerms[command.name]
        )}`
      );
    } else if (command.perms && !message.member!.hasPermission(command.perms)) {
      return message.channel.send(
        `${
          message.author.username
        }, you are missing the following permissions: ${missingPermissions(
          message.member!,
          //@ts-ignore
          command.perms
        )}`
      );
    }

    let cd = command.cooldown;
    if (
      guildInfo.commandCooldowns &&
      guildInfo.commandCooldowns[command.name]
    ) {
      let roles = Object.keys(guildInfo.commandCooldowns[command.name]);
      let highestRole = message
        .member!.roles.cache.filter((role) => roles.includes(role.id))
        .sort((a, b) => b.position - a.position)
        .first();
      if (highestRole)
        //@ts-ignore
        cd = guildInfo.commandCooldowns[command.name][highestRole.id] / 1000;
    }

    if (cd) {
      if (!cooldowns.has(command.name)) {
        cooldowns.set(command.name, new Discord.Collection());
      }

      const now = Date.now();
      const timestamps = cooldowns.get(command.name)!;
      const cooldownAmount = cd * 1000;
      if (timestamps.has(message.author.id)) {
        const expirationTime =
          timestamps.get(message.author.id)! + cooldownAmount;
        if (now < expirationTime)
          return message.channel.send(
            `${message.author.username}, please wait \`${msToTime(
              expirationTime - now
            )}\` before using this command again.`
          );
      }

      timestamps.set(message.author.id, now);
      setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
    }

    if (command.arguments && command.arguments.length !== 0)
      msgargs = processArguments(
        message,
        msgargs,
        //@ts-ignore
        command.arguments
      ) as string[];
    //@ts-ignore
    if (msgargs.invalid) return message.channel.send(msgargs.prompt);
    //@ts-ignore
    command.execute(client, message, msgargs);
  } catch (e) {
    log(ConsoleColors.ERROR, "src/eventHandlers/message.js", e.message);
  }
};
