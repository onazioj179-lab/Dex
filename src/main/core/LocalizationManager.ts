// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { app, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import log from 'electron-log';
import path from 'path';
import Database from '../native/safeSqlite';

type LocaleCode = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ar';

interface LocaleInfo {
  code: LocaleCode;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Espanol', direction: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Francais', direction: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '\u65E5\u672C\u8A9E', direction: 'ltr' },
  { code: 'zh', name: 'Simplified Chinese', nativeName: '\u7B80\u4F53\u4E2D\u6587', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', direction: 'rtl' }
];

type StringTable = Record<string, string>;

const EN_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': 'Your complete desktop environment',
  'nav.home': 'Home',
  'nav.notes': 'Notes',
  'nav.tasks': 'Tasks',
  'nav.media': 'Media Library',
  'nav.vinx': 'Vinx',
  'nav.automation': 'Automation',
  'nav.settings': 'Settings',
  'nav.search': 'Search',
  'nav.help': 'Help',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.delete': 'Delete',
  'action.create': 'Create',
  'action.edit': 'Edit',
  'action.close': 'Close',
  'action.confirm': 'Confirm',
  'action.undo': 'Undo',
  'action.redo': 'Redo',
  'action.search': 'Search',
  'action.import': 'Import',
  'action.export': 'Export',
  'action.copy': 'Copy',
  'action.paste': 'Paste',
  'action.cut': 'Cut',
  'action.select_all': 'Select all',
  'action.retry': 'Retry',
  'action.back': 'Back',
  'action.forward': 'Forward',
  'action.refresh': 'Refresh',
  'action.open': 'Open',
  'action.duplicate': 'Duplicate',
  'action.rename': 'Rename',
  'action.move': 'Move',
  'action.pin': 'Pin',
  'action.unpin': 'Unpin',
  'action.archive': 'Archive',
  'action.restore': 'Restore',
  'notes.new_note': 'New note',
  'notes.new_folder': 'New folder',
  'notes.all_notes': 'All notes',
  'notes.search_placeholder': 'Search notes...',
  'notes.no_notes': 'Your notes will appear here. Create your first note to get started.',
  'notes.folder_empty': 'This folder is empty. Create a note or drag one here.',
  'notes.untitled': 'Untitled',
  'notes.daily_note': 'Daily note',
  'notes.templates': 'Templates',
  'notes.tags': 'Tags',
  'notes.attachments': 'Attachments',
  'notes.word_count': 'Words',
  'notes.last_edited': 'Last edited',
  'notes.created': 'Created',
  'notes.pinned': 'Pinned',
  'tasks.new_task': 'New task',
  'tasks.no_tasks': 'No tasks yet. Create your first task to start tracking your work.',
  'tasks.board_empty': 'This board has no cards. Add a card to get started.',
  'tasks.due_date': 'Due date',
  'tasks.priority': 'Priority',
  'tasks.completed': 'Completed',
  'tasks.overdue': 'Overdue',
  'media.no_files': 'No media files yet. Import files to add them to your library.',
  'media.import_files': 'Import files',
  'media.size': 'Size',
  'media.type': 'Type',
  'media.date_added': 'Date added',
  'search.no_results': 'No results found for your search. Try different keywords or check your filters.',
  'search.placeholder': 'Search everything...',
  'notifications.empty': 'You are all caught up. Notifications will appear here.',
  'recycle.empty': 'The recycle bin is empty.',
  'versions.empty': 'No versions saved yet. Versions are created automatically as you work.',
  'tags.empty': 'No tags yet. Add tags to your items to organize them here.',
  'activity.empty': 'No activity yet today. Your actions across all apps will appear here.',
  'settings.general': 'General',
  'settings.privacy': 'Privacy',
  'settings.license': 'License',
  'settings.backup': 'Backup and Restore',
  'settings.accessibility': 'Accessibility',
  'settings.advanced': 'Advanced',
  'settings.about': 'About',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.startup': 'Launch on startup',
  'license.free': 'Free',
  'license.pro': 'Pro',
  'license.team': 'Team',
  'license.trial_active': 'Trial active',
  'license.trial_expires': 'Trial expires in {days} days',
  'license.activate': 'Activate license',
  'license.deactivate': 'Deactivate',
  'license.enter_key': 'Enter license key',
  'backup.create': 'Create backup now',
  'backup.restore': 'Restore',
  'backup.verify': 'Verify',
  'backup.delete': 'Delete backup',
  'backup.automatic': 'Automatic',
  'backup.manual': 'Manual',
  'backup.pre_update': 'Pre-update',
  'backup.pre_restore': 'Pre-restore',
  'help.title': 'Help',
  'help.search_placeholder': 'Search help...',
  'help.was_helpful': 'Was this helpful?',
  'help.shortcuts': 'Keyboard shortcuts',
  'help.whats_new': 'What is new',
  'help.getting_started': 'Getting started',
  'help.changelog': 'Changelog',
  'error.database': 'DEX could not load your data. Try restarting DEX. If the problem continues run the health check in settings.',
  'error.file_not_found': 'The file this item referenced could not be found. It may have been moved or deleted.',
  'error.permission': 'DEX does not have permission to access this location. Check your system permissions.',
  'error.network': 'DEX could not reach the required service. Check your network connection and try again.',
  'error.corruption': 'This item appears to be corrupted. You can restore it from version history or delete it.',
  'error.unknown': 'Something went wrong. DEX has logged the details. You can view them in settings under diagnostics.',
  'loading.generic': 'Loading...',
  'loading.notes': 'Loading notes...',
  'loading.tasks': 'Loading tasks...',
  'loading.media': 'Loading media...',
  'time.just_now': 'Just now',
  'time.minutes_ago': '{count} minutes ago',
  'time.hours_ago': '{count} hours ago',
  'time.days_ago': '{count} days ago',
  'time.today': 'Today',
  'time.yesterday': 'Yesterday',
  'health.title': 'Health Check',
  'health.run': 'Run health check',
  'health.pass': 'Pass',
  'health.warning': 'Warning',
  'health.fail': 'Fail',
  'health.repair': 'Repair',
  'import.title': 'Import Data',
  'import.select_source': 'Select source',
  'import.preview': 'Preview',
  'import.importing': 'Importing...',
  'import.complete': 'Import complete',
  'uninstall.title': 'Remove DEX',
  'uninstall.keep_data': 'Keep my data',
  'uninstall.remove_all': 'Remove everything',
  'uninstall.confirm': 'Type confirm to proceed',
  'telemetry.title': 'Help improve DEX',
  'telemetry.description': 'Share anonymous usage data to help improve DEX. We collect only app usage statistics: which inner apps are used, approximate session duration, feature usage counts, and crash reports. We never collect note content, task content, file names, paths, clipboard content, or any personally identifiable information.',
  'telemetry.accept': 'Share usage data',
  'telemetry.decline': 'No thanks'
};

