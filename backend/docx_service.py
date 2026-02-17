"""
docx_service.py — Génération de fiches d'évaluation .docx côté serveur (python-docx)
Réplique la logique de js/docx-generator.js pour la génération automatique planifiée.
"""
import os
import random
import tempfile
from datetime import datetime, timedelta
from docx import Document
from docx.shared import Pt, Cm, Inches, Twips, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml


FONT_NAME = "Times New Roman"
FONT_SIZE_NORMAL = Pt(10)
FONT_SIZE_SMALL = Pt(9)
FONT_SIZE_TITLE = Pt(12)

MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]

OBSERVATIONS_POOL = ['RAS', 'Fait', 'En cours', 'Terminé', 'Validé']


def _format_date_fr(d):
    """Date → '12 février 2026'"""
    return f"{d.day} {MOIS_FR[d.month - 1]} {d.year}"


def _format_date_short(d):
    """Date → '12-02-2026'"""
    return d.strftime('%d-%m-%Y')


def _format_duration(total_minutes):
    """Minutes → '8h30min' ou '8h'"""
    h = total_minutes // 60
    m = total_minutes % 60
    if m == 0:
        return f"{h}h"
    return f"{h}h{m:02d}min"


def _set_cell_text(cell, text, bold=False, italic=False, size=None, align=WD_ALIGN_PARAGRAPH.CENTER):
    """Écrit du texte dans une cellule de tableau."""
    cell.paragraphs[0].alignment = align
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    run = cell.paragraphs[0].runs[0] if cell.paragraphs[0].runs else cell.paragraphs[0].add_run(text)
    if not cell.paragraphs[0].runs or run.text != text:
        cell.paragraphs[0].clear()
        run = cell.paragraphs[0].add_run(text)
    run.font.name = FONT_NAME
    run.font.size = size or FONT_SIZE_NORMAL
    run.font.bold = bold
    run.font.italic = italic
    # Ensure Times New Roman for East Asian text too
    run._element.rPr.rFonts.set(qn('w:eastAsia'), FONT_NAME)
    return run


def _add_paragraph_to_cell(cell, text, bold=False, italic=False, size=None, align=WD_ALIGN_PARAGRAPH.CENTER):
    """Ajoute un paragraphe supplémentaire dans une cellule."""
    p = cell.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(text)
    run.font.name = FONT_NAME
    run.font.size = size or FONT_SIZE_NORMAL
    run.font.bold = bold
    run.font.italic = italic
    return run


def _set_cell_shading(cell, color):
    """Applique une couleur de fond à une cellule."""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def _remove_cell_borders(cell):
    """Supprime les bordures d'une cellule."""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        '  <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '  <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '  <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '  <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '</w:tcBorders>'
    )
    tcPr.append(tcBorders)


def _merge_cells_in_row(table, row_idx, start_col, end_col):
    """Fusionne des cellules horizontalement."""
    row = table.rows[row_idx]
    row.cells[start_col].merge(row.cells[end_col])


def get_week_dates(reference_date=None):
    """
    Calcule les dates lundi-vendredi de la semaine en cours (ou semaine passée si on est lundi).
    """
    today = reference_date or datetime.now().date()
    # Si on est lundi, prendre la semaine passée
    if today.weekday() == 0:
        monday = today - timedelta(days=7)
    else:
        monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=i) for i in range(5)]


def get_cameroonian_holidays(year):
    """Retourne les jours fériés camerounais pour une année donnée."""
    holidays = {}

    # Fêtes fixes
    fixed = [
        (1, 1, "Nouvel An"),
        (2, 11, "Fête de la Jeunesse"),
        (5, 1, "Fête du Travail"),
        (5, 20, "Fête Nationale"),
        (8, 15, "Assomption"),
        (10, 1, "Fête de l'Unification"),
        (12, 25, "Noël"),
    ]
    for month, day, name in fixed:
        from datetime import date
        holidays[date(year, month, day)] = name

    # Pâques (algorithme de Meeus/Jones/Butcher)
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    from datetime import date
    easter = date(year, month, day)

    holidays[easter - timedelta(days=2)] = "Vendredi Saint"
    holidays[easter + timedelta(days=39)] = "Ascension"

    return holidays


