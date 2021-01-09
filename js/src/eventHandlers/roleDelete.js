const { Role } = require('discord.js');

/**
 * roleDelete event
 * @param {import('../typings.d').myClient} client 
 * @param {Role} role 
 */
module.exports = async (client, role) => {
    let guildInfo = client.guildInfoCache.get(role.guild.id)
    if (!guildInfo) {
        const guildInfo = await client.DBGuild.findByIdAndUpdate(role.guild.id, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
        delete guildInfo._id
        client.guildInfoCache.set(role.guild.id, guildInfo)
    }

    let commandCooldowns = guildInfo.commandCooldowns || {}

    let update = false;
    for (const command of Object.keys(commandCooldowns)) {
        if (!commandCooldowns[command][role.id]) continue

        update = true
        delete commandCooldowns[command][role.id]

        if (Object.keys(commandCooldowns[command]).length === 0) delete commandCooldowns[command]
    }

    if (!update) return

    await client.DBGuild.findByIdAndUpdate(role.guild.id, { $set: { commandCooldowns: commandCooldowns } }, { new: true, upsert: true, setDefaultsOnInsert: true })

    guildInfo.commandCooldowns = commandCooldowns
    client.guildInfoCache.set(role.guild.id, guildInfo)
}