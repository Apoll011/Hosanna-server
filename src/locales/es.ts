import type { I18nKeys } from "./pt-PT.js";

/**
 * es-ES — Spanish locale.
 */
const es = {
  // ── errors / middleware ─────────────────────────────────────────────────
  error: {
    route_not_found: "Ninguna ruta coincide con {{method}} {{path}}",
    resource_not_found: "El recurso no existe.",
    duplicate_resource: "Ya existe un recurso con este valor único.",
    internal_error: "Ocurrió un error inesperado.",
    validation_failed: "Error en la validación de la solicitud.",
    unauthenticated: "No autenticado",
    missing_permission: "Permisos insuficientes",
    forbidden_default: "No tiene permiso para realizar esta acción.",
    unauthorized_session: "Sesión de autenticación inválida o ausente.",
    workspace_required:
      "Se requiere un contexto de espacio de trabajo/organización activo.",
    rate_limit_exceeded:
      "Demasiadas solicitudes. Por favor, inténtelo de nuevo más tarde.",
  },

  // ── conflict / optimistic concurrency ──────────────────────────────────
  conflict: {
    default:
      "El recurso fue modificado por otra persona. Recargue e inténtelo de nuevo.",
    song: "Esta canción fue modificada por otra persona desde la última vez que la cargó.",
    folder:
      "Esta carpeta fue modificada por otra persona desde la última vez que la cargó.",
    service:
      "Este culto fue modificado por otra persona desde la última vez que lo cargó.",
  },

  // ── songs ───────────────────────────────────────────────────────────────
  song: {
    not_found: "La canción no existe.",
    unknown_artist: "Artista Desconocido",
    varios: "Varios",
  },

  // ── folders ─────────────────────────────────────────────────────────────
  folder: {
    not_found: "La carpeta no existe.",
    deleted: "Carpeta eliminada",
  },

  // ── services ────────────────────────────────────────────────────────────
  service: {
    not_found: "El culto no existe.",
  },

  // ── settings ────────────────────────────────────────────────────────────
  settings: {
    not_found: "Configuración no inicializada para este tenant.",
  },

  // ── backup ──────────────────────────────────────────────────────────────
  backup: {
    restored_successfully: "Copia de seguridad restaurada con éxito",
    invalid_file: "Archivo de copia de seguridad inválido o dañado.",
    missing_arrays:
      "El archivo de copia de seguridad no contiene los arrays esperados.",
  },

  // ── notifications ───────────────────────────────────────────────────────
  notification: {
    new_member_title: "¡Se ha unido un nuevo miembro!",
    new_member_description: "{{name}} ahora forma parte de la organización",
    folder_deleted_title: "Carpeta eliminada con todo su contenido",
    folder_deleted_description:
      "{{songs}} canción(es) y {{folders}} subcarpeta(s) fueron eliminadas permanentemente.",
    backup_restored_title:
      "Copia de seguridad restaurada — todos los datos reemplazados",
    backup_restored_description:
      "Una restauración completa importó {{folders}} carpeta(s), {{songs}} canción(es) y {{services}} culto(s).",
    settings_changed_title: "Configuración de la organización actualizada",
    settings_changed_description:
      "Un administrador modificó una o más configuraciones del espacio de trabajo.",
  },
} as const satisfies I18nKeys;

export default es;