def generate_fiche(employee, tasks, logo_path=None, lieu="Yaoundé",
                   min_hours=35, max_hours=45, min_act=1, max_act=3):
    """
    Génère une fiche d'évaluation hebdomadaire en .docx.

    Args:
        employee: dict avec nom, categorie, structure
        tasks: list de dict avec designation, taches
        logo_path: chemin vers le logo (optionnel)
        lieu: ville (défaut: Yaoundé)
        min_hours/max_hours: plage horaire cible
        min_act/max_act: nombre d'activités par jour

    Returns:
        str: chemin vers le fichier .docx généré
    """
    doc = Document()

    # === PAGE SETUP (Paysage A4) ===
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Twips(600)
    section.bottom_margin = Twips(800)
    section.left_margin = Twips(800)
    section.right_margin = Twips(800)

    week_dates = get_week_dates()
    monday = week_dates[0]
    friday = week_dates[4]
    holidays = get_cameroonian_holidays(monday.year)
    today = datetime.now().date()

    # === EN-TÊTE BILINGUE (tableau 3 colonnes sans bordures) ===
    header_table = doc.add_table(rows=1, cols=3)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Supprimer bordures du tableau d'en-tête
    for row in header_table.rows:
        for cell in row.cells:
            _remove_cell_borders(cell)

    # Colonne gauche — FR
    fr_cell = header_table.cell(0, 0)
    _set_cell_text(fr_cell, "REPUBLIQUE DU CAMEROUN", bold=True, size=FONT_SIZE_NORMAL)
    _add_paragraph_to_cell(fr_cell, "Paix – Travail – Patrie", italic=True, size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(fr_cell, "-------", size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(fr_cell, "AGENCE NATIONALE DES TECHNOLOGIES", bold=True, size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(fr_cell, "DE L'INFORMATION ET DE LA COMMUNICATION", bold=True, size=FONT_SIZE_SMALL)

    # Colonne centre — Logo
    center_cell = header_table.cell(0, 1)
    center_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    if logo_path and os.path.exists(logo_path):
        run = center_cell.paragraphs[0].add_run()
        run.add_picture(logo_path, width=Inches(1.0))

    # Colonne droite — EN
    en_cell = header_table.cell(0, 2)
    _set_cell_text(en_cell, "REPUBLIC OF CAMEROON", bold=True, size=FONT_SIZE_NORMAL)
    _add_paragraph_to_cell(en_cell, "Peace – Work – Fatherland", italic=True, size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(en_cell, "-------", size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(en_cell, "NATIONAL AGENCY FOR INFORMATION", bold=True, size=FONT_SIZE_SMALL)
    _add_paragraph_to_cell(en_cell, "AND COMMUNICATION TECHNOLOGY", bold=True, size=FONT_SIZE_SMALL)

    # === TITRE ===
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run("FICHE INDIVIDUELLE D'EVALUATION HEBDOMADAIRE DU PERSONNEL")
    run.font.name = FONT_NAME
    run.font.size = FONT_SIZE_TITLE
    run.font.bold = True
    run.font.underline = True

    # === DATE ET LIEU ===
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(f"{lieu}, le {_format_date_short(today)}")
    run.font.name = FONT_NAME
    run.font.size = FONT_SIZE_NORMAL

    # === INFOS AGENT ===
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    for label, value in [("Nom et Prénom : ", employee['nom']),
                          ("          Catégorie : ", employee.get('categorie', '')),
                          ("          Structure : ", employee.get('structure', ''))]:
        run = p.add_run(label)
        run.font.name = FONT_NAME
        run.font.size = FONT_SIZE_NORMAL
        run.font.bold = True
        run = p.add_run(value)
        run.font.name = FONT_NAME
        run.font.size = FONT_SIZE_NORMAL

    # === SEMAINE ===
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(f"Semaine du {_format_date_fr(monday)} au {_format_date_fr(friday)}")
    run.font.name = FONT_NAME
    run.font.size = FONT_SIZE_NORMAL
    run.font.bold = True

    # === GÉNÉRATION ALÉATOIRE DES ACTIVITÉS ===
    jour_names = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]
    days_data = []
    total_minutes = 0
    target_minutes = random.randint(min_hours * 60, max_hours * 60)

    # Compter les jours ouvrés (non fériés)
    work_days = []
    for i, d in enumerate(week_dates):
        if d in holidays:
            days_data.append({'ferie': True, 'ferie_name': holidays[d], 'activites': []})
        else:
            days_data.append({'ferie': False, 'ferie_name': None, 'activites': []})
            work_days.append(i)

    if work_days and tasks:
        # Répartir le temps entre les jours ouvrés
        minutes_per_day = target_minutes // len(work_days)
        remaining = target_minutes

        for idx, day_idx in enumerate(work_days):
            nb_act = random.randint(min_act, max_act)
            day_target = minutes_per_day if idx < len(work_days) - 1 else remaining

            acts = []
            act_remaining = day_target
            for a in range(nb_act):
                task = random.choice(tasks)
                if a == nb_act - 1:
                    duration = max(60, act_remaining)
                else:
                    duration = max(60, random.randint(60, max(61, act_remaining - (nb_act - a - 1) * 60)))
                    act_remaining -= duration

                acts.append({
                    'designation': task['designation'],
                    'taches': task['taches'],
                    'date_reception': _format_date_short(week_dates[day_idx]),
                    'duree_minutes': duration,
                    'observation': random.choice(OBSERVATIONS_POOL)
                })
                total_minutes += duration

            remaining -= sum(a['duree_minutes'] for a in acts)
            days_data[day_idx]['activites'] = acts

    # === TABLEAU PRINCIPAL ===
    col_headers = [
        "Jour", "Désignation du dossier\nou de l'activité",
        "Date de réception\nou de prise d'initiative",
        "Tâches réalisées",
        "Durée de traitement\nou de réalisation",
        "Appréciation du\nsupérieur hiérarchique",
        "Observations"
    ]

    # Compter le nombre total de lignes
    total_rows = 1  # header
    for dd in days_data:
        if dd['ferie']:
            total_rows += 1
        else:
            total_rows += max(1, len(dd['activites']))
    total_rows += 1  # volume horaire

    table = doc.add_table(rows=total_rows, cols=7)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'

    # En-tête du tableau
    for ci, header_text in enumerate(col_headers):
        cell = table.cell(0, ci)
        _set_cell_text(cell, header_text, bold=True, size=FONT_SIZE_SMALL)
        _set_cell_shading(cell, "D9E2F3")

    # Remplir les données
    current_row = 1
    for di, dd in enumerate(days_data):
        jour_name = jour_names[di]

        if dd['ferie']:
            cell = table.cell(current_row, 0)
            _set_cell_text(cell, jour_name, bold=True, size=FONT_SIZE_NORMAL)
            # Fusionner colonnes 1-6
            merged = table.cell(current_row, 1).merge(table.cell(current_row, 6))
            ferie_text = f"Férié ({dd['ferie_name']})" if dd['ferie_name'] else "Férié"
            _set_cell_text(merged, ferie_text, italic=True, size=FONT_SIZE_NORMAL)
            current_row += 1
        else:
            acts = dd['activites']
            nb_acts = max(1, len(acts))

            # Fusionner verticalement la colonne Jour si plusieurs activités
            if nb_acts > 1:
                jour_cell = table.cell(current_row, 0).merge(table.cell(current_row + nb_acts - 1, 0))
            else:
                jour_cell = table.cell(current_row, 0)
            _set_cell_text(jour_cell, jour_name, bold=True, size=FONT_SIZE_NORMAL)

            for ai in range(nb_acts):
                row_idx = current_row + ai
                if ai < len(acts):
                    act = acts[ai]
                    _set_cell_text(table.cell(row_idx, 1), act['designation'],
                                   size=FONT_SIZE_SMALL, align=WD_ALIGN_PARAGRAPH.LEFT)
                    _set_cell_text(table.cell(row_idx, 2), act['date_reception'], size=FONT_SIZE_SMALL)
                    _set_cell_text(table.cell(row_idx, 3), act['taches'],
                                   size=FONT_SIZE_SMALL, align=WD_ALIGN_PARAGRAPH.LEFT)
                    _set_cell_text(table.cell(row_idx, 4), _format_duration(act['duree_minutes']),
                                   size=FONT_SIZE_SMALL)
                    # Col 5 (appréciation) reste vide
                    _set_cell_text(table.cell(row_idx, 6), act.get('observation', ''),
                                   size=FONT_SIZE_SMALL, align=WD_ALIGN_PARAGRAPH.LEFT)

            current_row += nb_acts

    # === LIGNE VOLUME HORAIRE ===
    vol_row = total_rows - 1
    # Fusionner colonnes 0-3 pour le label
    merged_label = table.cell(vol_row, 0).merge(table.cell(vol_row, 3))
    _set_cell_text(merged_label, "Volume horaire :", bold=True,
                   size=FONT_SIZE_NORMAL, align=WD_ALIGN_PARAGRAPH.RIGHT)
    # Total dans la colonne Durée
    _set_cell_text(table.cell(vol_row, 4), _format_duration(total_minutes),
                   bold=True, size=FONT_SIZE_NORMAL)
    # Fusionner colonnes 5-6 (vides)
    table.cell(vol_row, 5).merge(table.cell(vol_row, 6))

    # === SIGNATURES (tableau 3 colonnes sans bordures) ===
    doc.add_paragraph()  # espace
    sig_table = doc.add_table(rows=1, cols=3)
    sig_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for cell in sig_table.rows[0].cells:
        _remove_cell_borders(cell)

    labels = [
        "APPRECIATION DU CHEF\nDE STRUCTURE :",
        "APPRECIATION DU SUPERIEUR\nHIERARCHIQUE :",
        "SIGNATURE DE L'INTERESSE"
    ]
    for ci, label in enumerate(labels):
        cell = sig_table.cell(0, ci)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        for line_idx, line in enumerate(label.split('\n')):
            if line_idx == 0:
                run = cell.paragraphs[0].add_run(line)
            else:
                p = cell.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(line)
            run.font.name = FONT_NAME
            run.font.size = FONT_SIZE_NORMAL
            run.font.bold = True
            run.font.underline = True

    # === PIED DE PAGE ===
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("NB : À TRANSMETTRE CHAQUE 1ER JOUR OUVRÉ DE LA SEMAINE À L'INSPECTION DES SERVICES")
    run.font.name = FONT_NAME
    run.font.size = FONT_SIZE_SMALL
    run.font.bold = True
    run.font.italic = True

    # === SAUVEGARDE ===
    filename = f"Fiche_{employee['nom'].replace(' ', '_')}_{monday.strftime('%Y-%m-%d')}_{friday.strftime('%Y-%m-%d')}.docx"
    filepath = os.path.join(tempfile.gettempdir(), filename)
    doc.save(filepath)

    return filepath, filename
