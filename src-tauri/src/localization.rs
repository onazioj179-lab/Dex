// =============================================================================
// DEX 6.0 — Localization / i18n (Tauri port of src/main/core/LocalizationManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed locale preference (i18n:* channels). The Electron manager keeps
//! the active locale in its own one-row `locale_settings` table (id=1) inside
//! `dex-core.db`; since dispatch() is a pure stateless function, we read and
//! write that same `locale_settings` row directly on every call, which yields
//! identical results to the renderer. The translation catalogs (EN/ES/FR/DE/JA/
//! ZH/AR), the SUPPORTED_LOCALES list, and the per-locale direction are bundled
//! constants embedded verbatim from the TS, so `get-strings`, `translate`,
//! `get-supported-locales`, `get-direction`, and `get-locale` are ported
//! faithfully with no disk/bundle file loading required.
//!
//! The three formatting channels (`format-number`, `format-date`,
//! `format-relative-time`) rely on the JS `Intl` ICU APIs for locale-aware
//! output. `format-number` and `format-relative-time` each have a deterministic
//! non-Intl fallback in the TS (the `catch` branch) that we reproduce exactly.
//! `format-date`'s fallback is `Date.prototype.toLocaleDateString()`, an OS/ICU
//! locale-dependent string with no rusqlite/serde_json equivalent, so it
//! degrades honestly (see the handler comment) rather than fabricate a format.

use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};

// -----------------------------------------------------------------------------
// Bundled locale data — embedded verbatim from LocalizationManager.ts.
// -----------------------------------------------------------------------------

/// (code, name, nativeName, direction) — matches SUPPORTED_LOCALES in order.
const SUPPORTED_LOCALES: &[(&str, &str, &str, &str)] = &[
    ("en", "English", "English", "ltr"),
    ("es", "Spanish", "Espanol", "ltr"),
    ("fr", "French", "Francais", "ltr"),
    ("de", "German", "Deutsch", "ltr"),
    ("ja", "Japanese", "\u{65E5}\u{672C}\u{8A9E}", "ltr"),
    ("zh", "Simplified Chinese", "\u{7B80}\u{4F53}\u{4E2D}\u{6587}", "ltr"),
    ("ar", "Arabic", "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}", "rtl"),
];

