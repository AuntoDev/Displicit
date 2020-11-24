var config = require("./config.json");
var websites = require("./websites.json");
var Discord = require("discord.js");
var client = new Discord.Client();
var axios = require("axios");
var tf = require("@tensorflow/tfjs-node");
var nsfw = require("nsfwjs");
var enmap = require("enmap");
var uniqid = require("uniqid");
var { fork } = require('child_process');
var os = require("os");
var ms = require('ms');

tf.enableProdMode();
client.owner = "534479985855954965";

client.settings = new enmap({
    name: 'settings',
    fetchAll: true,
    autoFetch: true,
    cloneLevel: 'deep'
});

client.violations = new enmap({
    name: 'violations',
    fetchAll: true,
    autoFetch: true,
    cloneLevel: 'deep'
});

client.settings.default = {
    enabled: {
        images: false,
        websites: false
    },
    checks: {
        images: {
            explicit: true,
            porn: true,
            hentai: true
        },
        websites: {
            porn: true,
            cam: true,
            inappropriate: false,
            illegal: true,
            dating: false,
            gambling: false
        }
    },
    punishments: {
        images: {
            low: null,
            medium: null,
            high: 3
        },
        websites: 0
    },
    usage: {
        images: 0,
        websites: 0,
        resets: null
    },
    announce: true,
    combine: true,
    log: null,
    prefix: "d."
};

setInterval(async() => {
    console.log(tf.memory().numTensors + " tensors running in memory");
}, 10000);

setTimeout(async() => {
    console.warn('RESTARTING CLIENT');
    process.exit();
}, ms('3h'));

console.info('Client will restart in 3 hours.');

client.on("ready", async() => {
    console.log("Connected.");
    client.user.setActivity("for NSFW content", { type: "WATCHING" });
});

