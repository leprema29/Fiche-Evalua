/**
 * app.js — Logique principale de l'interface utilisateur
 */

(function () {
    'use strict';

    // ID de l'agent actuellement sélectionné dans le formulaire
    let selectedAgentId = '';

    // Dernier fichier .docx généré (Blob) pour l'envoi par email
    let lastGeneratedBlob = null;
    let lastGeneratedFilename = '';
    let lastGeneratedData = null;

    // État d'authentification backend
    let isAuthenticated = false;

    // ===== NAVIGATION PAR ONGLETS =====
    function initTabs() {
        const tabs = document.querySelectorAll('.tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');

                // Rafraîchir la matrice quand on va sur l'onglet Agents & Modèles
                if (tab.dataset.tab === 'agents-modeles') {
                    renderMatrix();
                }
                // Charger les données email quand on va sur l'onglet Email
                if (tab.dataset.tab === 'email-config' && isAuthenticated) {
                    loadEmployeesEmail();
                    loadEmailLogs();
                }
            });
        });
    }

    // ===== GESTION DES JOURS =====
    const JOUR_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

    function getWeekDates(startDateStr) {
        const start = new Date(startDateStr);
        // Trouver le lundi de la semaine
        const day = start.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const monday = new Date(start);
        monday.setDate(start.getDate() + diff);

        const dates = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d);
        }
        return dates;
    }

    function formatDateInput(date) {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateDisplay(date) {
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function buildDaysUI() {
        const container = document.getElementById('jours-container');
        const startInput = document.getElementById('semaine-debut').value;
        if (!startInput) return;

        const dates = getWeekDates(startInput);

        // Mettre à jour la date de fin
        document.getElementById('semaine-fin').value = formatDateInput(dates[4]);

        // Mettre à jour la date du document au vendredi
        const dateDocInput = document.getElementById('date-document');
        if (!dateDocInput.value) {
            dateDocInput.value = formatDateInput(dates[4]);
        }

        // Vider le conteneur (garder le h2)
        const h2 = container.querySelector('h2');
        container.innerHTML = '';
        container.appendChild(h2);

        for (let i = 0; i < 5; i++) {
            const date = dates[i];
            const holiday = Holidays.checkHoliday(date);
            const dayCard = createDayCard(i, JOUR_NAMES[i], date, holiday);
            container.appendChild(dayCard);
        }

        updateVolumeHoraire();
    }

    function createDayCard(index, jourName, date, holiday) {
        const card = document.createElement('div');
        card.className = 'day-card';
        card.dataset.dayIndex = index;

        if (holiday.isHoliday) {
            card.classList.add('ferie');
        }

        card.innerHTML = `
            <div class="day-header">
                <div class="day-header-left">
                    <h3>${jourName}</h3>
                    <span class="day-date">${formatDateDisplay(date)}</span>
                    <span class="ferie-badge">${holiday.isHoliday ? holiday.name : 'Férié'}</span>
                </div>
                <div class="day-header-right">
                    <div class="horaire-group">
                        <label>Horaire :</label>
                        <input type="time" class="day-horaire" value="08:00">
                    </div>
                    <label class="ferie-toggle">
                        <input type="checkbox" class="ferie-checkbox" ${holiday.isHoliday ? 'checked' : ''}>
                        Férié
                    </label>
                </div>
            </div>
            <div class="day-body">
                <div class="activities-container"></div>
                <button type="button" class="btn-add-activity">+ Ajouter une activité</button>
            </div>
        `;

        // Gestion du toggle férié
        const ferieCheckbox = card.querySelector('.ferie-checkbox');
        ferieCheckbox.addEventListener('change', () => {
            card.classList.toggle('ferie', ferieCheckbox.checked);
            const badge = card.querySelector('.ferie-badge');
            if (ferieCheckbox.checked && !holiday.isHoliday) {
                badge.textContent = 'Férié';
            }
            updateVolumeHoraire();
        });

        // Ajouter une première activité
        const activitiesContainer = card.querySelector('.activities-container');
        if (!holiday.isHoliday) {
            activitiesContainer.appendChild(createActivityEntry(1));
        }

        // Bouton ajouter activité
        card.querySelector('.btn-add-activity').addEventListener('click', () => {
            const count = activitiesContainer.querySelectorAll('.activity-entry').length;
            activitiesContainer.appendChild(createActivityEntry(count + 1));
        });

        return card;
    }

    function getTemplatesForDropdown() {
        // Si un agent est sélectionné, afficher uniquement ses tâches assignées
        if (selectedAgentId) {
            return Storage.getTemplatesForAgent(selectedAgentId);
        }
        // Sinon, afficher toutes les tâches
        return Storage.getTemplates();
    }

    function createActivityEntry(num) {
        const entry = document.createElement('div');
        entry.className = 'activity-entry';

        // Construire la liste des modèles filtrée par agent
        const templates = getTemplatesForDropdown();
        let templateOptions = '<option value="">— Appliquer un modèle —</option>';
        templates.forEach(t => {
            templateOptions += `<option value="${t.id}">${t.designation}</option>`;
        });

        entry.innerHTML = `
            <div class="activity-header">
                <span>Activité ${num}</span>
                <button type="button" class="btn-remove-activity" title="Supprimer cette activité">&times;</button>
            </div>
            <div class="template-select-row">
                <select class="template-select">${templateOptions}</select>
            </div>
            <div class="form-row">
                <div class="form-group" style="flex:2">
                    <label>Désignation du dossier / activité</label>
                    <input type="text" class="act-designation" placeholder="Ex: Dossiers d'authentification">
                </div>
                <div class="form-group" style="flex:1">
                    <label>Date de réception</label>
                    <input type="date" class="act-date-reception">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="flex:3">
                    <label>Tâches réalisées</label>
                    <textarea class="act-taches" rows="2" placeholder="Description des tâches réalisées"></textarea>
                </div>
                <div class="form-group" style="flex:1">
                    <label>Durée</label>
                    <div class="duration-inputs">
                        <input type="number" class="act-duree-h" min="0" max="24" value="0" placeholder="H">
                        <span>h</span>
                        <input type="number" class="act-duree-m" min="0" max="59" value="0" placeholder="M">
                        <span>min</span>
                    </div>
                </div>
                <div class="form-group" style="flex:1">
                    <label>Observations</label>
                    <input type="text" class="act-observations" placeholder="Observations">
                </div>
            </div>
        `;

        // Supprimer l'activité
        entry.querySelector('.btn-remove-activity').addEventListener('click', () => {
            entry.remove();
            updateActivityNumbers(entry.closest('.day-card'));
            updateVolumeHoraire();
        });

        // Appliquer un modèle
        entry.querySelector('.template-select').addEventListener('change', function () {
            const templateId = this.value;
            if (!templateId) return;
            const template = Storage.getTemplates().find(t => t.id === templateId);
            if (template) {
                entry.querySelector('.act-designation').value = template.designation;
                entry.querySelector('.act-taches').value = template.taches;
            }
            this.value = '';
        });

        // Mise à jour du volume horaire en temps réel
        entry.querySelector('.act-duree-h').addEventListener('input', updateVolumeHoraire);
        entry.querySelector('.act-duree-m').addEventListener('input', updateVolumeHoraire);

        return entry;
    }

    function updateActivityNumbers(dayCard) {
        if (!dayCard) return;
        const entries = dayCard.querySelectorAll('.activity-entry');
        entries.forEach((entry, i) => {
            entry.querySelector('.activity-header span').textContent = `Activité ${i + 1}`;
        });
    }

    // ===== VOLUME HORAIRE =====
    function updateVolumeHoraire() {
        let totalMinutes = 0;
        const dayCards = document.querySelectorAll('.day-card');

        dayCards.forEach(card => {
            if (card.classList.contains('ferie')) return;
            const entries = card.querySelectorAll('.activity-entry');
            entries.forEach(entry => {
                const h = parseInt(entry.querySelector('.act-duree-h').value, 10) || 0;
                const m = parseInt(entry.querySelector('.act-duree-m').value, 10) || 0;
                totalMinutes += h * 60 + m;
            });
        });

        const totalH = Math.floor(totalMinutes / 60);
        const totalM = totalMinutes % 60;
        const display = totalM > 0 ? `${totalH}h ${totalM.toString().padStart(2, '0')}min` : `${totalH}h`;
        document.getElementById('volume-horaire').textContent = display;
    }

    // ===== COLLECTE DES DONNÉES =====
    function collectFormData() {
        const data = {
            agentNom: document.getElementById('agent-nom').value.trim(),
            agentCategorie: document.getElementById('agent-categorie').value.trim(),
            agentStructure: document.getElementById('agent-structure').value.trim(),
            semaineDebut: document.getElementById('semaine-debut').value,
            semaineFin: document.getElementById('semaine-fin').value,
            lieu: document.getElementById('lieu').value.trim() || 'Yaoundé',
            dateDocument: document.getElementById('date-document').value,
            volumeHoraire: document.getElementById('volume-horaire').textContent,
            jours: []
        };

        const dayCards = document.querySelectorAll('.day-card');
        dayCards.forEach(card => {
            const isFerie = card.classList.contains('ferie');
            const horaire = card.querySelector('.day-horaire') ? card.querySelector('.day-horaire').value : '';
            const dayObj = {
                ferie: isFerie,
                ferieName: isFerie ? (card.querySelector('.ferie-badge').textContent || 'Férié') : null,
                horaire: horaire,
                activites: []
            };

            if (!isFerie) {
                const entries = card.querySelectorAll('.activity-entry');
                entries.forEach(entry => {
                    dayObj.activites.push({
                        designation: entry.querySelector('.act-designation').value.trim(),
                        dateReception: entry.querySelector('.act-date-reception').value,
                        taches: entry.querySelector('.act-taches').value.trim(),
                        dureeH: entry.querySelector('.act-duree-h').value,
                        dureeM: entry.querySelector('.act-duree-m').value,
                        observations: entry.querySelector('.act-observations').value.trim()
                    });
                });
            }

            // Si pas d'activités et pas férié, ajouter une activité vide
            if (!isFerie && dayObj.activites.length === 0) {
                dayObj.activites.push({
                    designation: '', dateReception: '', taches: '',
                    dureeH: '0', dureeM: '0', observations: ''
                });
            }

            data.jours.push(dayObj);
        });

        return data;
    }

    function validateForm(data) {
        const errors = [];
        if (!data.agentNom) errors.push("Le nom de l'agent est requis.");
        if (!data.semaineDebut) errors.push("La date de début de semaine est requise.");
        if (!data.dateDocument) errors.push("La date du document est requise.");
        return errors;
    }

    // ===== GÉNÉRATION DU DOCUMENT =====
    async function handleGenerate() {
        const data = collectFormData();
        const errors = validateForm(data);

        if (errors.length > 0) {
            alert("Veuillez corriger les erreurs suivantes :\n\n" + errors.join("\n"));
            return;
        }

        const btn = document.getElementById('btn-generer');
        btn.disabled = true;
        btn.textContent = 'Génération en cours...';

        try {
            const result = await DocxGenerator.generate(data);
            const filename = result.filename || result;
            const blob = result.blob || null;

            // Stocker pour l'envoi email
            lastGeneratedBlob = blob;
            lastGeneratedFilename = filename;
            lastGeneratedData = data;

            // Afficher le bouton "Envoyer par email" si connecté au backend
            if (blob && isAuthenticated) {
                document.getElementById('btn-envoyer-email').style.display = '';
            }

            // Sauvegarder dans l'historique
            Storage.addToHistory({
                agentNom: data.agentNom,
                agentCategorie: data.agentCategorie,
                agentStructure: data.agentStructure,
                semaineDebut: data.semaineDebut,
                semaineFin: data.semaineFin,
                filename: filename,
                formData: data
            });

            renderHistory();
            alert(`Fiche générée avec succès !\nFichier : ${filename}`);
        } catch (e) {
            console.error('Erreur génération:', e);
            alert("Erreur lors de la génération du document :\n" + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Générer la fiche Word (.docx)';
        }
    }

    // ===== RÉINITIALISATION =====
    function handleReset() {
        if (!confirm("Réinitialiser le formulaire ? Toutes les données saisies seront perdues.")) return;

        selectedAgentId = '';
        document.getElementById('agent-select').value = '';
        document.getElementById('agent-nom').value = '';
        document.getElementById('agent-categorie').value = '';
        document.getElementById('agent-structure').value = '';
        document.getElementById('semaine-debut').value = '';
        document.getElementById('semaine-fin').value = '';
        document.getElementById('date-document').value = '';

        const container = document.getElementById('jours-container');
        const h2 = container.querySelector('h2');
        container.innerHTML = '';
        container.appendChild(h2);

        document.getElementById('volume-horaire').textContent = '0h 00min';
    }

    // ===== GESTION DES AGENTS (Onglet 2) =====
    function renderAgentsList() {
        const list = document.getElementById('agents-list');
        const agents = Storage.getAgents();

        if (agents.length === 0) {
            list.innerHTML = '<p class="empty-message">Aucun agent enregistré.</p>';
            return;
        }

        list.innerHTML = agents.map(a => `
            <div class="item-card" data-id="${a.id}">
                <div class="item-info">
                    <strong>${a.nom}</strong>
                    <small>${a.categorie} — ${a.structure}</small>
                </div>
                <div class="item-actions">
                    <button class="btn btn-danger btn-sm btn-delete-agent" data-id="${a.id}">Supprimer</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.btn-delete-agent').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Supprimer cet agent ?')) {
                    Storage.deleteAgent(btn.dataset.id);
                    renderAgentsList();
                    refreshAgentSelect();
                    renderMatrix();
                }
            });
        });
    }

    function refreshAgentSelect() {
        const select = document.getElementById('agent-select');
        const agents = Storage.getAgents();
        select.innerHTML = '<option value="">— Sélectionner un agent —</option>';
        agents.forEach(a => {
            select.innerHTML += `<option value="${a.id}">${a.nom} (${a.categorie} — ${a.structure})</option>`;
        });
    }

    function handleAddAgent() {
        const nom = document.getElementById('new-agent-nom').value.trim();
        const categorie = document.getElementById('new-agent-categorie').value.trim();
        const structure = document.getElementById('new-agent-structure').value.trim();

        if (!nom) {
            alert("Le nom de l'agent est requis.");
            return;
        }

        Storage.addAgent({ nom, categorie, structure });
        document.getElementById('new-agent-nom').value = '';
        document.getElementById('new-agent-categorie').value = '';
        document.getElementById('new-agent-structure').value = '';

        renderAgentsList();
        refreshAgentSelect();
        renderMatrix();
    }

    // ===== GESTION DES MODÈLES (Onglet 2) =====
    function renderTemplatesList() {
        const list = document.getElementById('templates-list');
        const templates = Storage.getTemplates();

        if (templates.length === 0) {
            list.innerHTML = '<p class="empty-message">Aucun modèle de tâche enregistré.</p>';
            return;
        }

        list.innerHTML = templates.map(t => `
            <div class="item-card" data-id="${t.id}">
                <div class="item-info">
                    <strong>${t.designation}</strong>
                    <small>${t.taches}</small>
                </div>
                <div class="item-actions">
                    <button class="btn btn-danger btn-sm btn-delete-template" data-id="${t.id}">Supprimer</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.btn-delete-template').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Supprimer ce modèle ?')) {
                    Storage.deleteTemplate(btn.dataset.id);
                    renderTemplatesList();
                    renderMatrix();
                }
            });
        });
    }

    function handleAddTemplate() {
        const designation = document.getElementById('new-tpl-designation').value.trim();
        const taches = document.getElementById('new-tpl-taches').value.trim();

        if (!designation) {
            alert("La désignation est requise.");
            return;
        }

        Storage.addTemplate({ designation, taches });
        document.getElementById('new-tpl-designation').value = '';
        document.getElementById('new-tpl-taches').value = '';

        renderTemplatesList();
        renderMatrix();
    }

    // ===== MATRICE AGENTS x TÂCHES =====
    function renderMatrix() {
        const container = document.getElementById('matrix-container');
        const agents = Storage.getAgents();
        const templates = Storage.getTemplates();

        if (agents.length === 0 || templates.length === 0) {
            container.innerHTML = '<p class="empty-message">Ajoutez des agents et des modèles de tâches pour voir la matrice.</p>';
            return;
        }

        // Construire le tableau
        let html = '<div class="matrix-scroll"><table class="matrix-table">';

        // En-tête : colonne agents + colonnes tâches
        html += '<thead><tr><th class="matrix-corner">Agents \\ Tâches</th>';
        templates.forEach(t => {
            html += `<th class="matrix-task-header" title="${t.taches}">${t.designation}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Lignes : un agent par ligne
        agents.forEach(a => {
            html += `<tr><td class="matrix-agent-cell"><strong>${a.nom}</strong><br><small>${a.categorie}</small></td>`;
            templates.forEach(t => {
                const checked = Storage.isAssigned(a.id, t.id) ? 'checked' : '';
                html += `<td class="matrix-check-cell">
                    <input type="checkbox" class="matrix-checkbox" data-agent="${a.id}" data-template="${t.id}" ${checked}>
                </td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

        // Événements sur les checkboxes
        container.querySelectorAll('.matrix-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                Storage.toggleAssignment(cb.dataset.agent, cb.dataset.template);
            });
        });
    }

    // ===== GESTION DU LOGO (Onglet 2) =====
    function initLogo() {
        const logoData = Storage.getLogo();
        if (logoData) {
            showLogoPreview(logoData);
        }
    }

    function showLogoPreview(dataUrl) {
        const preview = document.getElementById('logo-preview');
        const removeBtn = document.getElementById('btn-remove-logo');
        preview.src = dataUrl;
        preview.style.display = 'block';
        removeBtn.style.display = 'inline-flex';
    }

    function hideLogoPreview() {
        const preview = document.getElementById('logo-preview');
        const removeBtn = document.getElementById('btn-remove-logo');
        preview.src = '';
        preview.style.display = 'none';
        removeBtn.style.display = 'none';
    }

    function handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            const dataUrl = evt.target.result;
            Storage.setLogo(dataUrl);
            showLogoPreview(dataUrl);
        };
        reader.readAsDataURL(file);
    }

    function handleRemoveLogo() {
        Storage.removeLogo();
        hideLogoPreview();
        document.getElementById('logo-upload').value = '';
    }

    // ===== HISTORIQUE (Onglet 3) =====
    function renderHistory() {
        const list = document.getElementById('historique-list');
        const emptyMsg = document.getElementById('historique-empty');
        const history = Storage.getHistory();

        if (history.length === 0) {
            list.innerHTML = '';
            emptyMsg.style.display = 'block';
            return;
        }

        emptyMsg.style.display = 'none';
        list.innerHTML = history.map(h => {
            const generatedDate = h.generatedAt ? new Date(h.generatedAt).toLocaleString('fr-FR') : '';
            return `
                <div class="history-item" data-id="${h.id}">
                    <div class="history-info">
                        <strong>${h.agentNom}</strong>
                        <small>Semaine du ${h.semaineDebut} au ${h.semaineFin} — ${h.agentCategorie || ''} — ${h.agentStructure || ''}</small>
                        <small>Généré le ${generatedDate}</small>
                    </div>
                    <div class="history-actions">
                        <button class="btn btn-primary btn-sm btn-regenerate" data-id="${h.id}">Re-télécharger</button>
                        <button class="btn btn-secondary btn-sm btn-reload" data-id="${h.id}">Recharger dans le formulaire</button>
                        <button class="btn btn-danger btn-sm btn-delete-history" data-id="${h.id}">Supprimer</button>
                    </div>
                </div>
            `;
        }).join('');

        // Re-télécharger
        list.querySelectorAll('.btn-regenerate').forEach(btn => {
            btn.addEventListener('click', async () => {
                const entry = Storage.getHistory().find(h => h.id === btn.dataset.id);
                if (entry && entry.formData) {
                    try {
                        btn.disabled = true;
                        btn.textContent = 'Génération...';
                        await DocxGenerator.generate(entry.formData);
                    } catch (e) {
                        alert("Erreur: " + e.message);
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Re-télécharger';
                    }
                }
            });
        });

        // Recharger dans le formulaire
        list.querySelectorAll('.btn-reload').forEach(btn => {
            btn.addEventListener('click', () => {
                const entry = Storage.getHistory().find(h => h.id === btn.dataset.id);
                if (entry && entry.formData) {
                    loadFormData(entry.formData);
                    // Basculer vers l'onglet "Nouvelle Fiche"
                    document.querySelector('.tab[data-tab="nouvelle-fiche"]').click();
                }
            });
        });

        // Supprimer
        list.querySelectorAll('.btn-delete-history').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Supprimer cette entrée de l\'historique ?')) {
                    Storage.deleteFromHistory(btn.dataset.id);
                    renderHistory();
                }
            });
        });
    }

    // ===== RECHARGEMENT D'UNE FICHE =====
    function loadFormData(formData) {
        document.getElementById('agent-nom').value = formData.agentNom || '';
        document.getElementById('agent-categorie').value = formData.agentCategorie || '';
        document.getElementById('agent-structure').value = formData.agentStructure || '';
        document.getElementById('semaine-debut').value = formData.semaineDebut || '';
        document.getElementById('lieu').value = formData.lieu || 'Yaoundé';
        document.getElementById('date-document').value = formData.dateDocument || '';

        // Construire les jours
        buildDaysUI();

        // Remplir les données de chaque jour
        if (formData.jours) {
            const dayCards = document.querySelectorAll('.day-card');
            formData.jours.forEach((jour, i) => {
                if (i >= dayCards.length) return;
                const card = dayCards[i];
                const checkbox = card.querySelector('.ferie-checkbox');

                // Restaurer l'horaire
                if (jour.horaire && card.querySelector('.day-horaire')) {
                    card.querySelector('.day-horaire').value = jour.horaire;
                }

                if (jour.ferie) {
                    checkbox.checked = true;
                    card.classList.add('ferie');
                    if (jour.ferieName) {
                        card.querySelector('.ferie-badge').textContent = jour.ferieName;
                    }
                } else {
                    checkbox.checked = false;
                    card.classList.remove('ferie');

                    const activitiesContainer = card.querySelector('.activities-container');
                    activitiesContainer.innerHTML = '';

                    jour.activites.forEach((act, a) => {
                        const entry = createActivityEntry(a + 1);
                        entry.querySelector('.act-designation').value = act.designation || '';
                        entry.querySelector('.act-date-reception').value = act.dateReception || '';
                        entry.querySelector('.act-taches').value = act.taches || '';
                        entry.querySelector('.act-duree-h').value = act.dureeH || '0';
                        entry.querySelector('.act-duree-m').value = act.dureeM || '0';
                        entry.querySelector('.act-observations').value = act.observations || '';
                        activitiesContainer.appendChild(entry);
                    });
                }
            });
            updateVolumeHoraire();
        }
    }

    // ===== SÉLECTION D'UN AGENT =====
    function handleAgentSelect() {
        const select = document.getElementById('agent-select');
        const agentId = select.value;
        selectedAgentId = agentId;

        if (!agentId) return;

        const agent = Storage.getAgents().find(a => a.id === agentId);
        if (agent) {
            document.getElementById('agent-nom').value = agent.nom;
            document.getElementById('agent-categorie').value = agent.categorie;
            document.getElementById('agent-structure').value = agent.structure;
        }

        // Rafraîchir les dropdowns de modèles déjà affichés
        refreshAllTemplateDropdowns();
    }

    function refreshAllTemplateDropdowns() {
        const templates = getTemplatesForDropdown();
        let templateOptions = '<option value="">— Appliquer un modèle —</option>';
        templates.forEach(t => {
            templateOptions += `<option value="${t.id}">${t.designation}</option>`;
        });

        document.querySelectorAll('.template-select').forEach(select => {
            select.innerHTML = templateOptions;
        });
    }

    // ===== REMPLISSAGE ALÉATOIRE =====
    function handleRandomFill() {
        // Vérifications
        if (!selectedAgentId) {
            alert("Veuillez d'abord sélectionner un agent.");
            return;
        }

        const startInput = document.getElementById('semaine-debut').value;
        if (!startInput) {
            alert("Veuillez d'abord sélectionner une semaine.");
            return;
        }

        const agentTemplates = Storage.getTemplatesForAgent(selectedAgentId);
        if (agentTemplates.length === 0) {
            alert("Aucune tâche n'est assignée à cet agent. Allez dans l'onglet 'Agents & Modèles' pour assigner des tâches.");
            return;
        }

        // Lire les paramètres
        const minH = parseInt(document.getElementById('random-min-h').value, 10) || 40;
        const maxH = parseInt(document.getElementById('random-max-h').value, 10) || 50;
        const minAct = parseInt(document.getElementById('random-min-act').value, 10) || 1;
        const maxAct = parseInt(document.getElementById('random-max-act').value, 10) || 3;
        const minHoraire = parseInt(document.getElementById('random-min-horaire').value, 10) || 8;
        const maxHoraire = parseInt(document.getElementById('random-max-horaire').value, 10) || 10;

        if (minH > maxH) {
            alert("Les heures minimum ne peuvent pas dépasser les heures maximum.");
            return;
        }
        if (minAct > maxAct) {
            alert("Le nombre minimum d'activités ne peut pas dépasser le maximum.");
            return;
        }
        if (minHoraire > maxHoraire) {
            alert("L'horaire minimum ne peut pas dépasser l'horaire maximum.");
            return;
        }

        // Construire les jours si pas déjà fait
        buildDaysUI();

        const dates = getWeekDates(startInput);
        const dayCards = document.querySelectorAll('.day-card');

        // Identifier les jours ouvrés (non fériés)
        const workDays = [];
        dayCards.forEach((card, i) => {
            const holiday = Holidays.checkHoliday(dates[i]);
            if (holiday.isHoliday) {
                // Marquer comme férié
                card.classList.add('ferie');
                card.querySelector('.ferie-checkbox').checked = true;
            } else {
                workDays.push({ card, date: dates[i], index: i });
            }
        });

        if (workDays.length === 0) {
            alert("Tous les jours de cette semaine sont fériés. Impossible de remplir.");
            return;
        }

        // Calculer le total de minutes cible (entre minH et maxH)
        const targetMinutes = Math.floor(Math.random() * (maxH - minH + 1) + minH) * 60;

        // Déterminer le nombre d'activités par jour
        const dayActivitiesCount = workDays.map(() => {
            return Math.floor(Math.random() * (maxAct - minAct + 1)) + minAct;
        });

        // Nombre total d'activités
        const totalActivities = dayActivitiesCount.reduce((s, n) => s + n, 0);

        // Répartir les minutes entre toutes les activités (min 60min = 1h par activité)
        const minPerActivity = 60; // 1h minimum
        let remainingMinutes = targetMinutes - (totalActivities * minPerActivity);
        if (remainingMinutes < 0) {
            // Pas assez de minutes, augmenter le target
            remainingMinutes = 0;
        }

        // Distribuer le reste aléatoirement (par tranches de 30min pour être réaliste)
        const activityMinutes = new Array(totalActivities).fill(minPerActivity);
        for (let i = 0; i < remainingMinutes; i += 30) {
            const idx = Math.floor(Math.random() * totalActivities);
            activityMinutes[idx] += 30;
        }

        // Observations aléatoires
        const observationsPool = ['RAS', 'Fait', 'En cours'];

        // Remplir chaque jour
        let actIdx = 0;
        workDays.forEach((wd, dayIdx) => {
            const card = wd.card;
            const numAct = dayActivitiesCount[dayIdx];
            const activitiesContainer = card.querySelector('.activities-container');
            activitiesContainer.innerHTML = '';

            // Générer un horaire aléatoire entre minHoraire et maxHoraire (par pas de 15 min)
            const totalSlots = (maxHoraire - minHoraire) * 4; // tranches de 15 min
            const randomSlot = Math.floor(Math.random() * (totalSlots + 1));
            const horaireMinutes = minHoraire * 60 + randomSlot * 15;
            const hh = Math.floor(horaireMinutes / 60);
            const mm = horaireMinutes % 60;
            card.querySelector('.day-horaire').value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

            for (let a = 0; a < numAct; a++) {
                // Choisir une tâche au hasard
                const template = agentTemplates[Math.floor(Math.random() * agentTemplates.length)];
                const minutes = activityMinutes[actIdx];
                const h = Math.floor(minutes / 60);
                const m = minutes % 60;

                const entry = createActivityEntry(a + 1);
                entry.querySelector('.act-designation').value = template.designation;
                entry.querySelector('.act-taches').value = template.taches;
                entry.querySelector('.act-date-reception').value = formatDateInput(wd.date);
                entry.querySelector('.act-duree-h').value = h;
                entry.querySelector('.act-duree-m').value = m;
                entry.querySelector('.act-observations').value = observationsPool[Math.floor(Math.random() * observationsPool.length)];

                activitiesContainer.appendChild(entry);
                actIdx++;
            }
        });

        updateVolumeHoraire();
    }

    // ===== AUTH & EMAIL (Onglet 4) =====

    async function checkAuthStatus() {
        try {
            const status = await Api.getAuthStatus();
            isAuthenticated = status.authenticated;
            updateAuthUI();
        } catch (e) {
            // Backend pas disponible — mode offline
            isAuthenticated = false;
            updateAuthUI();
        }
    }

    function updateAuthUI() {
        const authDiv = document.getElementById('auth-status');
        const loginSection = document.getElementById('login-section');
        const adminContent = document.getElementById('admin-content');

        if (isAuthenticated) {
            authDiv.style.display = 'flex';
            loginSection.style.display = 'none';
            adminContent.style.display = 'block';
        } else {
            authDiv.style.display = 'none';
            loginSection.style.display = '';
            adminContent.style.display = 'none';
        }
    }

    async function handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        if (!username || !password) {
            errorEl.textContent = 'Veuillez remplir tous les champs.';
            errorEl.style.display = 'block';
            return;
        }

        try {
            errorEl.style.display = 'none';
            const result = await Api.login(username, password);
            isAuthenticated = true;
            document.getElementById('auth-username').textContent = result.username;
            updateAuthUI();
            loadSmtpConfig();
            loadEmployeesEmail();
        } catch (e) {
            errorEl.textContent = e.message;
            errorEl.style.display = 'block';
        }
    }

    async function handleLogout() {
        try {
            await Api.logout();
        } catch (e) {
            // ignore
        }
        isAuthenticated = false;
        updateAuthUI();
        document.getElementById('btn-envoyer-email').style.display = 'none';
    }

    // --- SMTP Config ---
    async function loadSmtpConfig() {
        try {
            const config = await Api.getSmtpConfig();
            document.getElementById('smtp-server').value = config.server || '';
            document.getElementById('smtp-port').value = config.port || 587;
            document.getElementById('smtp-username').value = config.username || '';
            document.getElementById('smtp-tls').checked = config.use_tls !== false;
            document.getElementById('smtp-sender-email').value = config.sender_email || '';
            document.getElementById('smtp-sender-name').value = config.sender_name || 'ANTIC';
            // mot de passe volontairement non chargé
        } catch (e) {
            console.warn('Impossible de charger la config SMTP:', e);
        }
    }

    function _getSmtpFormConfig() {
        return {
            server: document.getElementById('smtp-server').value.trim(),
            port: parseInt(document.getElementById('smtp-port').value, 10) || 587,
            username: document.getElementById('smtp-username').value.trim(),
            password: document.getElementById('smtp-password').value,
            use_tls: document.getElementById('smtp-tls').checked,
            sender_email: document.getElementById('smtp-sender-email').value.trim(),
            sender_name: document.getElementById('smtp-sender-name').value.trim()
        };
    }

    async function handleSaveSmtp() {
        const config = _getSmtpFormConfig();
        const statusEl = document.getElementById('smtp-status');
        statusEl.textContent = 'Sauvegarde...';
        statusEl.className = 'status-badge loading';
        statusEl.style.display = '';
        await Api.updateSmtpConfig(config);
        statusEl.textContent = 'Configuration sauvegardée';
        statusEl.className = 'status-badge success';
    }

    async function handleTestSmtp() {
        const statusEl = document.getElementById('smtp-status');
        try {
            // Sauvegarder d'abord, puis tester
            statusEl.textContent = 'Sauvegarde et test en cours...';
            statusEl.className = 'status-badge loading';
            statusEl.style.display = '';
            await Api.updateSmtpConfig(_getSmtpFormConfig());
            const result = await Api.testSmtpConnection();
            if (result.success) {
                statusEl.textContent = 'Connexion SMTP OK';
                statusEl.className = 'status-badge success';
            } else {
                statusEl.textContent = result.error || 'Échec de connexion';
                statusEl.className = 'status-badge error';
            }
        } catch (e) {
            statusEl.textContent = e.message;
            statusEl.className = 'status-badge error';
        }
    }

    // --- Employees email / schedule ---
    async function handleSyncData() {
        try {
            await Api.syncAllData();
            await loadEmployeesEmail();
            alert('Données synchronisées avec le serveur.');
        } catch (e) {
            alert('Erreur de synchronisation : ' + e.message);
        }
    }

    async function loadEmployeesEmail() {
        const container = document.getElementById('employees-email-list');
        try {
            const employees = await Api.getEmployees();
            if (employees.length === 0) {
                container.innerHTML = '<p class="empty-message">Aucun employé. Cliquez sur "Synchroniser les données" pour importer les agents.</p>';
                return;
            }

            const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            container.innerHTML = employees.map(emp => {
                const dayOptions = [1, 2, 3, 4, 5].map(d =>
                    `<option value="${d}" ${emp.schedule_day === d ? 'selected' : ''}>${dayNames[d]}</option>`
                ).join('');
                const timeVal = `${String(emp.schedule_hour).padStart(2, '0')}:${String(emp.schedule_minute).padStart(2, '0')}`;

                return `
                    <div class="employee-email-card" data-emp-id="${emp.id}">
                        <div class="emp-info">
                            <strong>${emp.nom}</strong>
                            <small>${emp.categorie} — ${emp.structure}</small>
                        </div>
                        <div class="emp-email">
                            <input type="email" class="emp-email-input" value="${emp.email || ''}" placeholder="email@example.com" data-emp-id="${emp.id}">
                        </div>
                        <div class="emp-schedule">
                            <label>
                                <input type="checkbox" class="emp-schedule-toggle" data-emp-id="${emp.id}" ${emp.schedule_enabled ? 'checked' : ''}>
                                Auto
                            </label>
                            <select class="emp-schedule-day" data-emp-id="${emp.id}">${dayOptions}</select>
                            <input type="time" class="emp-schedule-time" data-emp-id="${emp.id}" value="${timeVal}">
                        </div>
                        <div class="emp-actions">
                            <button class="btn btn-primary btn-sm btn-save-emp" data-emp-id="${emp.id}">Sauver</button>
                        </div>
                    </div>
                `;
            }).join('');

            // Boutons de sauvegarde
            container.querySelectorAll('.btn-save-emp').forEach(btn => {
                btn.addEventListener('click', () => saveEmployeeConfig(btn.dataset.empId));
            });

        } catch (e) {
            container.innerHTML = `<p class="error-message">${e.message}</p>`;
        }
    }

    async function saveEmployeeConfig(empId) {
        const card = document.querySelector(`.employee-email-card[data-emp-id="${empId}"]`);
        if (!card) return;

        const email = card.querySelector('.emp-email-input').value.trim();
        const scheduleEnabled = card.querySelector('.emp-schedule-toggle').checked;
        const scheduleDay = parseInt(card.querySelector('.emp-schedule-day').value, 10);
        const timeParts = card.querySelector('.emp-schedule-time').value.split(':');
        const scheduleHour = parseInt(timeParts[0], 10) || 8;
        const scheduleMinute = parseInt(timeParts[1], 10) || 0;

        const btn = card.querySelector('.btn-save-emp');
        try {
            btn.textContent = '...';
            btn.disabled = true;
            await Api.updateEmployee(parseInt(empId, 10), {
                email,
                schedule_enabled: scheduleEnabled,
                schedule_day: scheduleDay,
                schedule_hour: scheduleHour,
                schedule_minute: scheduleMinute
            });
            btn.textContent = 'OK';
            setTimeout(() => {
                btn.textContent = 'Sauver';
                btn.disabled = false;
            }, 1500);
        } catch (e) {
            btn.textContent = 'Erreur';
            btn.disabled = false;
            alert(e.message);
        }
    }

    // --- Email logs ---
    async function loadEmailLogs() {
        const container = document.getElementById('email-logs-list');
        try {
            const logs = await Api.getEmailLogs();
            if (logs.length === 0) {
                container.innerHTML = '<p class="empty-message">Aucun email envoyé pour le moment.</p>';
                return;
            }
            container.innerHTML = logs.map(log => {
                const date = log.sent_at ? new Date(log.sent_at).toLocaleString('fr-FR') : '';
                const statusClass = log.status === 'sent' ? 'sent' : 'failed';
                const statusText = log.status === 'sent' ? 'Envoyé' : 'Échec';
                const schedBadge = log.is_scheduled ? ' <span class="log-status scheduled">Auto</span>' : '';
                return `
                    <div class="email-log-item">
                        <div class="log-info">
                            <strong>${log.recipient_email}</strong> — ${log.filename}
                            <small>${date}${log.error_message ? ' — ' + log.error_message : ''}</small>
                        </div>
                        <div>
                            <span class="log-status ${statusClass}">${statusText}</span>
                            ${schedBadge}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            container.innerHTML = `<p class="error-message">${e.message}</p>`;
        }
    }

    // --- Send email modal ---
    function openEmailModal() {
        if (!lastGeneratedBlob || !lastGeneratedData) {
            alert('Veuillez d\'abord générer une fiche.');
            return;
        }

        const modal = document.getElementById('email-modal');
        const recipientInput = document.getElementById('modal-recipient');
        const infoEl = document.getElementById('modal-info');
        const statusEl = document.getElementById('modal-status');

        statusEl.style.display = 'none';
        infoEl.textContent = `Fiche : ${lastGeneratedFilename} — ${lastGeneratedData.agentNom}`;

        // Pré-remplir l'email si l'agent sélectionné en a un dans le backend
        recipientInput.value = '';

        modal.style.display = 'flex';
    }

    function closeEmailModal() {
        document.getElementById('email-modal').style.display = 'none';
    }

    async function handleSendEmail() {
        const recipientEmail = document.getElementById('modal-recipient').value.trim();
        const statusEl = document.getElementById('modal-status');
        const sendBtn = document.getElementById('btn-modal-send');

        if (!recipientEmail) {
            statusEl.textContent = 'Veuillez entrer une adresse email.';
            statusEl.className = 'status-message error';
            statusEl.style.display = 'block';
            return;
        }

        const file = new File([lastGeneratedBlob], lastGeneratedFilename, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        try {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Envoi en cours...';
            statusEl.textContent = 'Envoi en cours...';
            statusEl.className = 'status-message';
            statusEl.style.display = 'block';
            statusEl.style.background = '#fff3cd';
            statusEl.style.color = '#856404';

            const result = await Api.sendEmail(
                file,
                recipientEmail,
                lastGeneratedData.agentNom,
                lastGeneratedData.semaineDebut,
                lastGeneratedData.semaineFin
            );

            statusEl.textContent = result.message || 'Email envoyé avec succès !';
            statusEl.className = 'status-message success';
            statusEl.style.background = '';
            statusEl.style.color = '';

            setTimeout(() => closeEmailModal(), 2000);
        } catch (e) {
            statusEl.textContent = e.message;
            statusEl.className = 'status-message error';
            statusEl.style.background = '';
            statusEl.style.color = '';
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Envoyer';
        }
    }

    async function handleChangePassword() {
        const current = document.getElementById('current-password').value;
        const newPwd = document.getElementById('new-password').value;
        if (!current || !newPwd) {
            alert('Veuillez remplir les deux champs.');
            return;
        }
        try {
            await Api.changePassword(current, newPwd);
            alert('Mot de passe modifié avec succès.');
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
        } catch (e) {
            alert('Erreur : ' + e.message);
        }
    }

    // ===== INITIALISATION =====
    function init() {
        // Charger les données par défaut au premier lancement
        Storage.initDefaults();

        initTabs();

        // Sélection de la semaine
        document.getElementById('semaine-debut').addEventListener('change', buildDaysUI);

        // Sélection d'un agent
        document.getElementById('agent-select').addEventListener('change', handleAgentSelect);

        // Boutons principaux
        document.getElementById('btn-generer').addEventListener('click', handleGenerate);
        document.getElementById('btn-reinitialiser').addEventListener('click', handleReset);

        // Remplissage aléatoire
        document.getElementById('btn-random-fill').addEventListener('click', handleRandomFill);

        // Agents
        document.getElementById('btn-add-agent').addEventListener('click', handleAddAgent);
        renderAgentsList();
        refreshAgentSelect();

        // Modèles
        document.getElementById('btn-add-template').addEventListener('click', handleAddTemplate);
        renderTemplatesList();

        // Matrice
        renderMatrix();

        // Logo
        document.getElementById('logo-upload').addEventListener('change', handleLogoUpload);
        document.getElementById('btn-remove-logo').addEventListener('click', handleRemoveLogo);
        initLogo();

        // Historique
        renderHistory();

        // === Email & Auth ===
        document.getElementById('btn-login').addEventListener('click', handleLogin);
        document.getElementById('login-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        document.getElementById('btn-logout').addEventListener('click', handleLogout);

        // SMTP
        document.getElementById('btn-save-smtp').addEventListener('click', handleSaveSmtp);
        document.getElementById('btn-test-smtp').addEventListener('click', handleTestSmtp);

        // Sync & employees
        document.getElementById('btn-sync-data').addEventListener('click', handleSyncData);
        document.getElementById('btn-refresh-logs').addEventListener('click', loadEmailLogs);

        // Email modal
        document.getElementById('btn-envoyer-email').addEventListener('click', openEmailModal);
        document.getElementById('btn-modal-send').addEventListener('click', handleSendEmail);
        document.getElementById('btn-modal-cancel').addEventListener('click', closeEmailModal);
        document.querySelector('.modal-overlay').addEventListener('click', closeEmailModal);

        // Change password
        document.getElementById('btn-change-password').addEventListener('click', handleChangePassword);

        // Vérifier l'auth au démarrage
        checkAuthStatus();
    }

    // Lancer l'application au chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