const ES_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': 'Tu entorno de escritorio completo',
  'nav.home': 'Inicio',
  'nav.notes': 'Notas',
  'nav.tasks': 'Tareas',
  'nav.media': 'Biblioteca multimedia',
  'nav.vinx': 'Vinx',
  'nav.automation': 'Automatizacion',
  'nav.settings': 'Configuracion',
  'nav.search': 'Buscar',
  'nav.help': 'Ayuda',
  'action.save': 'Guardar',
  'action.cancel': 'Cancelar',
  'action.delete': 'Eliminar',
  'action.create': 'Crear',
  'action.edit': 'Editar',
  'action.close': 'Cerrar',
  'action.confirm': 'Confirmar',
  'action.undo': 'Deshacer',
  'action.redo': 'Rehacer',
  'action.search': 'Buscar',
  'action.import': 'Importar',
  'action.export': 'Exportar',
  'action.copy': 'Copiar',
  'action.paste': 'Pegar',
  'action.cut': 'Cortar',
  'action.select_all': 'Seleccionar todo',
  'action.retry': 'Reintentar',
  'action.back': 'Atras',
  'action.forward': 'Adelante',
  'action.refresh': 'Actualizar',
  'action.open': 'Abrir',
  'action.duplicate': 'Duplicar',
  'action.rename': 'Renombrar',
  'action.move': 'Mover',
  'action.pin': 'Fijar',
  'action.unpin': 'Desfijar',
  'action.archive': 'Archivar',
  'action.restore': 'Restaurar',
  'notes.new_note': 'Nueva nota',
  'notes.new_folder': 'Nueva carpeta',
  'notes.all_notes': 'Todas las notas',
  'notes.search_placeholder': 'Buscar notas...',
  'notes.no_notes': 'Tus notas apareceran aqui. Crea tu primera nota para empezar.',
  'notes.folder_empty': 'Esta carpeta esta vacia. Crea una nota o arrastra una aqui.',
  'notes.untitled': 'Sin titulo',
  'notes.daily_note': 'Nota diaria',
  'notes.templates': 'Plantillas',
  'notes.tags': 'Etiquetas',
  'notes.attachments': 'Adjuntos',
  'notes.word_count': 'Palabras',
  'notes.last_edited': 'Ultima edicion',
  'notes.created': 'Creado',
  'notes.pinned': 'Fijado',
  'tasks.new_task': 'Nueva tarea',
  'tasks.no_tasks': 'Sin tareas todavia. Crea tu primera tarea para empezar a registrar tu trabajo.',
  'tasks.board_empty': 'Este tablero no tiene tarjetas. Agrega una tarjeta para empezar.',
  'tasks.due_date': 'Fecha de vencimiento',
  'tasks.priority': 'Prioridad',
  'tasks.completed': 'Completado',
  'tasks.overdue': 'Vencido',
  'media.no_files': 'Sin archivos multimedia todavia. Importa archivos para agregarlos a tu biblioteca.',
  'media.import_files': 'Importar archivos',
  'search.no_results': 'No se encontraron resultados para tu busqueda. Prueba con diferentes palabras clave.',
  'error.database': 'DEX no pudo cargar tus datos. Intenta reiniciar DEX. Si el problema continua ejecuta la verificacion de estado en configuracion.',
  'error.unknown': 'Algo salio mal. DEX ha registrado los detalles. Puedes verlos en configuracion bajo diagnosticos.',
  'loading.generic': 'Cargando...',
  'telemetry.title': 'Ayuda a mejorar DEX',
  'telemetry.accept': 'Compartir datos de uso',
  'telemetry.decline': 'No gracias'
};

