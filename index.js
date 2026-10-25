const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const http = require("http");
const path = require("path");
const settings = require("./settings");

// ======================================================
// DINO-MD UPTIME SERVER
// ======================================================

const startServer = (port) => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            "Content-Type": "text/plain"
        });

        res.end("DINO-MD IS ONLINE");
    });

    server.listen(port, () => {
        console.log(`🌐 DINO-MD server running on port ${port}`);
    });

    server.on("error", (e) => {
        if (e.code === "EADDRINUSE") {
            console.log(`⚠️ Port ${port} busy, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error("Server Error:", e);
        }
    });
};

startServer(process.env.PORT || 3000);

// ======================================================
// DATABASE
// ======================================================

const dbPath = path.join(__dirname, "database.json");

if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(
        dbPath,
        JSON.stringify({
            antilink: [],
            autoreact: false,
            autoread: false,
            mode: "public"
        }, null, 2)
    );
}

// ======================================================
// LOAD COMMANDS
// ======================================================

const commands = {};
const commandsPath = path.join(__dirname, "commands");

function loadCommands() {

    if (!fs.existsSync(commandsPath)) {
        fs.mkdirSync(commandsPath, {
            recursive: true
        });

        console.log("⚠️ commands folder created.");
        return;
    }

    const files = fs
        .readdirSync(commandsPath)
        .filter(file => file.endsWith(".js"));

    for (const file of files) {

        const commandName = path
            .basename(file, ".js")
            .toLowerCase();

        const filePath = path.join(commandsPath, file);

        try {

            // Clear require cache
            delete require.cache[require.resolve(filePath)];

            const command = require(filePath);

            if (typeof command !== "function") {
                console.error(
                    `❌ Command ${file} does not export a function.`
                );
                continue;
            }

            commands[commandName] = command;

        } catch (error) {

            console.error(`\n❌ Failed to load command: ${file}`);
            console.error(`➡️ Error: ${error.message}`);

            if (error.stack) {
                console.error(error.stack);
            }

            console.error("");
        }
    }

    console.log(
        `📦 Commands loaded successfully: ${Object.keys(commands).length}\n`
    );
}

loadCommands();

// ======================================================
// START BOT
// ======================================================

async function startBot() {

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState("session");

    const {
        version
    } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({
            level: "silent"
        }),
        auth: state,
        browser: [
            "Ubuntu",
            "Chrome",
            "20.0.04"
        ],
        printQRInTerminal: false
    });

    // ==================================================
    // PAIRING CODE
    // ==================================================

    if (!sock.authState.creds.registered) {

        const ownerPhone =
            settings.ownerNumber
                .replace(/[^0-9]/g, "");

        console.log(
            `\n🔄 Requesting pairing code for: ${ownerPhone}...`
        );

        setTimeout(async () => {

            try {

                let code =
                    await sock.requestPairingCode(ownerPhone);

                code =
                    code?.match(/.{1,4}/g)?.join("-") ||
                    code;

                console.log(
                    `\n✅ YOUR PAIRING CODE: ${code}\n`
                );

            } catch (err) {

                console.log(
                    "❌ Pairing Error:",
                    err.message
                );
            }

        }, 5000);
    }

    // ==================================================
    // SAVE CREDENTIALS
    // ==================================================

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    // ==================================================
    // AUTO STATUS VIEW + REACTION
    // ==================================================

    sock.ev.on(
        "messages.upsert",
        async (chatUpdate) => {

            try {

                const m =
                    chatUpdate.messages?.[0];

                if (!m || !m.message) return;

                if (
                    m.key.remoteJid !==
                    "status@broadcast"
                ) {
                    return;
                }

                const emojis = [
                    "💚",
                    "🔥",
                    "✨",
                    "🙌",
                    "💯",
                    "👑",
                    "🚀",
                    "😍",
                    "⚡",
                    "💎"
                ];

                const randomEmoji =
                    emojis[
                        Math.floor(
                            Math.random() *
                            emojis.length
                        )
                    ];

                const participant =
                    m.key.participant ||
                    m.participant;

                if (!participant) return;

                // View status
                await sock.readMessages([
                    m.key
                ]);

                // React to status
                await sock.sendMessage(
                    "status@broadcast",
                    {
                        react: {
                            text: randomEmoji,
                            key: m.key
                        }
                    },
                    {
                        statusJidList: [
                            participant
                        ]
                    }
                );

            } catch (error) {

                console.error(
                    "Auto Status Error:",
                    error.message
                );
            }
        }
    );

    // ==================================================
    // CONNECTION UPDATE
    // ==================================================

    sock.ev.on(
        "connection.update",
        async (update) => {

            const {
                connection,
                lastDisconnect
            } = update;

            if (connection === "close") {

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                if (
                    statusCode !==
                    DisconnectReason.loggedOut
                ) {

                    console.log(
                        "🔄 Connection closed. Reconnecting..."
                    );

                    setTimeout(() => {
                        startBot();
                    }, 3000);

                } else {

                    console.log(
                        "❌ WhatsApp logged out."
                    );
                }

            } else if (connection === "open") {

                const ownerJid =
                    settings.ownerNumber
                        .replace(/[^0-9]/g, "") +
                    "@s.whatsapp.net";

                console.log(
                    "\n🎊 DINO-MD IS CONNECTED!"
                );

                const channelInfo = {
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid:
                                "120363413121615710@newsletter",
                            newsletterName:
                                "DINO-MD",
                            serverMessageId: -1
                        }
                    }
                };

                try {

                    await sock.sendMessage(
                        ownerJid,
                        {
                            image: {
                                url:
                                    "https://files.catbox.moe/y7y8od.jpg"
                            },

                            caption:
                                `╭━━━〔 🤖 *DINO-MD STATUS* 〕━━━⬣\n` +
                                `┃ ✨ *Bot:* Online & Ready!\n` +
                                `┃ 🚀 *Status:* Fully Connected\n` +
                                `┃ ⚡ *Mode:* Active\n` +
                                `┃ 📦 *Commands:* ${Object.keys(commands).length}\n` +
                                `╰━━━━━━━━━━━━━━━━━━━━⬣`,

                            ...channelInfo
                        }
                    );

                } catch (error) {

                    console.error(
                        "Owner notification error:",
                        error.message
                    );
                }
            }
        }
    );

    // ==================================================
    // MESSAGE HANDLER
    // ==================================================

    sock.ev.on(
        "messages.upsert",
        async ({
            messages,
            type
        }) => {

            try {

                if (type !== "notify") return;

                const m =
                    messages?.[0];

                if (!m || !m.message) return;

                const from =
                    m.key.remoteJid;

                if (
                    !from ||
                    from === "status@broadcast"
                ) {
                    return;
                }

                // ======================================
                // DATABASE READ FOR GLOBAL FEATURES
                // ======================================
                let globalDb = { antilink: [], autoreact: false, autoread: false, mode: "public" };
                if (fs.existsSync(dbPath)) {
                    try {
                        globalDb = JSON.parse(fs.readFileSync(dbPath, "utf8"));
                    } catch {
                        globalDb = { antilink: [], autoreact: false, autoread: false, mode: "public" };
                    }
                }

                // AUTOREAD FEATURE
                if (globalDb.autoread) {
                    try {
                        await sock.readMessages([m.key]);
                    } catch (e) {
                        console.error("AutoRead Error:", e.message);
                    }
                }

                // AUTOREACT FEATURE
                if (globalDb.autoreact) {
                    try {
                        const emojis = ["💚", "🔥", "✨", "🙌", "💯", "👑", "🚀", "😍", "⚡", "💎"];
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await sock.sendMessage(from, {
                            react: {
                                text: randomEmoji,
                                key: m.key
                            }
                        });
                    } catch (e) {
                        console.error("AutoReact Error:", e.message);
                    }
                }

                const isGroup =
                    from.endsWith("@g.us");

                const sender =
                    m.key.participant ||
                    m.key.remoteJid;

                // ======================================
                // MESSAGE BODY
                // ======================================

                const body =
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    m.message.imageMessage?.caption ||
                    m.message.videoMessage?.caption ||
                    m.message.documentMessage?.caption ||
                    "";

                if (!body) return;

                const prefix =
                    settings.prefix || ".";

                const ownerNumber =
                    settings.ownerNumber
                        .replace(/[^0-9]/g, "");

                const isOwner =
                    sender.includes(ownerNumber) ||
                    m.key.fromMe;

                // ======================================
                // MODE CHECK (PUBLIC / PRIVATE)
                // ======================================
                const botMode = globalDb.mode || "public";
                if (botMode === "private" && !isOwner) {
                    return; // Bloke tout lòt moun si l an Private epi se pa ou menm
                }

                // ======================================
                // ANTILINK
                // ======================================

                if (isGroup && body) {

                    let db = {
                        antilink: []
                    };

                    if (fs.existsSync(dbPath)) {

                        try {

                            db = JSON.parse(
                                fs.readFileSync(
                                    dbPath,
                                    "utf8"
                                )
                            );

                        } catch {

                            db = {
                                antilink: []
                            };
                        }
                    }

                    if (
                        Array.isArray(db.antilink) &&
                        db.antilink.includes(from)
                    ) {

                        const linkRegex =
                            /chat\.whatsapp\.com\/|https?:\/\//i;

                        if (
                            linkRegex.test(body)
                        ) {

                            try {

                                const metadata =
                                    await sock.groupMetadata(
                                        from
                                    );

                                const admins =
                                    metadata.participants
                                        .filter(
                                            p =>
                                                p.admin !== null
                                        )
                                        .map(
                                            p => p.id
                                        );

                                const botId =
                                    sock.user.id
                                        .split(":")[0] +
                                    "@s.whatsapp.net";

                                const isBotAdmin =
                                    admins.includes(
                                        botId
                                    );

                                const isSenderAdmin =
                                    admins.includes(
                                        sender
                                    );

                                if (
                                    !isSenderAdmin &&
                                    !isOwner &&
                                    isBotAdmin
                                ) {

                                    await sock.sendMessage(
                                        from,
                                        {
                                            delete:
                                                m.key
                                        }
                                    );

                                    await sock.sendMessage(
                                        from,
                                        {
                                            text:
                                                `🚫 *Link Detected!*\n\n` +
                                                `@${sender.split("@")[0]}, links are not allowed here!`,
                                            mentions: [
                                                sender
                                            ]
                                        }
                                    );
                                }

                            } catch (error) {

                                console.error(
                                    "AntiLink Error:",
                                    error.message
                                );
                            }
                        }
                    }
                }

                // ======================================
                // PREFIX CHECK
                // ======================================

                if (
                    !body.startsWith(prefix)
                ) {
                    return;
                }

                const input =
                    body
                        .slice(prefix.length)
                        .trim();

                if (!input) return;

                const parts =
                    input.split(/\s+/);

                const commandName =
                    parts.shift()
                        .toLowerCase();

                const args = parts;

                // ======================================
                // ANTILINK COMMAND
                // ======================================

                if (
                    commandName === "antilink"
                ) {

                    if (!isOwner) {

                        return await sock.sendMessage(
                            from,
                            {
                                text:
                                    "❌ *Access Denied:* Only the Bot Owner can use this command."
                            },
                            {
                                quoted: m
                            }
                        );
                    }

                    let db = {
                        antilink: []
                    };

                    try {

                        if (
                            fs.existsSync(dbPath)
                        ) {

                            db = JSON.parse(
                                fs.readFileSync(
                                    dbPath,
                                    "utf8"
                                )
                            );
                        }

                    } catch {

                        db = {
                            antilink: []
                        };
                    }

                    if (
                        !Array.isArray(
                            db.antilink
                        )
                    ) {

                        db.antilink = [];
                    }

                    if (
                        args[0] === "on"
                    ) {

                        if (
                            !db.antilink.includes(
                                from
                            )
                        ) {

                            db.antilink.push(
                      