const EN_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "Your complete desktop environment"),
    ("nav.home", "Home"),
    ("nav.notes", "Notes"),
    ("nav.tasks", "Tasks"),
    ("nav.media", "Media Library"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "Automation"),
    ("nav.settings", "Settings"),
    ("nav.search", "Search"),
    ("nav.help", "Help"),
    ("action.save", "Save"),
    ("action.cancel", "Cancel"),
    ("action.delete", "Delete"),
    ("action.create", "Create"),
    ("action.edit", "Edit"),
    ("action.close", "Close"),
    ("action.confirm", "Confirm"),
    ("action.undo", "Undo"),
    ("action.redo", "Redo"),
    ("action.search", "Search"),
    ("action.import", "Import"),
    ("action.export", "Export"),
    ("action.copy", "Copy"),
    ("action.paste", "Paste"),
    ("action.cut", "Cut"),
    ("action.select_all", "Select all"),
    ("action.retry", "Retry"),
    ("action.back", "Back"),
    ("action.forward", "Forward"),
    ("action.refresh", "Refresh"),
    ("action.open", "Open"),
    ("action.duplicate", "Duplicate"),
    ("action.rename", "Rename"),
    ("action.move", "Move"),
    ("action.pin", "Pin"),
    ("action.unpin", "Unpin"),
    ("action.archive", "Archive"),
    ("action.restore", "Restore"),
    ("notes.new_note", "New note"),
    ("notes.new_folder", "New folder"),
    ("notes.all_notes", "All notes"),
    ("notes.search_placeholder", "Search notes..."),
    ("notes.no_notes", "Your notes will appear here. Create your first note to get started."),
    ("notes.folder_empty", "This folder is empty. Create a note or drag one here."),
    ("notes.untitled", "Untitled"),
    ("notes.daily_note", "Daily note"),
    ("notes.templates", "Templates"),
    ("notes.tags", "Tags"),
    ("notes.attachments", "Attachments"),
    ("notes.word_count", "Words"),
    ("notes.last_edited", "Last edited"),
    ("notes.created", "Created"),
    ("notes.pinned", "Pinned"),
    ("tasks.new_task", "New task"),
    ("tasks.no_tasks", "No tasks yet. Create your first task to start tracking your work."),
    ("tasks.board_empty", "This board has no cards. Add a card to get started."),
    ("tasks.due_date", "Due date"),
    ("tasks.priority", "Priority"),
    ("tasks.completed", "Completed"),
    ("tasks.overdue", "Overdue"),
    ("media.no_files", "No media files yet. Import files to add them to your library."),
    ("media.import_files", "Import files"),
    ("media.size", "Size"),
    ("media.type", "Type"),
    ("media.date_added", "Date added"),
    ("search.no_results", "No results found for your search. Try different keywords or check your filters."),
    ("search.placeholder", "Search everything..."),
    ("notifications.empty", "You are all caught up. Notifications will appear here."),
    ("recycle.empty", "The recycle bin is empty."),
    ("versions.empty", "No versions saved yet. Versions are created automatically as you work."),
    ("tags.empty", "No tags yet. Add tags to your items to organize them here."),
    ("activity.empty", "No activity yet today. Your actions across all apps will appear here."),
    ("settings.general", "General"),
    ("settings.privacy", "Privacy"),
    ("settings.license", "License"),
    ("settings.backup", "Backup and Restore"),
    ("settings.accessibility", "Accessibility"),
    ("settings.advanced", "Advanced"),
    ("settings.about", "About"),
    ("settings.language", "Language"),
    ("settings.theme", "Theme"),
    ("settings.startup", "Launch on startup"),
    ("license.free", "Free"),
    ("license.pro", "Pro"),
    ("license.team", "Team"),
    ("license.trial_active", "Trial active"),
    ("license.trial_expires", "Trial expires in {days} days"),
    ("license.activate", "Activate license"),
    ("license.deactivate", "Deactivate"),
    ("license.enter_key", "Enter license key"),
    ("backup.create", "Create backup now"),
    ("backup.restore", "Restore"),
    ("backup.verify", "Verify"),
    ("backup.delete", "Delete backup"),
    ("backup.automatic", "Automatic"),
    ("backup.manual", "Manual"),
    ("backup.pre_update", "Pre-update"),
    ("backup.pre_restore", "Pre-restore"),
    ("help.title", "Help"),
    ("help.search_placeholder", "Search help..."),
    ("help.was_helpful", "Was this helpful?"),
    ("help.shortcuts", "Keyboard shortcuts"),
    ("help.whats_new", "What is new"),
    ("help.getting_started", "Getting started"),
    ("help.changelog", "Changelog"),
    ("error.database", "DEX could not load your data. Try restarting DEX. If the problem continues run the health check in settings."),
    ("error.file_not_found", "The file this item referenced could not be found. It may have been moved or deleted."),
    ("error.permission", "DEX does not have permission to access this location. Check your system permissions."),
    ("error.network", "DEX could not reach the required service. Check your network connection and try again."),
    ("error.corruption", "This item appears to be corrupted. You can restore it from version history or delete it."),
    ("error.unknown", "Something went wrong. DEX has logged the details. You can view them in settings under diagnostics."),
    ("loading.generic", "Loading..."),
    ("loading.notes", "Loading notes..."),
    ("loading.tasks", "Loading tasks..."),
    ("loading.media", "Loading media..."),
    ("time.just_now", "Just now"),
    ("time.minutes_ago", "{count} minutes ago"),
    ("time.hours_ago", "{count} hours ago"),
    ("time.days_ago", "{count} days ago"),
    ("time.today", "Today"),
    ("time.yesterday", "Yesterday"),
    ("health.title", "Health Check"),
    ("health.run", "Run health check"),
    ("health.pass", "Pass"),
    ("health.warning", "Warning"),
    ("health.fail", "Fail"),
    ("health.repair", "Repair"),
    ("import.title", "Import Data"),
    ("import.select_source", "Select source"),
    ("import.preview", "Preview"),
    ("import.importing", "Importing..."),
    ("import.complete", "Import complete"),
    ("uninstall.title", "Remove DEX"),
    ("uninstall.keep_data", "Keep my data"),
    ("uninstall.remove_all", "Remove everything"),
    ("uninstall.confirm", "Type confirm to proceed"),
    ("telemetry.title", "Help improve DEX"),
    ("telemetry.description", "Share anonymous usage data to help improve DEX. We collect only app usage statistics: which inner apps are used, approximate session duration, feature usage counts, and crash reports. We never collect note content, task content, file names, paths, clipboard content, or any personally identifiable information."),
    ("telemetry.accept", "Share usage data"),
    ("telemetry.decline", "No thanks"),
];

