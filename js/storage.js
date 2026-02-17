/**
 * storage.js — Gestion du localStorage pour les agents, modèles de tâches, historique et logo
 */

const Storage = {

    // ===== CLÉS =====
    KEYS: {
        AGENTS: 'fiche_eval_agents',
        TEMPLATES: 'fiche_eval_templates',
        HISTORY: 'fiche_eval_history',
        LOGO: 'fiche_eval_logo'
    },

    // ===== UTILITAIRES =====
    _get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erreur lecture localStorage:', e);
            return [];
        }
    },

    _set(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Erreur écriture localStorage:', e);
            alert('Erreur de sauvegarde. L\'espace de stockage local est peut-être plein.');
        }
    },

    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    },

    // ===== AGENTS =====
    getAgents() {
        return this._get(this.KEYS.AGENTS);
    },

    addAgent(agent) {
        const agents = this.getAgents();
        agent.id = this._generateId();
        agents.push(agent);
        this._set(this.KEYS.AGENTS, agents);
        return agent;
    },

    updateAgent(id, updated) {
        const agents = this.getAgents();
        const index = agents.findIndex(a => a.id === id);
        if (index !== -1) {
            agents[index] = { ...agents[index], ...updated };
            this._set(this.KEYS.AGENTS, agents);
        }
    },

    deleteAgent(id) {
        const agents = this.getAgents().filter(a => a.id !== id);
        this._set(this.KEYS.AGENTS, agents);
    },

    // ===== MODÈLES DE TÂCHES =====
    getTemplates() {
        return this._get(this.KEYS.TEMPLATES);
    },

    addTemplate(template) {
        const templates = this.getTemplates();
        template.id = this._generateId();
        templates.push(template);
        this._set(this.KEYS.TEMPLATES, templates);
        return template;
    },

    deleteTemplate(id) {
        const templates = this.getTemplates().filter(t => t.id !== id);
        this._set(this.KEYS.TEMPLATES, templates);
    },

    // ===== HISTORIQUE =====
    getHistory() {
        return this._get(this.KEYS.HISTORY);
    },

    addToHistory(entry) {
        const history = this.getHistory();
        entry.id = this._generateId();
        entry.generatedAt = new Date().toISOString();
        history.unshift(entry); // plus récent en premier
        // Garder max 100 entrées
        if (history.length > 100) {
            history.pop();
        }
        this._set(this.KEYS.HISTORY, history);
        return entry;
    },

    deleteFromHistory(id) {
        const history = this.getHistory().filter(h => h.id !== id);
        this._set(this.KEYS.HISTORY, history);
    },

    // ===== LOGO =====
    getLogo() {
        try {
            return localStorage.getItem(this.KEYS.LOGO) || null;
        } catch (e) {
            return null;
        }
    },

    setLogo(base64Data) {
        try {
            localStorage.setItem(this.KEYS.LOGO, base64Data);
        } catch (e) {
            console.error('Erreur sauvegarde logo:', e);
            alert('Le logo est trop volumineux pour le stockage local. Essayez une image plus petite.');
        }
    },

    removeLogo() {
        localStorage.removeItem(this.KEYS.LOGO);
    },

    // ===== DONNÉES PAR DÉFAUT (extraites des fiches existantes) =====
    DEFAULTS: {
        agents: [
            { nom: "ABOUBAKAR ISSIAKOU", categorie: "Chef de Service", structure: "CIRT" },
            { nom: "AMADOU SIDDIKI", categorie: "CADRE", structure: "CIRT" },
            { nom: "ORUH MARION TAKU", categorie: "CADRE", structure: "CIRT" }
        ],
        templates: [
            {
                designation: "Requêtes d'authentification",
                taches: "Traitement des dossiers d'authentification"
            },
            {
                designation: "Mission d'investigation",
                taches: "Investigations numériques"
            },
            {
                designation: "Analyse forensique",
                taches: "Analyse des preuves numériques extraites"
            },
            {
                designation: "Rédaction de rapports",
                taches: "Rédaction des rapports d'investigation numérique"
            },
            {
                designation: "Veille sécuritaire",
                taches: "Veille et surveillance des menaces cybernétiques"
            },
            {
                designation: "Réponse aux incidents",
                taches: "Traitement et réponse aux incidents de sécurité"
            },
            {
                designation: "Réunion de service",
                taches: "Participation à la réunion de service"
            },
            {
                designation: "Analysis of digital evidence",
                taches: "Analysis of digital evidence extracted from devices"
            },
            {
                designation: "Report writing",
                taches: "Writing of digital investigation reports"
            }
        ]
    },

    /**
     * Initialise les données par défaut si le localStorage est vide (premier lancement)
     */
    initDefaults() {
        const INIT_KEY = 'fiche_eval_initialized';
        if (localStorage.getItem(INIT_KEY)) return;

        // Pré-charger les agents par défaut
        if (this.getAgents().length === 0) {
            this.DEFAULTS.agents.forEach(a => this.addAgent({ ...a }));
        }

        // Pré-charger les modèles de tâches par défaut
        if (this.getTemplates().length === 0) {
            this.DEFAULTS.templates.forEach(t => this.addTemplate({ ...t }));
        }

        localStorage.setItem(INIT_KEY, '1');
    }
};