client.on("message", async(msg) => {
    if(msg.author.bot || !msg.guild) return;

    var settings = client.settings.ensure(msg.guild.id, client.settings.default);
    var prefix = settings.prefix.toLowerCase();
    var flag = false;

    if(settings.enabled.images && !msg.channel.nsfw){
        var quota = await add("get", msg.guild);

        if(quota.images < 20000){
            msg.attachments.forEach(async(a) => {
                if(!a.name.endsWith(".png") && !a.name.endsWith(".jpg") && !a.name.endsWith(".gif")) return;
        
                console.log(`Before: ${Math.round(os.totalmem()/1048576)-Math.round(os.freemem()/1048576)}MB`);

                var forked = fork('./compute.js');
                forked.send({ url: a.proxyURL });

                forked.on('message', async out => {
                    console.log(`After: ${Math.round(os.totalmem()/1048576)-Math.round(os.freemem()/1048576)}MB`);

                    console.log(out);
                    if(out.err) return;
        
                    var res = order(out, a.proxyURL);

                    var added = res.list.sexy.pr+res.list.porn.pr+res.list.hentai.pr;
                    add("image", msg.guild);
            
                    if(!flag){
                        if((settings.combine || true) && added >= 0.9){
                            flag = true;
        
                            res.highest.pr = added;
                            if(res.highest.pr > 100) res.highest.pr = 100;

                            if (!msg.member.hasPermission('MANAGE_MESSAGES')) return punish(msg.author, msg, msg.guild, res, a.proxyURL);
                            msg.delete();
                        } else
                        if(res.explicit){
                            flag = true;
                            if (!msg.member.hasPermission('MANAGE_MESSAGES')) return punish(msg.author, msg, msg.guild, res, a.proxyURL);
                            msg.delete();
                        }
                    }
                });
            });
        }
    }

    if(settings.enabled.websites){
        var content = msg.content;

        if(content){
            content = content.toLowerCase();
        } else return;

        if(settings.checks.websites.porn && websites.porn.some(w => content.includes(w))) return block("explicit");
        if(settings.checks.websites.cam && websites.cam.some(w => content.includes(w))) return block("cams");
        if(settings.checks.websites.inappropriate && websites.inappropriate.some(w => content.includes(w))) return block("inappropriate");
        if(settings.checks.websites.illegal && websites.illegal.some(w => content.includes(w))) return block("illegal");
        if(settings.checks.websites.dating && websites.dating.some(w => content.includes(w))) return block("dating");
        if(settings.checks.websites.gambling && websites.gambling.some(w => content.includes(w))) return block("gambling");

        async function block(type){
            if(msg.member.hasPermission("MANAGE_MESSAGES") && msg.guild.id != "623599247488581662") return;

            add("website", msg.guild);

            msg.delete();
            msg.reply("that website URL is not allowed in this server. [`" + type.toUpperCase() + "`]");
        }
    }

    var args = msg.content.split(" ");
    if(msg.content.toLowerCase().indexOf(prefix) != 0) return;

    var cmd = args.shift().slice(prefix.length).toLowerCase();
    console.log(msg.author.tag + ": " + cmd);

    if(cmd == "ping"){
        msg.channel.send(client.ws.ping + "ms");
    } else
    if(cmd == "help"){
        var embed = new Discord.MessageEmbed()
        .setTitle("Displicit")
        .setDescription(`Displicit allows you to prevent users from sending NSFW images easily. Displicit's detection is powered by advanced artificial intelligence and has a low false positive rate.\n\n**${settings.prefix}help** View this embed again.\n**${settings.prefix}settings** Change Displicit's settings.\n**${settings.prefix}classify** Manually request classification for the attached image.\n**${settings.prefix}support** Stuck? Use this to get support information.\n**${settings.prefix}raw** View this server's raw database entry. Useful for support requests.\n**${settings.prefix}api** Access the API information and token for this Discord account.`)
        .setColor("#ffabf4")
        msg.channel.send(embed);
    } else
    if(cmd == "raw"){
        if(!msg.member.hasPermission("ADMINISTRATOR")) return msg.channel.send("You need the **Administrator** permission to access this command.");
        msg.channel.send(`Database entry found!\n**Key:** ${msg.guild.id}\n**Size:** ${JSON.stringify(settings).length} bytes\n**Access:** ${parseInt(msg.guild.id)+Date.now()}`);
    } else
    if(cmd == "usage"){
        var embed = new Discord.MessageEmbed()
        .setDescription("**Images:** " + settings.usage.images + "/20,000 uses per month\n**Websites:** " + settings.usage.websites + "/∞ uses per month")
        .setColor("#ffabf4")
        msg.channel.send(embed);
    } else
    if(cmd == "classify"){
        if (!msg.channel.nsfw) {
            msg.delete();
            return msg.channel.send('Please mark this channel as NSFW and try again.');
        };

        var quota = await add("get", msg.guild);
        if(settings.usage.images >= 20000) return msg.channel.send("This server has reached it's classification limit of 20,000/mo. Please contact support using `d.support` to request a higher quota.");

        var img = msg.attachments.first();
        if (!img) return msg.channel.send('Please attach an image!');
        if(!img.name.endsWith(".png") && !img.name.endsWith(".jpg") && !img.name.endsWith(".gif")) return msg.channel.send("Supported image types: `PNG`, `JPG`, `GIF`");

        var embed = new Discord.MessageEmbed()
        .setDescription("Spawning child process...")
        .setColor("#ffabf4")
        var m = await msg.channel.send(embed);

        console.log(`Before: ${Math.round(os.totalmem()/1048576)-Math.round(os.freemem()/1048576)}MB`);

        var forked = fork('./compute.js');
        forked.send({ url: img.url });

        embed.setDescription("Waiting for child process...");
        embed.setColor("#ffabf4");
        await m.edit(embed);

        forked.on('message', async out => {
            console.log(out);
            if(out.err) return m.edit("Classification failed. Are you sure you're providing a valid image URL?", { embed: null });

            var res = order(out, img.url);
            var added = res.list.sexy.pr+res.list.porn.pr+res.list.hentai.pr;

            if(added >= 0.8){
                embed.setAuthor("Explicit content detected", client.user.displayAvatarURL());
                embed.setDescription("Detected as **" + res.highest.name + "** with a trust score of **" + Math.round(res.highest.pr*100) + "%** (**" + Math.round(added*100) + "%** combined).");
                embed.setColor("#ff4a4a");
            } else
            if(added >= 0.65){
                embed.setAuthor("Possibly explicit", client.user.displayAvatarURL());
                embed.setDescription("Displicit's AI isn't sure about this image. Human review is recommended.");
                embed.addField("Explicit:", res.list.sexy.pr*100 + "%");
                embed.addField("Pornography:", res.list.porn.pr*100 + "%");
                embed.addField("Hentai:", res.list.hentai.pr*100 + "%");
                embed.setColor("#ff8f3b");
            } else
            if(added >= 0.3){
                embed.setAuthor("Unusually high score", client.user.displayAvatarURL());
                embed.setDescription("Displicit's AI isn't sure about this image. It is most likely not explicit.");
                embed.addField("Explicit:", res.list.sexy.pr*100 + "%");
                embed.addField("Pornography:", res.list.porn.pr*100 + "%");
                embed.addField("Hentai:", res.list.hentai.pr*100 + "%");
                embed.setColor("#ffde3b");
            } else {
                embed.setAuthor("No issues found", client.user.displayAvatarURL());
                embed.setDescription("Displicit's AI found no issues with this image.");
                embed.addField("Explicit:", res.list.sexy.pr*100 + "%");
                embed.addField("Pornography:", res.list.porn.pr*100 + "%");
                embed.addField("Hentai:", res.list.hentai.pr*100 + "%");
                embed.setColor("#78ff66");
            }
    
            add("image", msg.guild);
            m.edit(embed);

            console.log(`After: ${Math.round(os.totalmem()/1048576)-Math.round(os.freemem()/1048576)}MB`);
        });
    } else
    if(cmd == "support"){
        msg.channel.send("Stuck? Contact Aunto Development Group in our Discord (https://discord.gg/VvQXgPB). If you think one of our services is down, check https://status.aunto.xyz before reporting it.");
    } else
    if(cmd == "api"){
        var embed = new Discord.MessageEmbed()
        .setTitle("Displicit API")
        .setDescription("The Displicit API is currently invite-only. If you've been invited by a developer or an Aunto Development Group partner, run `" + prefix + "api [invite-key]`. Invite keys are normally single-use and expire 24 hours after being created.")
        .setColor("#ffabf4");

        if(!args[0]) return msg.channel.send(embed);
        
        embed.setDescription("The key you provided is invalid or has expired.");
        embed.setColor("#ff4a4a");
        msg.channel.send(embed);
    } else
    if(cmd == "settings"){
        if(!msg.member.hasPermission("ADMINISTRATOR") && msg.author.id != client.owner) return msg.channel.send("You need the **Administrator** permission to access this command.");

        var sub = args[0];
        var sub1 = args[1];
        var sub2 = args[2];
        if(sub) sub = sub.toLowerCase();
        if(sub1) sub1 = sub1.toLowerCase();
        if(sub2) sub2 = sub2.toLowerCase();

        if(!sub){
            return menu(0);
        } else
        if(sub == "images"){
            if(!sub1){
                return menu(1);
            } else
            if(sub1 == "toggle"){
                if(!msg.guild.me.hasPermission("ADMINISTRATOR")) msg.channel.send("Displicit works best when it has the Administrator permission.");

                if(settings.enabled.images){
                    client.settings.set(msg.guild.id, false, "enabled.images");
                } else client.settings.set(msg.guild.id, true, "enabled.images");
            } else
            if(sub1 == "explicit"){
                if(settings.checks.images.explicit){
                    client.settings.set(msg.guild.id, false, "checks.images.explicit");
                } else client.settings.set(msg.guild.id, true, "checks.images.explicit");
            } else
            if(sub1 == "porn"){
                if(settings.checks.images.porn){
                    client.settings.set(msg.guild.id, false, "checks.images.porn");
                } else client.settings.set(msg.guild.id, true, "checks.images.porn");
            } else
            if(sub1 == "hentai"){
                if(settings.checks.images.hentai){
                    client.settings.set(msg.guild.id, false, "checks.images.hentai");
                } else client.settings.set(msg.guild.id, true, "checks.images.hentai");
            } else
            if(sub1 == "low"){
                if(!sub2){
                    return menu(1);
                } else
                if(sub2 == "off" || sub2 == "warn" || sub2 == "mute" || sub2 == "kick" || sub2 == "ban"){
                    if(sub2 == "off"){
                        client.settings.set(msg.guild.id, false, "punishments.images.low");
                    } else 
                    if(sub2 == "warn"){
                        client.settings.set(msg.guild.id, 0, "punishments.images.low");
                    } else 
                    if(sub2 == "mute"){
                        client.settings.set(msg.guild.id, 1, "punishments.images.low");
                    } else 
                    if(sub2 == "kick"){
                        client.settings.set(msg.guild.id, 2, "punishments.images.low");
                    } else 
                    if(sub2 == "ban"){
                        client.settings.set(msg.guild.id, 3, "punishments.images.low");
                    } else return menu(1);
                } else return menu(1);
            } else
            if(sub1 == "medium"){
                if(!sub2){
                    return menu(1);
                } else
                if(sub2 == "off" || sub2 == "warn" || sub2 == "mute" || sub2 == "kick" || sub2 == "ban"){
                    if(sub2 == "off"){
                        client.settings.set(msg.guild.id, false, "punishments.images.medium");
                    } else 
                    if(sub2 == "warn"){
                        client.settings.set(msg.guild.id, 0, "punishments.images.medium");
                    } else 
                    if(sub2 == "mute"){
                        client.settings.set(msg.guild.id, 1, "punishments.images.medium");
                    } else 
                    if(sub2 == "kick"){
                        client.settings.set(msg.guild.id, 2, "punishments.images.medium");
                    } else 
                    if(sub2 == "ban"){
                        client.settings.set(msg.guild.id, 3, "punishments.images.medium");
                    } else return menu(1);
                } else return menu(1);
            } else
            if(sub1 == "high"){
                if(!sub2){
                    return menu(1);
                } else
                if(sub2 == "off" || sub2 == "warn" || sub2 == "mute" || sub2 == "kick" || sub2 == "ban"){
                    if(sub2 == "off"){
                        client.settings.set(msg.guild.id, false, "punishments.images.high");
                    } else 
                    if(sub2 == "warn"){
                        client.settings.set(msg.guild.id, 0, "punishments.images.high");
                    } else 
                    if(sub2 == "mute"){
                        client.settings.set(msg.guild.id, 1, "punishments.images.high");
                    } else 
                    if(sub2 == "kick"){
                        client.settings.set(msg.guild.id, 2, "punishments.images.high");
                    } else 
                    if(sub2 == "ban"){
                        client.settings.set(msg.guild.id, 3, "punishments.images.high");
                    } else return menu(1);
                } else return menu(1);
            } else
            if(sub1 == "combining"){
                if(settings.combine){
                    client.settings.set(msg.guild.id, false, "combine");
                } else client.settings.set(msg.guild.id, true, "combine");
            } else return menu(1);
        } else
        if(sub == "websites"){
            if(!sub1){
                return menu(2);
            } else
            if(sub1 == "toggle"){
                if(settings.enabled.websites){
                    client.settings.set(msg.guild.id, false, "enabled.websites");
                } else client.settings.set(msg.guild.id, true, "enabled.websites");
            } else
            if(sub1 == "porn"){
                if(settings.checks.websites.porn){
                    client.settings.set(msg.guild.id, false, "checks.websites.porn");
                } else client.settings.set(msg.guild.id, true, "checks.websites.porn");
            } else
            if(sub1 == "cams"){
                if(settings.checks.websites.cams){
                    client.settings.set(msg.guild.id, false, "checks.websites.cam");
                } else client.settings.set(msg.guild.id, true, "checks.websites.cam");
            } else
            if(sub1 == "inappropriate"){
                if(settings.checks.websites.inappropriate){
                    client.settings.set(msg.guild.id, false, "checks.websites.inappropriate");
                } else client.settings.set(msg.guild.id, true, "checks.websites.inappropriate");
            } else
            if(sub1 == "illegal"){
                if(settings.checks.websites.illegal){
                    client.settings.set(msg.guild.id, false, "checks.websites.illegal");
                } else client.settings.set(msg.guild.id, true, "checks.websites.illegal");
            } else
            if(sub1 == "dating"){
                if(settings.checks.websites.dating){
                    client.settings.set(msg.guild.id, false, "checks.websites.dating");
                } else client.settings.set(msg.guild.id, true, "checks.websites.dating");
            } else
            if(sub1 == "gambling"){
                if(settings.checks.websites.gambling){
                    client.settings.set(msg.guild.id, false, "checks.websites.gambling");
                } else client.settings.set(msg.guild.id, true, "checks.websites.gambling");
            } else
            if(sub1 == "punish"){
                if(sub2 == "warn"){
                    client.settings.set(msg.guild.id, 0, "punishments.websites");
                } else 
                if(sub2 == "mute"){
                    client.settings.set(msg.guild.id, 1, "punishments.websites");
                } else 
                if(sub2 == "kick"){
                    client.settings.set(msg.guild.id, 2, "punishments.websites");
                } else 
                if(sub2 == "ban"){
                    client.settings.set(msg.guild.id, 3, "punishments.websites");
                } else return menu(2);
            } else return menu(2);
        } else return menu(0);

        msg.channel.send("Your change has been saved.");

        async function menu(num){
            var embed = new Discord.MessageEmbed()
            .setTitle("Displicit")
            .setColor("#ffabf4");

            if(num == 0){
                embed.setDescription("Want to set a new prefix for this server? Use `" + prefix + "settings prefix [new_prefix]`.");
                embed.addField("Images", "Filter potentially explicit images using advanced artificial intelligence.\n`" + prefix + "settings images`", true);
                embed.addField("Websites", "Help prevent NSFW and illegal websites from being posted in chats.\n`" + prefix + "settings websites`", true);
            } else
            if(num == 1){
                embed.setDescription("Image filtering is currently **enabled**. Toggle it using `" + prefix + "settings images toggle`.");
                if(!settings.enabled.images) embed.setDescription("Image filtering is currently __**DISABLED**__. Toggle it using `" + prefix + "settings images toggle`.");
                
                embed.addField("Explicit", "Displicit **" + booleanToWords(settings.checks.images.explicit) + "** watching out for explicit content.\n`" + prefix + "settings images explicit`", true);
                embed.addField("Pornography", "Displicit **" + booleanToWords(settings.checks.images.porn) + "** watching out for pornography.\n`" + prefix + "settings images porn`", true);
                embed.addField("Hentai", "Displicit **" + booleanToWords(settings.checks.images.hentai) + "** watching out for hentai and illustrated pornography.\n`" + prefix + "settings images hentai`", true);
                embed.addField("Low punishment", "When our AI's prediction is 80% or higher, **" + defPunish(settings.punishments.images.low) + "**.\n`" + prefix + "settings images low [off/warn/mute/kick/ban]`");
                embed.addField("Medium punishment", "When our AI's prediction is 90% or higher, **" + defPunish(settings.punishments.images.medium) + "**.\n`" + prefix + "settings images medium [off/warn/mute/kick/ban]`");
                embed.addField("High punishment", "When our AI's prediction is 95% or higher, **" + defPunish(settings.punishments.images.high) + "**.\n`" + prefix + "settings images high [off/warn/mute/kick/ban]`");
                embed.addField("Score combining", "Displicit **" + booleanToWords(settings.combine) + "** combining scores. This makes Displicit more sensitive whilst not raising false positives that much.\n`" + prefix + "settings images combining`");
            } else
            if(num == 2){
                embed.setDescription("Website scanning is currently **enabled**. Toggle it using `" + prefix + "settings websites toggle`.");
                if(!settings.enabled.websites) embed.setDescription("Website scanning is currently __**DISABLED**__. Toggle it using `" + prefix + "settings websites toggle`.");

                embed.addField("Pornography", "Displicit **" + booleanToWords(settings.checks.websites.porn) + "** watching out for pornographic websites.\n`" + prefix + "settings websites porn`", true);
                embed.addField("Cameras", "Displicit **" + booleanToWords(settings.checks.websites.cam) + "** watching out for pornographic \"cam streaming\" websites.\n`" + prefix + "settings websites cams`", true);
                embed.addField("Inappropriate", "Displicit **" + booleanToWords(settings.checks.websites.inappropriate) + "** watching out for inappropriate websites.\n`" + prefix + "settings websites inappropriate`", true);
                embed.addField("Illegal", "Displicit **" + booleanToWords(settings.checks.websites.illegal) + "** watching out for illegal websites.\n`" + prefix + "settings websites illegal`", true);
                embed.addField("Dating", "Displicit **" + booleanToWords(settings.checks.websites.dating) + "** watching out for dating websites.\n`" + prefix + "settings websites dating`", true);
                embed.addField("Gambling", "Displicit **" + booleanToWords(settings.checks.websites.gambling) + "** watching out for gambling websites.\n`" + prefix + "settings websites gambling`", true);
                embed.addField("Punishment", "__Currently, Displicit only deletes the message and tells the user not to post explicit links. This will be changed soon.__\n\nWhen a user trips one of the website filters, Displicit will **" + defPunish(settings.punishments.websites) + "**.\n`" + prefix + "settings websites punish [warn/mute/kick/ban]`");
            }

            msg.channel.send(embed);
        }
    } else
    if(cmd == "eval"){
        if(msg.author.id != client.owner) return;

        try {
            var evaled = eval(args.join(" "));

            if(typeof evaled !== "string");
            evaled = require("util").inspect(evaled);
            msg.channel.send("```\n" + evaled + "\n```");
        } catch(err) {
            msg.channel.send("```\n" + err + "\n```");
        }
    }
});