const ES_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "Tu entorno de escritorio completo"),
    ("nav.home", "Inicio"),
    ("nav.notes", "Notas"),
    ("nav.tasks", "Tareas"),
    ("nav.media", "Biblioteca multimedia"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "Automatizacion"),
    ("nav.settings", "Configuracion"),
    ("nav.search", "Buscar"),
    ("nav.help", "Ayuda"),
    ("action.save", "Guardar"),
    ("action.cancel", "Cancelar"),
    ("action.delete", "Eliminar"),
    ("action.create", "Crear"),
    ("action.edit", "Editar"),
    ("action.close", "Cerrar"),
    ("action.confirm", "Confirmar"),
    ("action.undo", "Deshacer"),
    ("action.redo", "Rehacer"),
    ("action.search", "Buscar"),
    ("action.import", "Importar"),
    ("action.export", "Exportar"),
    ("action.copy", "Copiar"),
    ("action.paste", "Pegar"),
    ("action.cut", "Cortar"),
    ("action.select_all", "Seleccionar todo"),
    ("action.retry", "Reintentar"),
    ("action.back", "Atras"),
    ("action.forward", "Adelante"),
    ("action.refresh", "Actualizar"),
    ("action.open", "Abrir"),
    ("action.duplicate", "Duplicar"),
    ("action.rename", "Renombrar"),
    ("action.move", "Mover"),
    ("action.pin", "Fijar"),
    ("action.unpin", "Desfijar"),
    ("action.archive", "Archivar"),
    ("action.restore", "Restaurar"),
    ("notes.new_note", "Nueva nota"),
    ("notes.new_folder", "Nueva carpeta"),
    ("notes.all_notes", "Todas las notas"),
    ("notes.search_placeholder", "Buscar notas..."),
    ("notes.no_notes", "Tus notas apareceran aqui. Crea tu primera nota para empezar."),
    ("notes.folder_empty", "Esta carpeta esta vacia. Crea una nota o arrastra una aqui."),
    ("notes.untitled", "Sin titulo"),
    ("notes.daily_note", "Nota diaria"),
    ("notes.templates", "Plantillas"),
    ("notes.tags", "Etiquetas"),
    ("notes.attachments", "Adjuntos"),
    ("notes.word_count", "Palabras"),
    ("notes.last_edited", "Ultima edicion"),
    ("notes.created", "Creado"),
    ("notes.pinned", "Fijado"),
    ("tasks.new_task", "Nueva tarea"),
    ("tasks.no_tasks", "Sin tareas todavia. Crea tu primera tarea para empezar a registrar tu trabajo."),
    ("tasks.board_empty", "Este tablero no tiene tarjetas. Agrega una tarjeta para empezar."),
    ("tasks.due_date", "Fecha de vencimiento"),
    ("tasks.priority", "Prioridad"),
    ("tasks.completed", "Completado"),
    ("tasks.overdue", "Vencido"),
    ("media.no_files", "Sin archivos multimedia todavia. Importa archivos para agregarlos a tu biblioteca."),
    ("media.import_files", "Importar archivos"),
    ("search.no_results", "No se encontraron resultados para tu busqueda. Prueba con diferentes palabras clave."),
    ("error.database", "DEX no pudo cargar tus datos. Intenta reiniciar DEX. Si el problema continua ejecuta la verificacion de estado en configuracion."),
    ("error.unknown", "Algo salio mal. DEX ha registrado los detalles. Puedes verlos en configuracion bajo diagnosticos."),
    ("loading.generic", "Cargando..."),
    ("telemetry.title", "Ayuda a mejorar DEX"),
    ("telemetry.accept", "Compartir datos de uso"),
    ("telemetry.decline", "No gracias"),
];

const FR_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "Votre environnement de bureau complet"),
    ("nav.home", "Accueil"),
    ("nav.notes", "Notes"),
    ("nav.tasks", "Taches"),
    ("nav.media", "Mediatheque"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "Automatisation"),
    ("nav.settings", "Parametres"),
    ("nav.search", "Rechercher"),
    ("nav.help", "Aide"),
    ("action.save", "Enregistrer"),
    ("action.cancel", "Annuler"),
    ("action.delete", "Supprimer"),
    ("action.create", "Creer"),
    ("action.edit", "Modifier"),
    ("action.close", "Fermer"),
    ("action.confirm", "Confirmer"),
    ("action.undo", "Annuler"),
    ("action.redo", "Retablir"),
    ("action.search", "Rechercher"),
    ("action.import", "Importer"),
    ("action.export", "Exporter"),
    ("action.copy", "Copier"),
    ("action.paste", "Coller"),
    ("action.cut", "Couper"),
    ("action.select_all", "Tout selectionner"),
    ("action.retry", "Reessayer"),
    ("action.back", "Retour"),
    ("action.forward", "Avancer"),
    ("action.open", "Ouvrir"),
    ("action.duplicate", "Dupliquer"),
    ("action.rename", "Renommer"),
    ("action.move", "Deplacer"),
    ("action.pin", "Epingler"),
    ("action.unpin", "Desepingler"),
    ("action.archive", "Archiver"),
    ("action.restore", "Restaurer"),
    ("notes.new_note", "Nouvelle note"),
    ("notes.new_folder", "Nouveau dossier"),
    ("notes.all_notes", "Toutes les notes"),
    ("notes.search_placeholder", "Rechercher dans les notes..."),
    ("notes.no_notes", "Vos notes apparaitront ici. Creez votre premiere note pour commencer."),
    ("notes.folder_empty", "Ce dossier est vide. Creez une note ou glissez en une ici."),
    ("notes.untitled", "Sans titre"),
    ("notes.daily_note", "Note quotidienne"),
    ("notes.templates", "Modeles"),
    ("notes.tags", "Etiquettes"),
    ("notes.attachments", "Pieces jointes"),
    ("notes.word_count", "Mots"),
    ("tasks.new_task", "Nouvelle tache"),
    ("tasks.no_tasks", "Pas encore de taches. Creez votre premiere tache pour commencer a suivre votre travail."),
    ("search.no_results", "Aucun resultat trouve pour votre recherche. Essayez des mots cles differents."),
    ("error.database", "DEX ne peut pas charger vos donnees. Essayez de redemarrer DEX."),
    ("loading.generic", "Chargement..."),
    ("telemetry.title", "Aidez a ameliorer DEX"),
    ("telemetry.accept", "Partager les donnees"),
    ("telemetry.decline", "Non merci"),
];