const FR_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': 'Votre environnement de bureau complet',
  'nav.home': 'Accueil',
  'nav.notes': 'Notes',
  'nav.tasks': 'Taches',
  'nav.media': 'Mediatheque',
  'nav.vinx': 'Vinx',
  'nav.automation': 'Automatisation',
  'nav.settings': 'Parametres',
  'nav.search': 'Rechercher',
  'nav.help': 'Aide',
  'action.save': 'Enregistrer',
  'action.cancel': 'Annuler',
  'action.delete': 'Supprimer',
  'action.create': 'Creer',
  'action.edit': 'Modifier',
  'action.close': 'Fermer',
  'action.confirm': 'Confirmer',
  'action.undo': 'Annuler',
  'action.redo': 'Retablir',
  'action.search': 'Rechercher',
  'action.import': 'Importer',
  'action.export': 'Exporter',
  'action.copy': 'Copier',
  'action.paste': 'Coller',
  'action.cut': 'Couper',
  'action.select_all': 'Tout selectionner',
  'action.retry': 'Reessayer',
  'action.back': 'Retour',
  'action.forward': 'Avancer',
  'action.open': 'Ouvrir',
  'action.duplicate': 'Dupliquer',
  'action.rename': 'Renommer',
  'action.move': 'Deplacer',
  'action.pin': 'Epingler',
  'action.unpin': 'Desepingler',
  'action.archive': 'Archiver',
  'action.restore': 'Restaurer',
  'notes.new_note': 'Nouvelle note',
  'notes.new_folder': 'Nouveau dossier',
  'notes.all_notes': 'Toutes les notes',
  'notes.search_placeholder': 'Rechercher dans les notes...',
  'notes.no_notes': 'Vos notes apparaitront ici. Creez votre premiere note pour commencer.',
  'notes.folder_empty': 'Ce dossier est vide. Creez une note ou glissez en une ici.',
  'notes.untitled': 'Sans titre',
  'notes.daily_note': 'Note quotidienne',
  'notes.templates': 'Modeles',
  'notes.tags': 'Etiquettes',
  'notes.attachments': 'Pieces jointes',
  'notes.word_count': 'Mots',
  'tasks.new_task': 'Nouvelle tache',
  'tasks.no_tasks': 'Pas encore de taches. Creez votre premiere tache pour commencer a suivre votre travail.',
  'search.no_results': 'Aucun resultat trouve pour votre recherche. Essayez des mots cles differents.',
  'error.database': 'DEX ne peut pas charger vos donnees. Essayez de redemarrer DEX.',
  'loading.generic': 'Chargement...',
  'telemetry.title': 'Aidez a ameliorer DEX',
  'telemetry.accept': 'Partager les donnees',
  'telemetry.decline': 'Non merci'
};

