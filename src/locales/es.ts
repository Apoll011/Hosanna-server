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
    subscription_required:
      "La organización no tiene una suscripción activa ni un período de prueba en curso. Solo se permite el acceso de lectura.",
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
    trial_started_title: "Período de prueba iniciado",
    trial_started_description:
      "Tu período de prueba gratuito ha comenzado. ¡Disfruta de todas las funciones de Hosanna!",
    trial_ended_title: "Período de prueba finalizado",
    trial_ended_description:
      "Tu período de prueba ha finalizado y tu suscripción ahora está activa.",
    trial_expired_title: "Período de prueba caducado",
    trial_expired_description:
      "Tu período de prueba caducó sin pago. Renueva tu suscripción para mantener el acceso.",
    subscribed_title: "Suscripción activa",
    subscribed_description:
      "Tu suscripción al plan {{plan}} ahora está activa.",
    canceled_title: "Suscripción cancelada",
    canceled_description:
      "Tu suscripción ha sido cancelada. El acceso permanecerá disponible hasta el final del período de facturación.",
  },

  // ── email templates ─────────────────────────────────────────────────────
  email: {
    footer: "© {{year}} Hosanna. Todos los derechos reservados.",
    welcome: {
      subject: "Bienvenido a Hosanna",
      heading: "Bienvenido a Hosanna{{#if first_name}}, {{first_name}}{{/if}}!",
      body1: "Estamos encantados de que te hayas unido a nuestra comunidad. Hosanna está diseñado para ayudarte a conectarte, participar y crecer con tu familia de fe.",
      body2: "Para empezar, puedes explorar tu panel de control o configurar tu perfil.",
      cta: "Ir al Panel de Control",
    },
    verify_email: {
      subject: "Verifica tu dirección de correo electrónico - Hosanna",
      heading: "Verifica tu dirección de correo electrónico",
      body1: "¡Gracias por registrarte en Hosanna! Por favor, haz clic en el botón de abajo para verificar tu dirección de correo electrónico y proteger tu cuenta.",
      cta: "Verificar Correo Electrónico",
      ignore: "Si no creaste una cuenta, puedes ignorar este correo de forma segura.",
    },
    forgot_password: {
      subject: "Restablece tu contraseña de Hosanna",
      heading: "Restablece tu contraseña",
      body1: "Recibimos una solicitud para restablecer la contraseña de tu cuenta Hosanna. Haz clic en el botón de abajo para elegir una nueva contraseña.",
      cta: "Restablecer Contraseña",
      expiry: "Este enlace caducará en {{expiry_time}} minutos. Si no solicitaste un restablecimiento de contraseña, no se requiere ninguna acción adicional.",
    },
    otp: {
      subject: "Tu código de verificación de Hosanna",
      heading: "Aquí está tu código de acceso a Hosanna:",
      expiry: "Este código caducará en {{expiry_time}} minutos. Si no solicitaste esto, puedes ignorar este correo.",
    },
    password_reset_success: {
      subject: "Contraseña actualizada con éxito - Hosanna",
      heading: "Contraseña actualizada con éxito",
      body1: "La contraseña de tu cuenta Hosanna ha sido cambiada con éxito.",
      body2: "Si no realizaste este cambio, por favor contacta a tu administrador o al soporte de Hosanna inmediatamente para proteger tu cuenta.",
    },
    account_locked: {
      subject: "Cuenta bloqueada temporalmente - Hosanna",
      heading: "Cuenta bloqueada temporalmente",
      body1: "Detectamos múltiples intentos fallidos de inicio de sesión en tu cuenta. Para proteger tu seguridad, tu cuenta ha sido bloqueada temporalmente.",
      body2: "Podrás intentar iniciar sesión de nuevo en {{lockout_minutes}} minutos.",
    },
    change_email_verification: {
      subject: "Verifica tu nueva dirección de correo electrónico - Hosanna",
      heading: "Verifica tu nueva dirección de correo electrónico",
      body1: "Recientemente solicitaste cambiar la dirección de correo electrónico asociada a tu cuenta Hosanna a {{new_email}}.",
      body2: "Por favor, haz clic en el botón de abajo para confirmar este cambio.",
      cta: "Aprobar Cambio de Correo Electrónico",
    },
    email_changed_success: {
      subject: "Dirección de correo electrónico actualizada - Hosanna",
      heading: "Dirección de correo electrónico actualizada",
      body1: "El correo electrónico de tu cuenta ha sido actualizado con éxito a {{new_email}}. Usarás este nuevo correo para iniciar sesión a partir de ahora.",
    },
    account_deleted: {
      subject: "Tu cuenta de Hosanna ha sido eliminada",
      heading: "Tu cuenta ha sido eliminada",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Confirmamos que tu cuenta Hosanna ha sido eliminada permanentemente según lo solicitado. Todos los datos asociados han sido eliminados de nuestros sistemas activos.",
      body2: "Lamentamos verte partir. Si alguna vez nos necesitas en el futuro, siempre serás bienvenido de vuelta.",
    },
    church_invitation: {
      subject: "Has sido invitado a unirte a una iglesia - Hosanna",
      heading: "Has sido invitado a {{church_name}}",
      body1: "{{inviter_name}} te ha invitado a unirte a su espacio de trabajo en Hosanna.",
      body2: "Únete a {{church_name}} para conectarte con tu comunidad, ver eventos y mantenerte al día.",
      cta: "Aceptar Invitación",
    },
    join_request_received: {
      subject: "Solicitud de unión recibida - Hosanna",
      heading: "Solicitud de unión recibida",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Tu solicitud para unirte a {{church_name}} ha sido recibida y está pendiente de aprobación del administrador.",
      body2: "Te notificaremos por correo electrónico en cuanto un administrador revise tu solicitud.",
    },
    join_request_approved: {
      subject: "¡Estás dentro! Solicitud de unión aprobada - Hosanna",
      heading: "¡Estás dentro! Solicitud aprobada",
      body1: "¡Buenas noticias! Tu solicitud para unirte a {{church_name}} ha sido aprobada por un administrador.",
      body2: "Ahora puedes acceder al espacio de trabajo, ver miembros y participar.",
      cta: "Unirse al Espacio de Trabajo",
    },
    join_request_denied: {
      subject: "Actualización sobre tu solicitud de unión - Hosanna",
      heading: "Actualización sobre tu solicitud de unión",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Tu solicitud para unirte a {{church_name}} no pudo ser aprobada en este momento.",
      body2: "Si crees que esto fue un error, por favor contacta directamente a la administración de la iglesia.",
    },
    promoted_to_admin: {
      subject: "Ahora eres Administrador - Hosanna",
      heading: "Ahora eres Administrador",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Tu rol en {{church_name}} ha sido actualizado. Ahora eres Administrador.",
      body2: "Ahora tienes acceso a la configuración del espacio de trabajo, gestión de miembros y herramientas administrativas.",
      cta: "Ver Panel de Administrador",
    },
    role_changed: {
      subject: "Tu rol ha sido actualizado - Hosanna",
      heading: "Tu rol ha sido actualizado",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Tu rol en {{church_name}} ha sido cambiado a {{new_role}}.",
      body2: "Si tienes alguna pregunta sobre este cambio, por favor contacta al administrador de tu espacio de trabajo.",
    },
    removed_from_church: {
      subject: "Acceso al espacio de trabajo eliminado - Hosanna",
      heading: "Acceso al espacio de trabajo eliminado",
      salutation: "Hola{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Has sido eliminado del espacio de trabajo de {{church_name}}. Ya no tendrás acceso al panel de esta comunidad ni a la información de los miembros.",
    },

    // ── 4. billing / subscription ─────────────────────────────────────────
    billing_trial_started: {
      subject: "Tu período de prueba ha comenzado - Hosanna",
      heading: "Tu período de prueba ha comenzado",
      body1: "Tu prueba gratuita del plan {{plan}} ahora está activa para {{church_name}}.",
      body2: "Explora todas las funciones de Hosanna durante tu período de prueba.",
    },
    billing_trial_ended: {
      subject: "Tu período de prueba ha finalizado - Hosanna",
      heading: "Tu período de prueba ha finalizado",
      body1: "El período de prueba de {{church_name}} ha finalizado y tu suscripción al plan {{plan}} ahora está activa.",
      body2: "Puedes gestionar tu suscripción desde la configuración del espacio de trabajo.",
    },
    billing_trial_expired: {
      subject: "Tu período de prueba ha caducado - Hosanna",
      heading: "Tu período de prueba ha caducado",
      body1: "El período de prueba de {{church_name}} caducó sin un método de pago válido.",
      body2: "Para mantener el acceso, renueva tu suscripción desde la configuración del espacio de trabajo.",
    },
    billing_subscribed: {
      subject: "Suscripción activa - Hosanna",
      heading: "Suscripción activa",
      body1: "La suscripción de {{church_name}} al plan {{plan}} ahora está activa.",
      body2: "¡Gracias por elegir Hosanna!",
    },
    billing_canceled: {
      subject: "Suscripción cancelada - Hosanna",
      heading: "Suscripción cancelada",
      body1: "La suscripción de {{church_name}} ha sido cancelada.",
      body2: "El acceso permanecerá disponible hasta el final del período de facturación. Si cambias de opinión, puedes reactivar la suscripción en cualquier momento.",
    },
  },
} as const satisfies I18nKeys;

export default es;