const DE_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "Ihre vollstaendige Desktopumgebung"),
    ("nav.home", "Startseite"),
    ("nav.notes", "Notizen"),
    ("nav.tasks", "Aufgaben"),
    ("nav.media", "Medienbibliothek"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "Automatisierung"),
    ("nav.settings", "Einstellungen"),
    ("nav.search", "Suchen"),
    ("nav.help", "Hilfe"),
    ("action.save", "Speichern"),
    ("action.cancel", "Abbrechen"),
    ("action.delete", "Loeschen"),
    ("action.create", "Erstellen"),
    ("action.edit", "Bearbeiten"),
    ("action.close", "Schliessen"),
    ("action.confirm", "Bestaetigen"),
    ("action.undo", "Rueckgaengig"),
    ("action.redo", "Wiederherstellen"),
    ("action.search", "Suchen"),
    ("action.import", "Importieren"),
    ("action.export", "Exportieren"),
    ("action.copy", "Kopieren"),
    ("action.paste", "Einfuegen"),
    ("action.cut", "Ausschneiden"),
    ("action.select_all", "Alles auswaehlen"),
    ("action.retry", "Erneut versuchen"),
    ("notes.new_note", "Neue Notiz"),
    ("notes.new_folder", "Neuer Ordner"),
    ("notes.all_notes", "Alle Notizen"),
    ("notes.search_placeholder", "Notizen durchsuchen..."),
    ("notes.no_notes", "Ihre Notizen erscheinen hier. Erstellen Sie Ihre erste Notiz."),
    ("notes.untitled", "Ohne Titel"),
    ("tasks.new_task", "Neue Aufgabe"),
    ("tasks.no_tasks", "Noch keine Aufgaben. Erstellen Sie Ihre erste Aufgabe."),
    ("search.no_results", "Keine Ergebnisse gefunden. Versuchen Sie andere Suchbegriffe."),
    ("error.database", "DEX konnte Ihre Daten nicht laden. Versuchen Sie DEX neu zu starten."),
    ("loading.generic", "Wird geladen..."),
    ("telemetry.title", "Helfen Sie DEX zu verbessern"),
    ("telemetry.accept", "Nutzungsdaten teilen"),
    ("telemetry.decline", "Nein danke"),
];

const JA_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "\u{5B8C}\u{5168}\u{306A}\u{30C7}\u{30B9}\u{30AF}\u{30C8}\u{30C3}\u{30D7}\u{74B0}\u{5883}"),
    ("nav.home", "\u{30DB}\u{30FC}\u{30E0}"),
    ("nav.notes", "\u{30CE}\u{30FC}\u{30C8}"),
    ("nav.tasks", "\u{30BF}\u{30B9}\u{30AF}"),
    ("nav.media", "\u{30E1}\u{30C7}\u{30A3}\u{30A2}\u{30E9}\u{30A4}\u{30D6}\u{30E9}\u{30EA}"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "\u{30AA}\u{30FC}\u{30C8}\u{30E1}\u{30FC}\u{30B7}\u{30E7}\u{30F3}"),
    ("nav.settings", "\u{8A2D}\u{5B9A}"),
    ("nav.search", "\u{691C}\u{7D22}"),
    ("nav.help", "\u{30D8}\u{30EB}\u{30D7}"),
    ("action.save", "\u{4FDD}\u{5B58}"),
    ("action.cancel", "\u{30AD}\u{30E3}\u{30F3}\u{30BB}\u{30EB}"),
    ("action.delete", "\u{524A}\u{9664}"),
    ("action.create", "\u{4F5C}\u{6210}"),
    ("action.edit", "\u{7DE8}\u{96C6}"),
    ("action.close", "\u{9589}\u{3058}\u{308B}"),
    ("action.confirm", "\u{78BA}\u{8A8D}"),
    ("action.undo", "\u{5143}\u{306B}\u{623B}\u{3059}"),
    ("action.redo", "\u{3084}\u{308A}\u{76F4}\u{3059}"),
    ("action.search", "\u{691C}\u{7D22}"),
    ("action.import", "\u{30A4}\u{30F3}\u{30DD}\u{30FC}\u{30C8}"),
    ("action.export", "\u{30A8}\u{30AF}\u{30B9}\u{30DD}\u{30FC}\u{30C8}"),
    ("notes.new_note", "\u{65B0}\u{898F}\u{30CE}\u{30FC}\u{30C8}"),
    ("notes.new_folder", "\u{65B0}\u{898F}\u{30D5}\u{30A9}\u{30EB}\u{30C0}"),
    ("notes.all_notes", "\u{5168}\u{3066}\u{306E}\u{30CE}\u{30FC}\u{30C8}"),
    ("notes.search_placeholder", "\u{30CE}\u{30FC}\u{30C8}\u{3092}\u{691C}\u{7D22}\u{2026}"),
    ("notes.no_notes", "\u{30CE}\u{30FC}\u{30C8}\u{304C}\u{3053}\u{3053}\u{306B}\u{8868}\u{793A}\u{3055}\u{308C}\u{307E}\u{3059}\u{3002}\u{6700}\u{521D}\u{306E}\u{30CE}\u{30FC}\u{30C8}\u{3092}\u{4F5C}\u{6210}\u{3057}\u{3066}\u{304F}\u{3060}\u{3055}\u{3044}\u{3002}"),
    ("notes.untitled", "\u{7121}\u{984C}"),
    ("tasks.new_task", "\u{65B0}\u{898F}\u{30BF}\u{30B9}\u{30AF}"),
    ("tasks.no_tasks", "\u{30BF}\u{30B9}\u{30AF}\u{306F}\u{307E}\u{3060}\u{3042}\u{308A}\u{307E}\u{305B}\u{3093}\u{3002}\u{6700}\u{521D}\u{306E}\u{30BF}\u{30B9}\u{30AF}\u{3092}\u{4F5C}\u{6210}\u{3057}\u{3066}\u{304F}\u{3060}\u{3055}\u{3044}\u{3002}"),
    ("search.no_results", "\u{691C}\u{7D22}\u{7D50}\u{679C}\u{304C}\u{898B}\u{3064}\u{304B}\u{308A}\u{307E}\u{305B}\u{3093}\u{3002}\u{5225}\u{306E}\u{30AD}\u{30FC}\u{30EF}\u{30FC}\u{30C9}\u{3092}\u{304A}\u{8A66}\u{3057}\u{304F}\u{3060}\u{3055}\u{3044}\u{3002}"),
    ("error.database", "DEX\u{306F}\u{30C7}\u{30FC}\u{30BF}\u{3092}\u{8AAD}\u{307F}\u{8FBC}\u{3081}\u{307E}\u{305B}\u{3093}\u{3067}\u{3057}\u{305F}\u{3002}DEX\u{3092}\u{518D}\u{8D77}\u{52D5}\u{3057}\u{3066}\u{304F}\u{3060}\u{3055}\u{3044}\u{3002}"),
    ("loading.generic", "\u{8AAD}\u{307F}\u{8FBC}\u{307F}\u{4E2D}\u{2026}"),
    ("telemetry.title", "DEX\u{306E}\u{6539}\u{5584}\u{306B}\u{3054}\u{5354}\u{529B}\u{304F}\u{3060}\u{3055}\u{3044}"),
    ("telemetry.accept", "\u{4F7F}\u{7528}\u{30C7}\u{30FC}\u{30BF}\u{3092}\u{5171}\u{6709}"),
    ("telemetry.decline", "\u{3044}\u{3044}\u{3048}"),
];