function booleanToWords(input){
    if(input === true) return "is";
    return "is not";
}

function defPunish(num){
    if(num == 0) return "warn the user";
    if(num == 1) return "mute the user";
    if(num == 2) return "kick the user from the server";
    if(num == 3) return "ban the user";
    return "do nothing";
}

async function punish(user, msg, guild, res, url){
    var settings = client.settings.ensure(guild.id, client.settings.default);
    var pr = Math.round(res.highest.pr*100);

    if(!settings.checks.images.explicit && res.highest.name == "explicit") return;
    if(!settings.checks.images.porn && res.highest.name == "pornography") return;
    if(!settings.checks.images.hentai && res.highest.name == "hentai") return;
    if(msg.member.hasPermission("MANAGE_MESSAGES")) return;

    if(pr >= 80 && !isNaN(settings.punishments.images.low)){
        punishment(msg, "low", res.highest, url);
        return;
    }

    if(pr >= 90 && !isNaN(settings.punishments.images.medium)){
        punishment(msg, "medium", res.highest, url);
        return;
    }

    if(pr >= 95 && !isNaN(settings.punishments.images.high)){
        punishment(msg, "high", res.highest, url);
        return;
    }
}

async function punishment(msg, check, res, url){
    var settings = client.settings.ensure(msg.guild.id, client.settings.default);
    var user = msg.author;
    var guild = msg.guild;
    var num = 0;

    if(check == "low") num = settings.punishments.images.low;
    if(check == "medium") num = settings.punishments.images.medium;
    if(check == "high") num = settings.punishments.images.high;

    if(num != null) msg.delete();

    if(num == 0){
        var id = await save(user, guild, url, res, msg.channel, "warn");

        var embed = new Discord.MessageEmbed()
        .setAuthor("Do not post NSFW content!", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("**" + guild.name + "** uses Displicit to prevent users from posting NSFW images. The image you recently sent there was flagged automatically by our AI. If you believe this is a mistake, [reach out to Aunto Development Group](https://auntodevelopmentgroup.xyz).")
        .setFooter(id + " | Aunto Development Group | auntodevelopmentgroup.xyz")
        .setColor("#ff4a4a");
        user.send(embed);

        var warn = new Discord.MessageEmbed()
        .setAuthor("Explicit content removed", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("Content that was posted by **" + user.tag + "** was deemed explicit by our AI. The message has been removed and the user warned. Remember that posting NSFW content in non-gated channels is against [Discord's Community Guidelines](https://discord.com/guidelines).")
        .setColor("#ff4a4a")
        if(settings.announce) msg.channel.send(warn);

        log(guild, user, res.name, msg.channel, url, "warned", id);
    } else
    if(num == 1){
        var id = await save(user, guild, url, res, msg.channel, "mute");
        var role = guild.roles.cache.find(r => r.name.toLowerCase() == "muted");

        if(role){
            msg.member.roles.add(role);

            var embed = new Discord.MessageEmbed()
            .setAuthor("Muted: Do not post NSFW content!", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
            .setDescription("**" + guild.name + "** uses Displicit to prevent users from posting NSFW images. The image you recently sent there was flagged automatically by our AI, you've been muted because of that. Contact the server's moderation team to appeal. If you believe this is a mistake, [reach out to Aunto Development Group](https://auntodevelopmentgroup.xyz).")
            .setFooter(id + " | Aunto Development Group | auntodevelopmentgroup.xyz")
            .setColor("#ff4a4a")
            user.send(embed);
    
            var mute = new Discord.MessageEmbed()
            .setAuthor("Explicit content removed", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
            .setDescription("Content that was posted by **" + user.tag + "** was deemed explicit by our AI. The message has been removed and the user muted. Remember that posting NSFW content in non-gated channels is against [Discord's Community Guidelines](https://discord.com/guidelines).")
            .setColor("#ff4a4a")
            if(settings.announce) msg.channel.send(mute);

            log(guild, user, res.name, msg.channel, url, "muted", id);
        }
    } else
    if(num == 2){
        var id = await save(user, guild, url, res, msg.channel, "kick");

        var embed = new Discord.MessageEmbed()
        .setAuthor("Kicked: Do not post NSFW content!", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("**" + guild.name + "** uses Displicit to prevent users from posting NSFW images. The image you recently sent there was flagged automatically by our AI, you've been kicked from the server because of that. If you believe this is a mistake, [reach out to Aunto Development Group](https://auntodevelopmentgroup.xyz).")
        .setFooter(id + " | Aunto Development Group | auntodevelopmentgroup.xyz")
        .setColor("#ff4a4a");

        try {
            await user.send(embed);
        } catch(err) {
            return;
        }

        try {
            await msg.member.kick("Displicit detected NSFW content sent in " + msg.channel.name + "  -  Score: " + Math.round(res.pr*100) + "% | Check: " + res.name);
        } catch(err) {
            console.warn(err);
            return;
        }

        var kick = new Discord.MessageEmbed()
        .setAuthor("Explicit content removed", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("Content that was posted by **" + user.tag + "** was deemed explicit by our AI. The message has been removed and the user kicked. Remember that posting NSFW content in non-gated channels is against [Discord's Community Guidelines](https://discord.com/guidelines).")
        .setColor("#ff4a4a")
        if(settings.announce) msg.channel.send(kick);

        log(guild, user, res.name, msg.channel, url, "kicked", id);
    } else
    if(num == 3){
        var id = await save(user, guild, url, res, msg.channel, "ban");

        var embed = new Discord.MessageEmbed()
        .setAuthor("Banned: Do not post NSFW content!", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("**" + guild.name + "** uses Displicit to prevent users from posting NSFW images. The image you recently sent there was flagged automatically by our AI, you've been __banned__ from the server because of that. If you believe this is a mistake, [reach out to Aunto Development Group](https://auntodevelopmentgroup.xyz).")
        .setFooter(id + " | Aunto Development Group | auntodevelopmentgroup.xyz")
        .setColor("#ff4a4a");

        try {
            await user.send(embed);
        } catch(err) {
            return;
        }

        try {
            await msg.member.ban("Displicit detected NSFW content sent in " + msg.channel.name + "  -  Score: " + Math.round(res.pr*100) + "% | Check: " + res.name);
        } catch(err) {
            console.warn(err);
            return;
        }

        var ban = new Discord.MessageEmbed()
        .setAuthor("Explicit content removed", "https://media.discordapp.net/attachments/707582968146821147/734496248026890320/icon-removebg-preview.png")
        .setDescription("Content that was posted by **" + user.tag + "** was deemed explicit by our AI. The message has been removed and the user banned. Remember that posting NSFW content in non-gated channels is against [Discord's Community Guidelines](https://discord.com/guidelines).")
        .setColor("#ff4a4a")
        if(settings.announce) msg.channel.send(ban);

        log(guild, user, res.name, msg.channel, url, "banned", id);
    }
}

async function log(guild, user, check, channel, img, action, id){
    var settings = client.settings.ensure(guild.id, client.settings.default);
    if(!settings.log) return;

    var logs = guild.channels.cache.get(settings.log);
    if(!logs) return client.settings.set(guild.id, "log", null);

    if(!logs.nsfw){
        try {
            await logs.setNSFW(true);
        } catch(err) {
            return logs.send("**Can't log to this channel:** This channel must be set as NSFW! I attempted to set this channel as NSFW but failed.");
        }
    }

    var embed = new Discord.MessageEmbed()
    .setAuthor(user.tag + " " + action, user.displayAvatarURL())
    .setDescription(channel.name + " [`" + id + "`:`" + check + "`]: " + img)
    .setColor("#ffabf4")
    logs.send(embed);
}

async function save(user, guild, url, res, channel, action){
    var id = uniqid();

    client.violations.set(id, {
        id: id,
        user: user.id,
        guild: guild.id,
        channel: channel.id,
        action: action,
        url: url,
        res: res
    });

    return id;
}

async function evaluate(url){
    console.log("Evaluating " + url);

    var res = await classify(url);
    var evaluated = { explicit: false, highest: {}, list: { sexy: res.sexy, porn: res.porn, hentai: res.hentai } };

    evaluated.highest = { name: "hentai", pr: res.hentai.pr };
    if(evaluated.highest.pr < res.porn.pr) evaluated.highest = res.porn;
    if(evaluated.highest.pr < res.sexy.pr) evaluated.highest = res.sexy;
    if(evaluated.highest.pr >= 0.8) evaluated.explicit = true;

    console.log("Score for " + url + ": " + evaluated.highest.name + " " + Math.round(evaluated.highest.pr*100) + "%");
    return evaluated;
}

function order(res, url){
    var evaluated = { explicit: false, highest: {}, list: { sexy: res.sexy, porn: res.porn, hentai: res.hentai } };

    evaluated.highest = { name: "hentai", pr: res.hentai.pr };
    if(evaluated.highest.pr < res.porn.pr) evaluated.highest = res.porn;
    if(evaluated.highest.pr < res.sexy.pr) evaluated.highest = res.sexy;
    if(evaluated.highest.pr >= 0.8) evaluated.explicit = true;

    console.log("Score for " + url + ": " + evaluated.highest.name + " " + Math.round(evaluated.highest.pr*100) + "%");
    return evaluated;
}

async function classify(url){
    if(!url) return null;

    var res = await axios.get(url, {
        responseType: "arraybuffer"
    });

    if(!res || !res.data) return null;

    tf.engine().startScope();

    var model = await nsfw.load("file://model/", { size: 299 });
    var img = await tf.node.decodeImage(res.data, 3);
    var classes = await model.classify(img);

    img.dispose();

    var reviewed = {
        sexy: {},
        porn: {},
        hentai: {}
    };

    classes.forEach(async(c) => {
        if(c.className == "Sexy") reviewed.sexy = { name: "explicit", pr: c.probability };
        if(c.className == "Porn") reviewed.porn = { name: "pornography", pr: c.probability };
        if(c.className == "Hentai") reviewed.hentai = { name: "hentai", pr: c.probability };
    });

    tf.dispose(model);
    tf.dispose(classes);
    tf.dispose(img);
    tf.disposeVariables();
    tf.engine().endScope();

    return reviewed;
};

async function add(type, guild){
    var settings = client.settings.ensure(guild.id, client.settings.default);

    if(!settings.usage || Date.now() <= settings.usage.reset){
        client.settings.set(guild.id, { images: 0, websites: 0, resets: Date.now() }, "usage");
        return true;
    }

    if(!settings.usage.resets) client.settings.set(guild.id, Date.now(), "usage.resets");

    if(type == "image"){
        client.settings.set(guild.id, parseInt(settings.usage.images)+1, "usage.images");
    } else
    if(type == "website"){
        client.settings.set(guild.id, parseInt(settings.usage.images)+1, "usage.websites");
    } else
    if(type == "get"){
        return client.settings.get(guild.id).usage;
    } else return false;

    return true;
}

client.login(config.token);