const DE_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': 'Ihre vollstaendige Desktopumgebung',
  'nav.home': 'Startseite',
  'nav.notes': 'Notizen',
  'nav.tasks': 'Aufgaben',
  'nav.media': 'Medienbibliothek',
  'nav.vinx': 'Vinx',
  'nav.automation': 'Automatisierung',
  'nav.settings': 'Einstellungen',
  'nav.search': 'Suchen',
  'nav.help': 'Hilfe',
  'action.save': 'Speichern',
  'action.cancel': 'Abbrechen',
  'action.delete': 'Loeschen',
  'action.create': 'Erstellen',
  'action.edit': 'Bearbeiten',
  'action.close': 'Schliessen',
  'action.confirm': 'Bestaetigen',
  'action.undo': 'Rueckgaengig',
  'action.redo': 'Wiederherstellen',
  'action.search': 'Suchen',
  'action.import': 'Importieren',
  'action.export': 'Exportieren',
  'action.copy': 'Kopieren',
  'action.paste': 'Einfuegen',
  'action.cut': 'Ausschneiden',
  'action.select_all': 'Alles auswaehlen',
  'action.retry': 'Erneut versuchen',
  'notes.new_note': 'Neue Notiz',
  'notes.new_folder': 'Neuer Ordner',
  'notes.all_notes': 'Alle Notizen',
  'notes.search_placeholder': 'Notizen durchsuchen...',
  'notes.no_notes': 'Ihre Notizen erscheinen hier. Erstellen Sie Ihre erste Notiz.',
  'notes.untitled': 'Ohne Titel',
  'tasks.new_task': 'Neue Aufgabe',
  'tasks.no_tasks': 'Noch keine Aufgaben. Erstellen Sie Ihre erste Aufgabe.',
  'search.no_results': 'Keine Ergebnisse gefunden. Versuchen Sie andere Suchbegriffe.',
  'error.database': 'DEX konnte Ihre Daten nicht laden. Versuchen Sie DEX neu zu starten.',
  'loading.generic': 'Wird geladen...',
  'telemetry.title': 'Helfen Sie DEX zu verbessern',
  'telemetry.accept': 'Nutzungsdaten teilen',
  'telemetry.decline': 'Nein danke'
};

const JA_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': '\u5B8C\u5168\u306A\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u74B0\u5883',
  'nav.home': '\u30DB\u30FC\u30E0',
  'nav.notes': '\u30CE\u30FC\u30C8',
  'nav.tasks': '\u30BF\u30B9\u30AF',
  'nav.media': '\u30E1\u30C7\u30A3\u30A2\u30E9\u30A4\u30D6\u30E9\u30EA',
  'nav.vinx': 'Vinx',
  'nav.automation': '\u30AA\u30FC\u30C8\u30E1\u30FC\u30B7\u30E7\u30F3',
  'nav.settings': '\u8A2D\u5B9A',
  'nav.search': '\u691C\u7D22',
  'nav.help': '\u30D8\u30EB\u30D7',
  'action.save': '\u4FDD\u5B58',
  'action.cancel': '\u30AD\u30E3\u30F3\u30BB\u30EB',
  'action.delete': '\u524A\u9664',
  'action.create': '\u4F5C\u6210',
  'action.edit': '\u7DE8\u96C6',
  'action.close': '\u9589\u3058\u308B',
  'action.confirm': '\u78BA\u8A8D',
  'action.undo': '\u5143\u306B\u623B\u3059',
  'action.redo': '\u3084\u308A\u76F4\u3059',
  'action.search': '\u691C\u7D22',
  'action.import': '\u30A4\u30F3\u30DD\u30FC\u30C8',
  'action.export': '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',
  'notes.new_note': '\u65B0\u898F\u30CE\u30FC\u30C8',
  'notes.new_folder': '\u65B0\u898F\u30D5\u30A9\u30EB\u30C0',
  'notes.all_notes': '\u5168\u3066\u306E\u30CE\u30FC\u30C8',
  'notes.search_placeholder': '\u30CE\u30FC\u30C8\u3092\u691C\u7D22\u2026',
  'notes.no_notes': '\u30CE\u30FC\u30C8\u304C\u3053\u3053\u306B\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u6700\u521D\u306E\u30CE\u30FC\u30C8\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
  'notes.untitled': '\u7121\u984C',
  'tasks.new_task': '\u65B0\u898F\u30BF\u30B9\u30AF',
  'tasks.no_tasks': '\u30BF\u30B9\u30AF\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u6700\u521D\u306E\u30BF\u30B9\u30AF\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
  'search.no_results': '\u691C\u7D22\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u5225\u306E\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002',
  'error.database': 'DEX\u306F\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002DEX\u3092\u518D\u8D77\u52D5\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
  'loading.generic': '\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026',
  'telemetry.title': 'DEX\u306E\u6539\u5584\u306B\u3054\u5354\u529B\u304F\u3060\u3055\u3044',
  'telemetry.accept': '\u4F7F\u7528\u30C7\u30FC\u30BF\u3092\u5171\u6709',
  'telemetry.decline': '\u3044\u3044\u3048'
};

