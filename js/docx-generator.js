/**
 * docx-generator.js — Génération du document Word (.docx) de la fiche d'évaluation
 * Utilise la bibliothèque docx.js (chargée via CDN)
 */

const DocxGenerator = {

    /**
     * Génère le document Word et le télécharge
     * @param {Object} data - Données de la fiche
     */
    async generate(data) {
        const {
            Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            WidthType, AlignmentType, BorderStyle, PageOrientation,
            VerticalAlign, ImageRun, HeightRule, TableLayoutType,
            ShadingType, UnderlineType, Footer
        } = docx;

        const FONT = "Times New Roman";
        const FONT_SIZE = 20; // demi-points (10pt)
        const SMALL_SIZE = 18; // 9pt
        const TITLE_SIZE = 24; // 12pt

        // Bordures standard pour les cellules du tableau principal
        const cellBorders = {
            top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
        };

        // Pas de bordures
        const noBorders = {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
        };

        // Pas de bordures au niveau table
        const noTableBorders = {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
        };

        // --- Construction des éléments du document ---
        const children = [];

        // === EN-TÊTE BILINGUE (sans bordures) ===
        // Colonne gauche: Texte français + nom ANTIC FR
        const frCol = new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "REPUBLIQUE DU CAMEROUN", font: FONT, size: FONT_SIZE, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "Paix – Travail – Patrie", font: FONT, size: SMALL_SIZE, italics: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "-------", font: FONT, size: SMALL_SIZE })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "AGENCE NATIONALE DES TECHNOLOGIES", font: FONT, size: SMALL_SIZE, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "DE L'INFORMATION ET DE LA COMMUNICATION", font: FONT, size: SMALL_SIZE, bold: true })]
                })
            ]
        });

        // Colonne centrale: Logo
        const centerChildren = [];
        const logoBase64 = Storage.getLogo();
        if (logoBase64) {
            try {
                const logoData = logoBase64.split(',')[1] || logoBase64;
                const binaryString = atob(logoData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                centerChildren.push(
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0 },
                        children: [
                            new ImageRun({
                                data: bytes,
                                transformation: { width: 80, height: 60 },
                                type: logoBase64.includes('image/png') ? 'png' : 'jpg'
                            })
                        ]
                    })
                );
            } catch (e) {
                console.warn('Erreur chargement logo:', e);
            }
        }

        const centerCol = new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: centerChildren.length > 0 ? centerChildren : [new Paragraph({ children: [] })]
        });

        // Colonne droite: Texte anglais + nom ANTIC EN
        const enCol = new TableCell({
            width: { size: 33, type: WidthType.PERCENTAGE },
            borders: noBorders,
            verticalAlign: VerticalAlign.CENTER,
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "REPUBLIC OF CAMEROON", font: FONT, size: FONT_SIZE, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "Peace – Work – Fatherland", font: FONT, size: SMALL_SIZE, italics: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "-------", font: FONT, size: SMALL_SIZE })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "NATIONAL AGENCY FOR INFORMATION", font: FONT, size: SMALL_SIZE, bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 0 },
                    children: [new TextRun({ text: "AND COMMUNICATION TECHNOLOGY", font: FONT, size: SMALL_SIZE, bold: true })]
                })
            ]
        });

        const headerTable = new Table({
            rows: [
                new TableRow({ children: [frCol, centerCol, enCol] })
            ],
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            borders: noTableBorders
        });

        children.push(headerTable);

        // Espace avant le titre
        children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

        // === TITRE ===
        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
                children: [
                    new TextRun({
                        text: "FICHE INDIVIDUELLE D'EVALUATION HEBDOMADAIRE DU PERSONNEL",
                        font: FONT,
                        size: TITLE_SIZE,
                        bold: true,
                        underline: { type: UnderlineType.SINGLE }
                    })
                ]
            })
        );

        // === DATE ET LIEU ===
        children.push(
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 80 },
                children: [
                    new TextRun({
                        text: `${data.lieu}, le ${this._formatDate(data.dateDocument)}`,
                        font: FONT,
                        size: FONT_SIZE
                    })
                ]
            })
        );

        // === INFORMATIONS AGENT ===
        const agentInfoParts = [];
        agentInfoParts.push(new TextRun({ text: "Nom et Prénom : ", font: FONT, size: FONT_SIZE, bold: true }));
        agentInfoParts.push(new TextRun({ text: data.agentNom, font: FONT, size: FONT_SIZE }));
        agentInfoParts.push(new TextRun({ text: "          Catégorie : ", font: FONT, size: FONT_SIZE, bold: true }));
        agentInfoParts.push(new TextRun({ text: data.agentCategorie, font: FONT, size: FONT_SIZE }));
        agentInfoParts.push(new TextRun({ text: "          Structure : ", font: FONT, size: FONT_SIZE, bold: true }));
        agentInfoParts.push(new TextRun({ text: data.agentStructure, font: FONT, size: FONT_SIZE }));

        children.push(new Paragraph({ spacing: { after: 40 }, children: agentInfoParts }));

        // === SEMAINE ===
        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [
                    new TextRun({
                        text: `Semaine du ${this._formatDateFr(data.semaineDebut)} au ${this._formatDateFr(data.semaineFin)}`,
                        font: FONT,
                        size: FONT_SIZE,
                        bold: true
                    })
                ]
            })
        );

        // === TABLEAU PRINCIPAL ===
        const tableRows = [];

        // Largeurs des colonnes (en DXA/twips) - optimisé pour paysage A4
        const colWidths = [1400, 3000, 1600, 4200, 1500, 2000, 1500];
        const totalWidth = colWidths.reduce((a, b) => a + b, 0);
        const colHeaders = [
            "Jour",
            "Désignation du dossier ou de l'activité",
            "Date de réception ou de prise d'initiative",
            "Tâches réalisées",
            "Durée de traitement ou de réalisation",
            "Appréciation du supérieur hiérarchique direct",
            "Observations"
        ];

        // En-tête du tableau
        const headerRow = new TableRow({
            tableHeader: true,
            height: { value: 600, rule: HeightRule.ATLEAST },
            children: colHeaders.map((header, i) => new TableCell({
                width: { size: colWidths[i], type: WidthType.DXA },
                borders: cellBorders,
                verticalAlign: VerticalAlign.CENTER,
                shading: { type: ShadingType.SOLID, color: "D9E2F3" },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 20, after: 20 },
                        children: [new TextRun({ text: header, font: FONT, size: SMALL_SIZE, bold: true })]
                    })
                ]
            }))
        });
        tableRows.push(headerRow);

        // Lignes de données
        const jourNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

        for (let d = 0; d < 5; d++) {
            const dayData = data.jours[d];
            const jourName = jourNames[d];

            if (dayData.ferie) {
                // Jour férié: colonne Jour + colonnes 2-7 fusionnées avec texte "Férié (nom)"
                const ferieText = dayData.ferieName && dayData.ferieName !== 'Férié'
                    ? `Férié (${dayData.ferieName})`
                    : "Férié";

                tableRows.push(new TableRow({
                    height: { value: 500, rule: HeightRule.ATLEAST },
                    children: [
                        // Colonne Jour
                        new TableCell({
                            width: { size: colWidths[0], type: WidthType.DXA },
                            borders: cellBorders,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: jourName, font: FONT, size: FONT_SIZE, bold: true })]
                            })]
                        }),
                        // Colonnes 2-7 fusionnées
                        new TableCell({
                            columnSpan: 6,
                            borders: cellBorders,
                            verticalAlign: VerticalAlign.CENTER,
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: ferieText, font: FONT, size: FONT_SIZE, italics: true })]
                            })]
                        })
                    ]
                }));
            } else {
                // Jour normal avec activités
                const activities = dayData.activites;
                const nbActivities = activities.length;

                for (let a = 0; a < nbActivities; a++) {
                    const act = activities[a];
                    const rowCells = [];

                    // Colonne "Jour" — fusionne verticalement si plusieurs activités
                    if (a === 0) {
                        rowCells.push(new TableCell({
                            width: { size: colWidths[0], type: WidthType.DXA },
                            borders: cellBorders,
                            verticalAlign: VerticalAlign.CENTER,
                            rowSpan: nbActivities,
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: jourName, font: FONT, size: FONT_SIZE, bold: true })]
                            })]
                        }));
                    }

                    // Désignation
                    rowCells.push(new TableCell({
                        width: { size: colWidths[1], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({
                            spacing: { before: 20, after: 20 },
                            children: [new TextRun({ text: act.designation || "", font: FONT, size: SMALL_SIZE })]
                        })]
                    }));

                    // Date de réception
                    rowCells.push(new TableCell({
                        width: { size: colWidths[2], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: act.dateReception ? this._formatDate(act.dateReception) : "", font: FONT, size: SMALL_SIZE })]
                        })]
                    }));

                    // Tâches réalisées
                    const tachesParagraphs = (act.taches || "").split('\n').filter(t => t.trim()).map(line =>
                        new Paragraph({
                            spacing: { before: 10, after: 10 },
                            children: [new TextRun({ text: line.trim(), font: FONT, size: SMALL_SIZE })]
                        })
                    );
                    if (tachesParagraphs.length === 0) {
                        tachesParagraphs.push(new Paragraph({ children: [] }));
                    }
                    rowCells.push(new TableCell({
                        width: { size: colWidths[3], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: tachesParagraphs
                    }));

                    // Durée
                    rowCells.push(new TableCell({
                        width: { size: colWidths[4], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: this._formatDuration(act.dureeH, act.dureeM), font: FONT, size: SMALL_SIZE })]
                        })]
                    }));

                    // Appréciation (vide)
                    rowCells.push(new TableCell({
                        width: { size: colWidths[5], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({ children: [] })]
                    }));

                    // Observations
                    rowCells.push(new TableCell({
                        width: { size: colWidths[6], type: WidthType.DXA },
                        borders: cellBorders,
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({
                            children: [new TextRun({ text: act.observations || "", font: FONT, size: SMALL_SIZE })]
                        })]
                    }));

                    tableRows.push(new TableRow({
                        height: { value: 450, rule: HeightRule.ATLEAST },
                        children: rowCells
                    }));
                }
            }
        }

        // === VOLUME HORAIRE (dernière ligne du tableau, fusionnée) ===
        tableRows.push(new TableRow({
            height: { value: 450, rule: HeightRule.ATLEAST },
            children: [
                new TableCell({
                    columnSpan: 7,
                    borders: cellBorders,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 40, after: 40 },
                        children: [
                            new TextRun({ text: "Volume horaire : ", font: FONT, size: FONT_SIZE, bold: true }),
                            new TextRun({ text: data.volumeHoraire, font: FONT, size: FONT_SIZE, bold: true })
                        ]
                    })]
                })
            ]
        }));

        const mainTable = new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED
        });

        children.push(mainTable);

        // Espace après le tableau
        children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));

        // === APPRECIATIONS ===
        children.push(
            new Paragraph({
                spacing: { after: 600 },
                children: [
                    new TextRun({ text: "APPRECIATION DU CHEF DE STRUCTURE :", font: FONT, size: FONT_SIZE, bold: true, underline: { type: UnderlineType.SINGLE } })
                ]
            })
        );

        children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

        children.push(
            new Paragraph({
                spacing: { after: 600 },
                children: [
                    new TextRun({ text: "APPRECIATION DU SUPERIEUR HIERARCHIQUE :", font: FONT, size: FONT_SIZE, bold: true, underline: { type: UnderlineType.SINGLE } })
                ]
            })
        );

        children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

        // === SIGNATURE ===
        children.push(
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 200 },
                children: [
                    new TextRun({ text: "SIGNATURE DE L'INTERESSE", font: FONT, size: FONT_SIZE, bold: true, underline: { type: UnderlineType.SINGLE } })
                ]
            })
        );

        // === CRÉATION DU DOCUMENT (paysage A4 + NB en pied de page centré) ===
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: {
                            orientation: PageOrientation.LANDSCAPE,
                            width: 11906,  // A4 court (210mm) — docx.js fait la rotation
                            height: 16838  // A4 long (297mm)
                        },
                        margin: {
                            top: 600,
                            bottom: 800,
                            left: 800,
                            right: 800
                        }
                    }
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        text: "NB : À TRANSMETTRE CHAQUE 1ER JOUR OUVRÉ DE LA SEMAINE À L'INSPECTION DES SERVICES",
                                        font: FONT,
                                        size: SMALL_SIZE,
                                        bold: true,
                                        italics: true
                                    })
                                ]
                            })
                        ]
                    })
                },
                children: children
            }]
        });

        // === EXPORT ===
        const blob = await Packer.toBlob(doc);
        const filename = `Fiche_${data.agentNom.replace(/\s+/g, '_')}_${data.semaineDebut}_${data.semaineFin}.docx`;
        saveAs(blob, filename);

        return filename;
    },

    // === UTILITAIRES DE FORMATAGE ===

    _formatDate(dateStr) {
        if (!dateStr) return "";
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    },

    _formatDateFr(dateStr) {
        if (!dateStr) return "";
        const mois = [
            "janvier", "février", "mars", "avril", "mai", "juin",
            "juillet", "août", "septembre", "octobre", "novembre", "décembre"
        ];
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const day = parseInt(parts[2], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[0], 10);
            return `${day} ${mois[month]} ${year}`;
        }
        return dateStr;
    },

    _formatDuration(hours, minutes) {
        const h = parseInt(hours, 10) || 0;
        const m = parseInt(minutes, 10) || 0;
        if (h === 0 && m === 0) return "";
        if (m === 0) return `${h}h`;
        return `${h}h${m.toString().padStart(2, '0')}min`;
    }
};
