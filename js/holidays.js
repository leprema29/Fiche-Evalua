/**
 * holidays.js — Gestion des jours fériés camerounais
 * Inclut les jours fériés fixes et les fêtes mobiles (Pâques, fêtes islamiques)
 */

const Holidays = {

    /**
     * Calcul de la date de Pâques (algorithme de Meeus/Jones/Butcher)
     */
    _computeEaster(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    },

    /**
     * Dates des fêtes islamiques approximatives (2024-2030)
     * Ces dates sont approximatives car basées sur le calendrier lunaire.
     * Eid al-Fitr (fin Ramadan), Eid al-Adha (Tabaski), Mawlid (Maouloud)
     */
    _islamicHolidays: {
        2024: {
            eidAlFitr: [{ m: 4, d: 10 }, { m: 4, d: 11 }],    // Avril
            eidAlAdha: [{ m: 6, d: 17 }, { m: 6, d: 18 }],     // Juin
            mawlid: [{ m: 9, d: 16 }]                           // Septembre
        },
        2025: {
            eidAlFitr: [{ m: 3, d: 31 }, { m: 4, d: 1 }],      // Mars-Avril
            eidAlAdha: [{ m: 6, d: 7 }, { m: 6, d: 8 }],        // Juin
            mawlid: [{ m: 9, d: 5 }]                             // Septembre
        },
        2026: {
            eidAlFitr: [{ m: 3, d: 20 }, { m: 3, d: 21 }],     // Mars
            eidAlAdha: [{ m: 5, d: 27 }, { m: 5, d: 28 }],      // Mai
            mawlid: [{ m: 8, d: 26 }]                            // Août
        },
        2027: {
            eidAlFitr: [{ m: 3, d: 10 }, { m: 3, d: 11 }],     // Mars
            eidAlAdha: [{ m: 5, d: 16 }, { m: 5, d: 17 }],      // Mai
            mawlid: [{ m: 8, d: 15 }]                            // Août
        },
        2028: {
            eidAlFitr: [{ m: 2, d: 27 }, { m: 2, d: 28 }],     // Février
            eidAlAdha: [{ m: 5, d: 5 }, { m: 5, d: 6 }],        // Mai
            mawlid: [{ m: 8, d: 3 }]                             // Août
        },
        2029: {
            eidAlFitr: [{ m: 2, d: 15 }, { m: 2, d: 16 }],     // Février
            eidAlAdha: [{ m: 4, d: 24 }, { m: 4, d: 25 }],      // Avril
            mawlid: [{ m: 7, d: 24 }]                            // Juillet
        },
        2030: {
            eidAlFitr: [{ m: 2, d: 5 }, { m: 2, d: 6 }],       // Février
            eidAlAdha: [{ m: 4, d: 13 }, { m: 4, d: 14 }],      // Avril
            mawlid: [{ m: 7, d: 13 }]                            // Juillet
        }
    },

    /**
     * Retourne la liste de tous les jours fériés pour une année donnée
     * Chaque entrée: { date: Date, name: string }
     */
    getHolidaysForYear(year) {
        const holidays = [];

        // --- Jours fériés fixes ---
        holidays.push({ date: new Date(year, 0, 1), name: "Nouvel An" });
        holidays.push({ date: new Date(year, 1, 11), name: "Fête de la Jeunesse" });
        holidays.push({ date: new Date(year, 4, 1), name: "Fête du Travail" });
        holidays.push({ date: new Date(year, 4, 20), name: "Fête Nationale" });
        holidays.push({ date: new Date(year, 7, 15), name: "Assomption" });
        holidays.push({ date: new Date(year, 9, 1), name: "Fête de l'Unification" });  // 1er octobre
        holidays.push({ date: new Date(year, 11, 25), name: "Noël" });

        // --- Fêtes chrétiennes mobiles (basées sur Pâques) ---
        const easter = this._computeEaster(year);

        // Vendredi Saint (2 jours avant Pâques)
        const goodFriday = new Date(easter);
        goodFriday.setDate(easter.getDate() - 2);
        holidays.push({ date: goodFriday, name: "Vendredi Saint" });

        // Ascension (39 jours après Pâques)
        const ascension = new Date(easter);
        ascension.setDate(easter.getDate() + 39);
        holidays.push({ date: ascension, name: "Ascension" });

        // --- Fêtes islamiques ---
        const islamicDates = this._islamicHolidays[year];
        if (islamicDates) {
            if (islamicDates.eidAlFitr) {
                islamicDates.eidAlFitr.forEach(d => {
                    holidays.push({ date: new Date(year, d.m - 1, d.d), name: "Fête du Ramadan" });
                });
            }
            if (islamicDates.eidAlAdha) {
                islamicDates.eidAlAdha.forEach(d => {
                    holidays.push({ date: new Date(year, d.m - 1, d.d), name: "Fête de la Tabaski" });
                });
            }
            if (islamicDates.mawlid) {
                islamicDates.mawlid.forEach(d => {
                    holidays.push({ date: new Date(year, d.m - 1, d.d), name: "Maouloud" });
                });
            }
        }

        return holidays;
    },

    /**
     * Vérifie si une date donnée est un jour férié
     * @param {Date} date
     * @returns {{ isHoliday: boolean, name: string|null }}
     */
    checkHoliday(date) {
        const year = date.getFullYear();
        const holidays = this.getHolidaysForYear(year);

        for (const h of holidays) {
            if (h.date.getFullYear() === date.getFullYear() &&
                h.date.getMonth() === date.getMonth() &&
                h.date.getDate() === date.getDate()) {
                return { isHoliday: true, name: h.name };
            }
        }
        return { isHoliday: false, name: null };
    }
};