const ZH_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "\u{60A8}\u{7684}\u{5B8C}\u{6574}\u{684C}\u{9762}\u{73AF}\u{5883}"),
    ("nav.home", "\u{9996}\u{9875}"),
    ("nav.notes", "\u{7B14}\u{8BB0}"),
    ("nav.tasks", "\u{4EFB}\u{52A1}"),
    ("nav.media", "\u{5A92}\u{4F53}\u{5E93}"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "\u{81EA}\u{52A8}\u{5316}"),
    ("nav.settings", "\u{8BBE}\u{7F6E}"),
    ("nav.search", "\u{641C}\u{7D22}"),
    ("nav.help", "\u{5E2E}\u{52A9}"),
    ("action.save", "\u{4FDD}\u{5B58}"),
    ("action.cancel", "\u{53D6}\u{6D88}"),
    ("action.delete", "\u{5220}\u{9664}"),
    ("action.create", "\u{521B}\u{5EFA}"),
    ("action.edit", "\u{7F16}\u{8F91}"),
    ("action.close", "\u{5173}\u{95ED}"),
    ("action.confirm", "\u{786E}\u{8BA4}"),
    ("action.undo", "\u{64A4}\u{9500}"),
    ("action.redo", "\u{91CD}\u{505A}"),
    ("action.search", "\u{641C}\u{7D22}"),
    ("action.import", "\u{5BFC}\u{5165}"),
    ("action.export", "\u{5BFC}\u{51FA}"),
    ("notes.new_note", "\u{65B0}\u{5EFA}\u{7B14}\u{8BB0}"),
    ("notes.new_folder", "\u{65B0}\u{5EFA}\u{6587}\u{4EF6}\u{5939}"),
    ("notes.all_notes", "\u{6240}\u{6709}\u{7B14}\u{8BB0}"),
    ("notes.search_placeholder", "\u{641C}\u{7D22}\u{7B14}\u{8BB0}\u{2026}"),
    ("notes.no_notes", "\u{60A8}\u{7684}\u{7B14}\u{8BB0}\u{5C06}\u{663E}\u{793A}\u{5728}\u{8FD9}\u{91CC}\u{3002}\u{521B}\u{5EFA}\u{7B2C}\u{4E00}\u{4E2A}\u{7B14}\u{8BB0}\u{5F00}\u{59CB}\u{5427}\u{3002}"),
    ("notes.untitled", "\u{65E0}\u{6807}\u{9898}"),
    ("tasks.new_task", "\u{65B0}\u{5EFA}\u{4EFB}\u{52A1}"),
    ("tasks.no_tasks", "\u{8FD8}\u{6CA1}\u{6709}\u{4EFB}\u{52A1}\u{3002}\u{521B}\u{5EFA}\u{7B2C}\u{4E00}\u{4E2A}\u{4EFB}\u{52A1}\u{5F00}\u{59CB}\u{8DDF}\u{8E2A}\u{60A8}\u{7684}\u{5DE5}\u{4F5C}\u{3002}"),
    ("search.no_results", "\u{672A}\u{627E}\u{5230}\u{641C}\u{7D22}\u{7ED3}\u{679C}\u{3002}\u{8BF7}\u{5C1D}\u{8BD5}\u{4E0D}\u{540C}\u{7684}\u{5173}\u{952E}\u{8BCD}\u{3002}"),
    ("error.database", "DEX\u{65E0}\u{6CD5}\u{52A0}\u{8F7D}\u{60A8}\u{7684}\u{6570}\u{636E}\u{3002}\u{8BF7}\u{5C1D}\u{8BD5}\u{91CD}\u{65B0}\u{542F}\u{52A8}DEX\u{3002}"),
    ("loading.generic", "\u{52A0}\u{8F7D}\u{4E2D}\u{2026}"),
    ("telemetry.title", "\u{5E2E}\u{52A9}\u{6539}\u{8FDB} DEX"),
    ("telemetry.accept", "\u{5206}\u{4EAB}\u{4F7F}\u{7528}\u{6570}\u{636E}"),
    ("telemetry.decline", "\u{4E0D}\u{4E86}"),
];