const ZH_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': '\u60A8\u7684\u5B8C\u6574\u684C\u9762\u73AF\u5883',
  'nav.home': '\u9996\u9875',
  'nav.notes': '\u7B14\u8BB0',
  'nav.tasks': '\u4EFB\u52A1',
  'nav.media': '\u5A92\u4F53\u5E93',
  'nav.vinx': 'Vinx',
  'nav.automation': '\u81EA\u52A8\u5316',
  'nav.settings': '\u8BBE\u7F6E',
  'nav.search': '\u641C\u7D22',
  'nav.help': '\u5E2E\u52A9',
  'action.save': '\u4FDD\u5B58',
  'action.cancel': '\u53D6\u6D88',
  'action.delete': '\u5220\u9664',
  'action.create': '\u521B\u5EFA',
  'action.edit': '\u7F16\u8F91',
  'action.close': '\u5173\u95ED',
  'action.confirm': '\u786E\u8BA4',
  'action.undo': '\u64A4\u9500',
  'action.redo': '\u91CD\u505A',
  'action.search': '\u641C\u7D22',
  'action.import': '\u5BFC\u5165',
  'action.export': '\u5BFC\u51FA',
  'notes.new_note': '\u65B0\u5EFA\u7B14\u8BB0',
  'notes.new_folder': '\u65B0\u5EFA\u6587\u4EF6\u5939',
  'notes.all_notes': '\u6240\u6709\u7B14\u8BB0',
  'notes.search_placeholder': '\u641C\u7D22\u7B14\u8BB0\u2026',
  'notes.no_notes': '\u60A8\u7684\u7B14\u8BB0\u5C06\u663E\u793A\u5728\u8FD9\u91CC\u3002\u521B\u5EFA\u7B2C\u4E00\u4E2A\u7B14\u8BB0\u5F00\u59CB\u5427\u3002',
  'notes.untitled': '\u65E0\u6807\u9898',
  'tasks.new_task': '\u65B0\u5EFA\u4EFB\u52A1',
  'tasks.no_tasks': '\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002\u521B\u5EFA\u7B2C\u4E00\u4E2A\u4EFB\u52A1\u5F00\u59CB\u8DDF\u8E2A\u60A8\u7684\u5DE5\u4F5C\u3002',
  'search.no_results': '\u672A\u627E\u5230\u641C\u7D22\u7ED3\u679C\u3002\u8BF7\u5C1D\u8BD5\u4E0D\u540C\u7684\u5173\u952E\u8BCD\u3002',
  'error.database': 'DEX\u65E0\u6CD5\u52A0\u8F7D\u60A8\u7684\u6570\u636E\u3002\u8BF7\u5C1D\u8BD5\u91CD\u65B0\u542F\u52A8DEX\u3002',
  'loading.generic': '\u52A0\u8F7D\u4E2D\u2026',
  'telemetry.title': '\u5E2E\u52A9\u6539\u8FDB DEX',
  'telemetry.accept': '\u5206\u4EAB\u4F7F\u7528\u6570\u636E',
  'telemetry.decline': '\u4E0D\u4E86'
};

