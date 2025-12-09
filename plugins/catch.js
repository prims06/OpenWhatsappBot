const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

/**
 * Catch Plugin
 * Extract group members and export to Excel
 */

module.exports = {
    command: {
        pattern: "catch",
        desc: "Extract group members to Excel",
        type: "utility",
    },

    async execute(message, args) {
        try {
            await message.react("🔍");

            const sock = message.client.getSocket();
            const targetGroupName = args ? args.trim() : null;

            // Récupérer tous les groupes
            await message.reply("*🔄 Récupération des groupes en cours...*");
            const allGroups = await sock.groupFetchAllParticipating();
            const groupsArray = Object.values(allGroups);

            if (groupsArray.length === 0) {
                return await message.reply("*❌ Aucun groupe trouvé!*");
            }

            // Cas 1: Pas de paramètre ou "all" -> Exporter tous les groupes
            if (!targetGroupName || targetGroupName.toLowerCase() === "all") {
                await message.reply(
                    `*📊 Extraction de ${groupsArray.length} groupes...*\n⏳ Cela peut prendre quelques minutes.`
                );

                let processedCount = 0;

                for (const group of groupsArray) {
                    try {
                        // Créer un fichier pour chaque groupe
                        const fileName = await createGroupExcel(group);
                        const excelBuffer = fs.readFileSync(fileName);

                        // Envoyer le fichier
                        await message.sendDocument(excelBuffer, {
                            fileName: path.basename(fileName),
                            mimetype:
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            caption: `*✅ Groupe ${++processedCount}/${groupsArray.length}*\n\n📊 *${group.subject
                                }*\n👥 Membres: ${group.participants.length}\n📅 Création: ${new Date(
                                    group.creation * 1000
                                ).toLocaleDateString("fr-FR")}`,
                        });

                        // Nettoyage
                        fs.unlinkSync(fileName);

                        // Pause entre chaque groupe pour éviter le spam (3 secondes)
                        if (processedCount < groupsArray.length) {
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                        }
                    } catch (error) {
                        console.error(`Erreur pour le groupe ${group.subject}:`, error);
                        await message.reply(
                            `*⚠️ Erreur pour le groupe:* ${group.subject}\n${error.message}`
                        );
                    }
                }

                await message.reply(
                    `*✅ Extraction terminée!*\n\n📊 *Total:* ${processedCount} groupes traités`
                );
                await message.react("✅");
                return;
            }

            // Cas 2: Nom de groupe spécifique fourni
            await message.reply(`*🔍 Recherche du groupe: "${targetGroupName}"...*`);

            // Filtrer par subject (nom du groupe)
            const targetGroup = groupsArray.find(
                (group) => group.subject === targetGroupName
            );

            if (!targetGroup) {
                // Lister les groupes disponibles
                let groupList = "*❌ Groupe introuvable!*\n\n*Groupes disponibles:*\n\n";
                groupsArray.forEach((g, index) => {
                    groupList += `${index + 1}. ${g.subject} (${g.participants.length} membres)\n`;
                });

                return await message.reply(
                    groupList +
                    "\n⚠️ *Le nom doit correspondre EXACTEMENT (sensible à la casse)*"
                );
            }

            await message.react("📊");
            await message.reply("*🔄 Extraction des membres en cours...*");

            // Créer le fichier Excel pour ce groupe
            const fileName = await createGroupExcel(targetGroup);
            const excelBuffer = fs.readFileSync(fileName);

            // Envoyer le fichier
            await message.sendDocument(excelBuffer, {
                fileName: path.basename(fileName),
                mimetype:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                caption: `*✅ Extraction terminée!*

📊 *Groupe:* ${targetGroup.subject}
👥 *Total membres:* ${targetGroup.participants.length}
👔 *Admins:* ${targetGroup.participants.filter((p) => p.admin).length
                    }
👤 *Membres:* ${targetGroup.participants.filter((p) => !p.admin).length
                    }
📅 *Date création:* ${new Date(targetGroup.creation * 1000).toLocaleDateString(
                        "fr-FR"
                    )}
📅 *Extrait le:* ${new Date().toLocaleString("fr-FR")}`,
            });

            // Nettoyage
            fs.unlinkSync(fileName);
            await message.react("✅");
        } catch (error) {
            console.error("Catch command error:", error);
            await message.reply(
                "*❌ Erreur lors de l'extraction!*\n\n" + error.message
            );
            await message.react("❌");
        }
    },
};

/**
 * Fonction pour créer un fichier Excel pour un groupe
 * @param {Object} group - Objet groupe de groupFetchAllParticipating
 * @returns {String} - Chemin du fichier créé
 */
async function createGroupExcel(group) {
    const groupName = group.subject;
    const groupDesc = group.desc || "Aucune description";
    const creationDate = new Date(group.creation * 1000).toLocaleDateString(
        "fr-FR"
    );
    const participants = group.participants;

    // Préparer les données pour Excel
    const membersData = [];

    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        // Utiliser phoneNumber s'il existe, sinon extraire de l'id
        const phoneNumber = participant.phoneNumber
            ? participant.phoneNumber.split("@")[0]
            : participant.id.split("@")[0];

        membersData.push({
            telephone: phoneNumber,
            statut: participant.admin || "member",
        });
    }

    // Créer le fichier Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Membres du Groupe");

    // Définir les colonnes
    worksheet.columns = [
        { header: "Téléphone", key: "telephone", width: 20 },
        { header: "Statut", key: "statut", width: 15 },
    ];

    // Style de l'en-tête
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
    };
    worksheet.getRow(1).font.color = { argb: "FFFFFFFF" };
    worksheet.getRow(1).alignment = {
        vertical: "middle",
        horizontal: "center",
    };

    // Ajouter les données
    membersData.forEach((member) => {
        const row = worksheet.addRow(member);

        // Colorer les admins
        if (member.statut && member.statut !== "member") {
            row.getCell("statut").fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFA500" },
            };
            row.getCell("statut").font = {
                color: { argb: "FFFFFFFF" },
                bold: true,
            };
        }
    });

    // Ajouter une feuille avec les statistiques
    const statsSheet = workbook.addWorksheet("Statistiques");
    statsSheet.columns = [
        { header: "Information", key: "info", width: 30 },
        { header: "Valeur", key: "value", width: 40 },
    ];

    const adminCount = membersData.filter(
        (m) => m.statut && m.statut !== "member"
    ).length;
    const memberCount = membersData.filter(
        (m) => !m.statut || m.statut === "member"
    ).length;

    statsSheet.addRows([
        { info: "Nom du groupe", value: groupName },
        { info: "Description", value: groupDesc },
        { info: "Date de création", value: creationDate },
        { info: "Total membres", value: participants.length },
        { info: "Admins", value: adminCount },
        { info: "Membres", value: memberCount },
        { info: "Type", value: group.isCommunity ? "Communauté" : "Groupe" },
        { info: "Date d'extraction", value: new Date().toLocaleString("fr-FR") },
    ]);

    // Style de la feuille stats
    statsSheet.getRow(1).font = { bold: true };
    statsSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF70AD47" },
    };
    statsSheet.getColumn("info").font = { bold: true };

    // Générer le fichier
    const tempDir = path.join(__dirname, "..", "assets");
    const sanitizedGroupName = groupName.replace(/[^a-z0-9]/gi, "_");
    const fileName = `membres_${sanitizedGroupName}_${Date.now()}.xlsx`;
    const filePath = path.join(tempDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    return filePath;
}