const AR_STRINGS: &[(&str, &str)] = &[
    ("app.name", "DEX"),
    ("app.tagline", "\u{0628}\u{064A}\u{0626}\u{0629} \u{0633}\u{0637}\u{062D} \u{0627}\u{0644}\u{0645}\u{0643}\u{062A}\u{0628} \u{0627}\u{0644}\u{0643}\u{0627}\u{0645}\u{0644}\u{0629}"),
    ("nav.home", "\u{0627}\u{0644}\u{0631}\u{0626}\u{064A}\u{0633}\u{064A}\u{0629}"),
    ("nav.notes", "\u{0627}\u{0644}\u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{0627}\u{062A}"),
    ("nav.tasks", "\u{0627}\u{0644}\u{0645}\u{0647}\u{0627}\u{0645}"),
    ("nav.media", "\u{0645}\u{0643}\u{062A}\u{0628}\u{0629} \u{0627}\u{0644}\u{0648}\u{0633}\u{0627}\u{0626}\u{0637}"),
    ("nav.vinx", "Vinx"),
    ("nav.automation", "\u{0627}\u{0644}\u{0623}\u{062A}\u{0645}\u{062A}\u{0629}"),
    ("nav.settings", "\u{0627}\u{0644}\u{0625}\u{0639}\u{062F}\u{0627}\u{062F}\u{0627}\u{062A}"),
    ("nav.search", "\u{0628}\u{062D}\u{062B}"),
    ("nav.help", "\u{0645}\u{0633}\u{0627}\u{0639}\u{062F}\u{0629}"),
    ("action.save", "\u{062D}\u{0641}\u{0638}"),
    ("action.cancel", "\u{0625}\u{0644}\u{063A}\u{0627}\u{0621}"),
    ("action.delete", "\u{062D}\u{0630}\u{0641}"),
    ("action.create", "\u{0625}\u{0646}\u{0634}\u{0627}\u{0621}"),
    ("action.edit", "\u{062A}\u{0639}\u{062F}\u{064A}\u{0644}"),
    ("action.close", "\u{0625}\u{063A}\u{0644}\u{0627}\u{0642}"),
    ("action.confirm", "\u{062A}\u{0623}\u{0643}\u{064A}\u{062F}"),
    ("action.undo", "\u{062A}\u{0631}\u{0627}\u{062C}\u{0639}"),
    ("action.redo", "\u{0625}\u{0639}\u{0627}\u{062F}\u{0629}"),
    ("action.search", "\u{0628}\u{062D}\u{062B}"),
    ("action.import", "\u{0627}\u{0633}\u{062A}\u{064A}\u{0631}\u{0627}\u{062F}"),
    ("action.export", "\u{062A}\u{0635}\u{062F}\u{064A}\u{0631}"),
    ("notes.new_note", "\u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{0629} \u{062C}\u{062F}\u{064A}\u{062F}\u{0629}"),
    ("notes.new_folder", "\u{0645}\u{062C}\u{0644}\u{062F} \u{062C}\u{062F}\u{064A}\u{062F}"),
    ("notes.all_notes", "\u{062C}\u{0645}\u{064A}\u{0639} \u{0627}\u{0644}\u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{0627}\u{062A}"),
    ("notes.search_placeholder", "\u{0628}\u{062D}\u{062B} \u{0641}\u{064A} \u{0627}\u{0644}\u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{0627}\u{062A}..."),
    ("notes.no_notes", "\u{0633}\u{062A}\u{0638}\u{0647}\u{0631} \u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{0627}\u{062A}\u{0643} \u{0647}\u{0646}\u{0627}. \u{0623}\u{0646}\u{0634}\u{0626} \u{0645}\u{0644}\u{0627}\u{062D}\u{0638}\u{062A}\u{0643} \u{0627}\u{0644}\u{0623}\u{0648}\u{0644}\u{0649} \u{0644}\u{0644}\u{0628}\u{062F}\u{0621}."),
    ("notes.untitled", "\u{0628}\u{062F}\u{0648}\u{0646} \u{0639}\u{0646}\u{0648}\u{0627}\u{0646}"),
    ("tasks.new_task", "\u{0645}\u{0647}\u{0645}\u{0629} \u{062C}\u{062F}\u{064A}\u{062F}\u{0629}"),
    ("tasks.no_tasks", "\u{0644}\u{0627} \u{062A}\u{0648}\u{062C}\u{062F} \u{0645}\u{0647}\u{0627}\u{0645} \u{0628}\u{0639}\u{062F}. \u{0623}\u{0646}\u{0634}\u{0626} \u{0645}\u{0647}\u{0645}\u{062A}\u{0643} \u{0627}\u{0644}\u{0623}\u{0648}\u{0644}\u{0649}."),
    ("search.no_results", "\u{0644}\u{0645} \u{064A}\u{062A}\u{0645} \u{0627}\u{0644}\u{0639}\u{062B}\u{0648}\u{0631} \u{0639}\u{0644}\u{0649} \u{0646}\u{062A}\u{0627}\u{0626}\u{062C}. \u{062C}\u{0631}\u{0628} \u{0643}\u{0644}\u{0645}\u{0627}\u{062A} \u{0645}\u{062E}\u{062A}\u{0644}\u{0641}\u{0629}."),
    ("error.database", "\u{062A}\u{0639}\u{0630}\u{0631} \u{0639}\u{0644}\u{0649} DEX \u{062A}\u{062D}\u{0645}\u{064A}\u{0644} \u{0628}\u{064A}\u{0627}\u{0646}\u{0627}\u{062A}\u{0643}. \u{062D}\u{0627}\u{0648}\u{0644} \u{0625}\u{0639}\u{0627}\u{062F}\u{0629} \u{062A}\u{0634}\u{063A}\u{064A}\u{0644} DEX."),
    ("loading.generic", "\u{062C}\u{0627}\u{0631}\u{064D} \u{0627}\u{0644}\u{062A}\u{062D}\u{0645}\u{064A}\u{0644}..."),
    ("telemetry.title", "\u{0633}\u{0627}\u{0639}\u{062F} \u{0641}\u{064A} \u{062A}\u{062D}\u{0633}\u{064A}\u{0646} DEX"),
    ("telemetry.accept", "\u{0645}\u{0634}\u{0627}\u{0631}\u{0643}\u{0629} \u{0628}\u{064A}\u{0627}\u{0646}\u{0627}\u{062A} \u{0627}\u{0644}\u{0627}\u{0633}\u{062A}\u{062E}\u{062F}\u{0627}\u{0645}"),
    ("telemetry.decline", "\u{0644}\u{0627} \u{0634}\u{0643}\u{0631}\u{0627}"),
];

