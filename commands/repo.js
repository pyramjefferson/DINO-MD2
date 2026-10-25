module.exports = async (sock, m, args) => {
    const repoText = `╭━━━〔 🤖 *DINO-MD REPOSITORY* 〕━━━⬣
┃ 🤖 *Bot Name:* DINO-MD
┃ 👑 *Owner:* MisterDev
┃ 📦 *GitHub:* owner a poko mete mete repo 
╰━━━━━━━━━━━━━━━━━━━━⬣`;

    const channelInfo = {
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363413121615710@newsletter',
                newsletterName: 'DINO-MD',
                serverMessageId: -1
            }
        }
    };

    await sock.sendMessage(m.key.remoteJid, {
        image: { url: "https://files.catbox.moe/y7y8od.jpg" },
        caption: repoText,
        ...channelInfo
    }, { quoted: m });
};