const AR_STRINGS: StringTable = {
  'app.name': 'DEX',
  'app.tagline': '\u0628\u064A\u0626\u0629 \u0633\u0637\u062D \u0627\u0644\u0645\u0643\u062A\u0628 \u0627\u0644\u0643\u0627\u0645\u0644\u0629',
  'nav.home': '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629',
  'nav.notes': '\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A',
  'nav.tasks': '\u0627\u0644\u0645\u0647\u0627\u0645',
  'nav.media': '\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0648\u0633\u0627\u0626\u0637',
  'nav.vinx': 'Vinx',
  'nav.automation': '\u0627\u0644\u0623\u062A\u0645\u062A\u0629',
  'nav.settings': '\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A',
  'nav.search': '\u0628\u062D\u062B',
  'nav.help': '\u0645\u0633\u0627\u0639\u062F\u0629',
  'action.save': '\u062D\u0641\u0638',
  'action.cancel': '\u0625\u0644\u063A\u0627\u0621',
  'action.delete': '\u062D\u0630\u0641',
  'action.create': '\u0625\u0646\u0634\u0627\u0621',
  'action.edit': '\u062A\u0639\u062F\u064A\u0644',
  'action.close': '\u0625\u063A\u0644\u0627\u0642',
  'action.confirm': '\u062A\u0623\u0643\u064A\u062F',
  'action.undo': '\u062A\u0631\u0627\u062C\u0639',
  'action.redo': '\u0625\u0639\u0627\u062F\u0629',
  'action.search': '\u0628\u062D\u062B',
  'action.import': '\u0627\u0633\u062A\u064A\u0631\u0627\u062F',
  'action.export': '\u062A\u0635\u062F\u064A\u0631',
  'notes.new_note': '\u0645\u0644\u0627\u062D\u0638\u0629 \u062C\u062F\u064A\u062F\u0629',
  'notes.new_folder': '\u0645\u062C\u0644\u062F \u062C\u062F\u064A\u062F',
  'notes.all_notes': '\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A',
  'notes.search_placeholder': '\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A...',
  'notes.no_notes': '\u0633\u062A\u0638\u0647\u0631 \u0645\u0644\u0627\u062D\u0638\u0627\u062A\u0643 \u0647\u0646\u0627. \u0623\u0646\u0634\u0626 \u0645\u0644\u0627\u062D\u0638\u062A\u0643 \u0627\u0644\u0623\u0648\u0644\u0649 \u0644\u0644\u0628\u062F\u0621.',
  'notes.untitled': '\u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646',
  'tasks.new_task': '\u0645\u0647\u0645\u0629 \u062C\u062F\u064A\u062F\u0629',
  'tasks.no_tasks': '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0647\u0627\u0645 \u0628\u0639\u062F. \u0623\u0646\u0634\u0626 \u0645\u0647\u0645\u062A\u0643 \u0627\u0644\u0623\u0648\u0644\u0649.',
  'search.no_results': '\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0646\u062A\u0627\u0626\u062C. \u062C\u0631\u0628 \u0643\u0644\u0645\u0627\u062A \u0645\u062E\u062A\u0644\u0641\u0629.',
  'error.database': '\u062A\u0639\u0630\u0631 \u0639\u0644\u0649 DEX \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A\u0643. \u062D\u0627\u0648\u0644 \u0625\u0639\u0627\u062F\u0629 \u062A\u0634\u063A\u064A\u0644 DEX.',
  'loading.generic': '\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644...',
  'telemetry.title': '\u0633\u0627\u0639\u062F \u0641\u064A \u062A\u062D\u0633\u064A\u0646 DEX',
  'telemetry.accept': '\u0645\u0634\u0627\u0631\u0643\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645',
  'telemetry.decline': '\u0644\u0627 \u0634\u0643\u0631\u0627'
};

const ALL_STRINGS: Record<LocaleCode, StringTable> = {
  en: EN_STRINGS,
  es: ES_STRINGS,
  fr: FR_STRINGS,
  de: DE_STRINGS,
  ja: JA_STRINGS,
  zh: ZH_STRINGS,
  ar: AR_STRINGS
};