/// ALL_STRINGS lookup: locale code -> its string table (matches ALL_STRINGS map).
fn strings_for(locale: &str) -> Option<&'static [(&'static str, &'static str)]> {
    match locale {
        "en" => Some(EN_STRINGS),
        "es" => Some(ES_STRINGS),
        "fr" => Some(FR_STRINGS),
        "de" => Some(DE_STRINGS),
        "ja" => Some(JA_STRINGS),
        "zh" => Some(ZH_STRINGS),
        "ar" => Some(AR_STRINGS),
        _ => None,
    }
}

// -----------------------------------------------------------------------------
// Schema — the manager's own one-row `locale_settings` table (id=1).
// -----------------------------------------------------------------------------

/// Create the locale_settings table and seed the id=1 row with 'en' when absent
/// (matches LocalizationManager.initialize: CREATE TABLE + INSERT default).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS locale_settings (
            id INTEGER PRIMARY KEY,
            locale TEXT DEFAULT 'en'
        );",
    );
    // Seed the default row only when it does not already exist (the TS inserts
    // 'en' when the SELECT returns no row).
    let _ = conn.execute(
        "INSERT OR IGNORE INTO locale_settings (id, locale) VALUES (1, 'en')",
        [],
    );
}

// -----------------------------------------------------------------------------
// Locale state, read from / written to the DB on each (stateless) call.
// -----------------------------------------------------------------------------

/// Current locale = locale_settings.locale for id=1, falling back to 'en' when
/// the row/DB is absent (matches the manager defaulting currentLocale to 'en').
fn get_current_locale(conn: &Connection) -> String {
    conn.query_row(
        "SELECT locale FROM locale_settings WHERE id = 1",
        [],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "en".to_string())
}

/// setLocale(locale): unsupported codes fall back to 'en', then the choice is
/// persisted to locale_settings (matches setLocale's validation + UPDATE).
fn set_locale(conn: &Connection, locale: &str) -> String {
    let resolved = if strings_for(locale).is_some() {
        locale.to_string()
    } else {
        "en".to_string()
    };
    let _ = conn.execute(
        "UPDATE locale_settings SET locale = ? WHERE id = 1",
        params![resolved],
    );
    resolved
}

/// t(key, params?): look up key in the active locale's table, then fall back to
/// the EN table, then to the raw key; finally substitute {placeholder} tokens.
/// Mirrors LocalizationManager.t exactly.
fn translate(conn: &Connection, key: &str, params_val: Option<&Value>) -> String {
    let locale = get_current_locale(conn);
    let lookup = |table: &[(&str, &str)]| -> Option<String> {
        table
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| (*v).to_string())
    };

    // strings[key] (active locale; the manager already coerces an unsupported
    // locale to 'en' on load, so an unknown code here behaves like 'en').
    let mut value = strings_for(&locale).and_then(lookup);
    // || EN_STRINGS[key]
    if value.is_none() {
        value = lookup(EN_STRINGS);
    }
    // !value -> return key
    let mut value = match value {
        Some(v) => v,
        None => return key.to_string(),
    };

    // params: replace every {k} occurrence with String(v).
    if let Some(Value::Object(map)) = params_val {
        for (k, v) in map {
            let replacement = json_scalar_to_string(v);
            value = value.replace(&format!("{{{}}}", k), &replacement);
        }
    }
    value
}

