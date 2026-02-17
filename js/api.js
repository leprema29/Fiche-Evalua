/**
 * api.js — Client API pour communiquer avec le backend Flask
 */
const Api = {

    BASE_URL: '',  // même origine (Flask sert le frontend)

    // === UTILITAIRES ===
    async _fetch(url, options = {}) {
        try {
            const resp = await fetch(this.BASE_URL + url, {
                ...options,
                credentials: 'same-origin',
                headers: {
                    ...(options.headers || {}),
                    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' })
                }
            });
            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.error || `Erreur ${resp.status}`);
            }
            return data;
        } catch (e) {
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                throw new Error('Le serveur backend n\'est pas accessible. Démarrez le serveur Flask.');
            }
            throw e;
        }
    },

    // === AUTH ===
    async login(username, password) {
        return this._fetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async logout() {
        return this._fetch('/api/auth/logout', { method: 'POST' });
    },

    async getAuthStatus() {
        return this._fetch('/api/auth/status');
    },

    async changePassword(currentPassword, newPassword) {
        return this._fetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });
    },

    // === SMTP ===
    async getSmtpConfig() {
        return this._fetch('/api/smtp');
    },

    async updateSmtpConfig(config) {
        return this._fetch('/api/smtp', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    },

    async testSmtpConnection() {
        return this._fetch('/api/smtp/test', { method: 'POST' });
    },

    // === EMPLOYEES ===
    async syncEmployees(agents) {
        return this._fetch('/api/employees/sync', {
            method: 'POST',
            body: JSON.stringify({ agents })
        });
    },

    async getEmployees() {
        return this._fetch('/api/employees');
    },

    async updateEmployee(empId, data) {
        return this._fetch(`/api/employees/${empId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // === TASKS ===
    async syncTasks(templates, assignments) {
        return this._fetch('/api/tasks/sync', {
            method: 'POST',
            body: JSON.stringify({ templates, assignments })
        });
    },

    // === EMAIL ===
    async sendEmail(file, recipientEmail, agentName, weekStart, weekEnd) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('recipient_email', recipientEmail);
        formData.append('agent_name', agentName);
        formData.append('week_start', weekStart);
        formData.append('week_end', weekEnd);

        return this._fetch('/api/email/send', {
            method: 'POST',
            body: formData
        });
    },

    async getEmailLogs() {
        return this._fetch('/api/email/logs');
    },

    // === SCHEDULES ===
    async getSchedules() {
        return this._fetch('/api/schedules');
    },

    // === SYNC ALL DATA ===
    async syncAllData() {
        const agents = Storage.getAgents();
        const templates = Storage.getTemplates();
        const rawAssignments = Storage.getAssignments();

        // Transformer les assignations en format clé:valeur
        const assignmentMap = {};
        rawAssignments.forEach(a => {
            assignmentMap[`${a.agentId}:${a.templateId}`] = true;
        });

        await this.syncEmployees(agents);
        await this.syncTasks(templates, assignmentMap);
    }
};