export class LocalizationManager extends EventEmitter {
  private currentLocale: LocaleCode = 'en';
  private strings: StringTable = EN_STRINGS;
  private db: Database.Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'dex-core.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS locale_settings (
          id INTEGER PRIMARY KEY,
          locale TEXT DEFAULT 'en'
        );
      `);

      const row = this.db.prepare('SELECT locale FROM locale_settings WHERE id = 1').get() as any;
      if (row) {
        this.setLocale(row.locale as LocaleCode);
      } else {
        this.db.prepare('INSERT INTO locale_settings (id, locale) VALUES (1, ?)').run('en');
      }

      this.setupIPC();
      this.initialized = true;
      log.info('[LocalizationManager] Initialized with locale:', this.currentLocale);
    } catch (err) {
      log.error('[LocalizationManager] Initialization failed:', err);
    }
  }

  setLocale(locale: LocaleCode): void {
    if (!ALL_STRINGS[locale]) {
      log.warn('[LocalizationManager] Unsupported locale:', locale, '- falling back to en');
      locale = 'en';
    }
    this.currentLocale = locale;
    this.strings = ALL_STRINGS[locale];

    if (this.db) {
      this.db.prepare('UPDATE locale_settings SET locale = ? WHERE id = 1').run(locale);
    }

    this.emit('locale-changed', locale);
  }

  getLocale(): LocaleCode {
    return this.currentLocale;
  }

  t(key: string, params?: Record<string, string | number>): string {
    let value = this.strings[key];
    if (!value) {
      value = EN_STRINGS[key];
    }
    if (!value) {
      return key;
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return value;
  }

  getSupportedLocales(): LocaleInfo[] {
    return [...SUPPORTED_LOCALES];
  }

  getDirection(): 'ltr' | 'rtl' {
    const info = SUPPORTED_LOCALES.find(l => l.code === this.currentLocale);
    return info?.direction || 'ltr';
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    try {
      return new Intl.NumberFormat(this.currentLocale, options).format(value);
    } catch (_e) {
      return String(value);
    }
  }

  formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
    const d = typeof date === 'number' ? new Date(date) : date;
    try {
      return new Intl.DateTimeFormat(this.currentLocale, options).format(d);
    } catch (_e) {
      return d.toLocaleDateString();
    }
  }

  formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    try {
      const rtf = new Intl.RelativeTimeFormat(this.currentLocale, { numeric: 'auto' });
      if (seconds < 60) return rtf.format(-seconds, 'second');
      if (minutes < 60) return rtf.format(-minutes, 'minute');
      if (hours < 24) return rtf.format(-hours, 'hour');
      if (days < 30) return rtf.format(-days, 'day');
      return this.formatDate(timestamp, { dateStyle: 'medium' });
    } catch (_e) {
      if (seconds < 60) return this.t('time.just_now');
      if (minutes < 60) return this.t('time.minutes_ago', { count: minutes });
      if (hours < 24) return this.t('time.hours_ago', { count: hours });
      return this.t('time.days_ago', { count: days });
    }
  }

  getAllStrings(): StringTable {
    return { ...this.strings };
  }

  private setupIPC(): void {
    ipcMain.handle('i18n:get-locale', () => this.currentLocale);
    ipcMain.handle('i18n:set-locale', (_e, locale: string) => {
      this.setLocale(locale as LocaleCode);
      return true;
    });
    ipcMain.handle('i18n:get-strings', () => this.getAllStrings());
    ipcMain.handle('i18n:translate', (_e, key: string, params?: Record<string, string | number>) => {
      return this.t(key, params);
    });
    ipcMain.handle('i18n:get-supported-locales', () => this.getSupportedLocales());
    ipcMain.handle('i18n:get-direction', () => this.getDirection());
    ipcMain.handle('i18n:format-number', (_e, value: number, options?: Intl.NumberFormatOptions) => {
      return this.formatNumber(value, options);
    });
    ipcMain.handle('i18n:format-date', (_e, timestamp: number, options?: Intl.DateTimeFormatOptions) => {
      return this.formatDate(timestamp, options);
    });
    ipcMain.handle('i18n:format-relative-time', (_e, timestamp: number) => {
      return this.formatRelativeTime(timestamp);
    });
  }

  destroy(): void {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    log.info('[LocalizationManager] Destroyed');
  }
}

export const localizationManager = new LocalizationManager();