/// String(v) for a translation param value (number, string, bool, null).
fn json_scalar_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        // Objects/arrays are not expected for params; coerce via JSON text.
        other => other.to_string(),
    }
}

/// getAllStrings(): the active locale's table as a { key: value } object,
/// preserving declaration order (matches { ...this.strings }).
fn get_all_strings(conn: &Connection) -> Value {
    let locale = get_current_locale(conn);
    // An unsupported stored locale would have been coerced to 'en' on load.
    let table = strings_for(&locale).unwrap_or(EN_STRINGS);
    let mut map = Map::new();
    for (k, v) in table {
        map.insert((*k).to_string(), Value::String((*v).to_string()));
    }
    Value::Object(map)
}

/// getSupportedLocales(): the static [{ code, name, nativeName, direction }] list.
fn get_supported_locales() -> Value {
    let out: Vec<Value> = SUPPORTED_LOCALES
        .iter()
        .map(|(code, name, native, dir)| {
            json!({
                "code": code,
                "name": name,
                "nativeName": native,
                "direction": dir,
            })
        })
        .collect();
    json!(out)
}

/// getDirection(): the active locale's direction, defaulting to 'ltr'.
fn get_direction(conn: &Connection) -> Value {
    let locale = get_current_locale(conn);
    let dir = SUPPORTED_LOCALES
        .iter()
        .find(|(code, _, _, _)| *code == locale)
        .map(|(_, _, _, d)| *d)
        .unwrap_or("ltr");
    json!(dir)
}

/// formatRelativeTime(timestamp): reproduces the deterministic non-Intl `catch`
/// branch of the TS exactly (Intl.RelativeTimeFormat is unavailable here, which
/// is the same condition that triggers that fallback). Buckets: <60s just_now,
/// <60m minutes_ago, <24h hours_ago, else days_ago — all via translate().
fn format_relative_time(conn: &Connection, args: &Value) -> Value {
    let timestamp = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
    // now = Date.now() (ms); diff = now - timestamp.
    let now = current_millis();
    let diff = now - timestamp;
    let seconds = (diff as f64 / 1000.0).floor() as i64;
    let minutes = (seconds as f64 / 60.0).floor() as i64;
    let hours = (minutes as f64 / 60.0).floor() as i64;
    let days = (hours as f64 / 24.0).floor() as i64;

    let out = if seconds < 60 {
        translate(conn, "time.just_now", None)
    } else if minutes < 60 {
        translate(conn, "time.minutes_ago", Some(&json!({ "count": minutes })))
    } else if hours < 24 {
        translate(conn, "time.hours_ago", Some(&json!({ "count": hours })))
    } else {
        translate(conn, "time.days_ago", Some(&json!({ "count": days })))
    };
    json!(out)
}

/// Date.now() equivalent: milliseconds since the Unix epoch.
fn current_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // get-locale -> the current locale code string.
        "i18n:get-locale" => json!(get_current_locale(conn)),

        // set-locale(locale) -> always returns true in Electron (the validated
        // locale is persisted as a side effect).
        "i18n:set-locale" => {
            let locale = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let _ = set_locale(conn, locale);
            json!(true)
        }

        // get-strings -> { key: value } for the active locale.
        "i18n:get-strings" => get_all_strings(conn),

        // translate(key, params?) -> the resolved/substituted string.
        "i18n:translate" => {
            let key = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let params = args.get(1).filter(|v| v.is_object());
            json!(translate(conn, key, params))
        }

        // get-supported-locales -> LocaleInfo[].
        "i18n:get-supported-locales" => get_supported_locales(),

        // get-direction -> 'ltr' | 'rtl'.
        "i18n:get-direction" => get_direction(conn),

        // format-number(value, options?) -> string. Intl.NumberFormat is the
        // primary path in the TS; its `catch` fallback is `String(value)`.
        // Without ICU here we reproduce that exact fallback rather than fake
        // locale grouping/decimal rules. Numbers serialize like JS String(n)
        // for the integer/finite-decimal values this channel receives.
        "i18n:format-number" => {
            let value = args.get(0).cloned().unwrap_or(Value::Null);
            json!(json_scalar_to_string(&value))
        }

        // format-relative-time(timestamp) -> the non-Intl fallback, reproduced
        // exactly (translate()-based bucketing).
        "i18n:format-relative-time" => format_relative_time(conn, args),

        // format-date(timestamp, options?) opens no DB; under the TS it formats
        // via Intl.DateTimeFormat and, on failure, Date.prototype.
        // toLocaleDateString() — both ICU/OS-locale-dependent with no
        // rusqlite/serde_json equivalent. Degrade honestly rather than emit a
        // format that would not match Electron. The Tauri command layer should
        // wire a locale-aware date formatter if this output is needed.
        "i18n:format-date" => json!({
            "success": false,
            "error": "locale-aware date formatting (Intl/ICU) not available in DB layer (not ported)"
        }),

        _ => Value::Null,
    }
}
