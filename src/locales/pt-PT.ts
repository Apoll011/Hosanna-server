/**
 * pt-PT — canonical locale (source of truth).
 * All other locales must mirror this key structure exactly.
 */
const ptPT = {
  // ── errors / middleware ─────────────────────────────────────────────────
  error: {
    route_not_found: "Nenhuma rota corresponde a {{method}} {{path}}",
    resource_not_found: "O recurso não existe.",
    duplicate_resource: "Já existe um recurso com este valor único.",
    internal_error: "Ocorreu um erro inesperado.",
    validation_failed: "Validação do pedido falhou.",
    unauthenticated: "Não autenticado",
    missing_permission: "Permissão insuficiente",
    forbidden_default: "Não tem permissão para executar esta ação.",
    unauthorized_session: "Sessão de autenticação inválida ou ausente.",
    workspace_required:
      "É necessário um contexto de workspace/organização ativo.",
    rate_limit_exceeded:
      "Demasiados pedidos. Por favor, tente novamente mais tarde.",
  },

  // ── conflict / optimistic concurrency ──────────────────────────────────
  conflict: {
    default:
      "O recurso foi modificado por outra pessoa. Recarregue e tente novamente.",
    song: "Esta música foi modificada por outra pessoa desde a última vez que a carregou.",
    folder:
      "Esta pasta foi modificada por outra pessoa desde a última vez que a carregou.",
    service:
      "Este culto foi modificado por outra pessoa desde a última vez que o carregou.",
  },

  // ── songs ───────────────────────────────────────────────────────────────
  song: {
    not_found: "A música não existe.",
    unknown_artist: "Artista Desconhecido",
    varios: "Vários",
  },

  // ── folders ─────────────────────────────────────────────────────────────
  folder: {
    not_found: "A pasta não existe.",
    deleted: "Pasta eliminada",
  },

  // ── services ────────────────────────────────────────────────────────────
  service: {
    not_found: "O culto não existe.",
  },

  // ── settings ────────────────────────────────────────────────────────────
  settings: {
    not_found: "Definições não inicializadas para este tenant.",
  },

  // ── backup ──────────────────────────────────────────────────────────────
  backup: {
    restored_successfully: "Backup restaurado com sucesso",
    invalid_file: "Ficheiro de backup inválido ou corrompido.",
    missing_arrays: "O ficheiro de backup não contém os arrays esperados.",
  },

  // ── notifications ───────────────────────────────────────────────────────
  notification: {
    new_member_title: "Um novo membro entrou!",
    new_member_description: "{{name}} agora faz parte da organização",
    folder_deleted_title: "Pasta eliminada com todo o seu conteúdo",
    folder_deleted_description:
      "{{songs}} música(s) e {{folders}} sub-pasta(s) foram removidas permanentemente.",
    backup_restored_title: "Backup restaurado — todos os dados substituídos",
    backup_restored_description:
      "Uma restauração completa importou {{folders}} pasta(s), {{songs}} música(s) e {{services}} culto(s).",
    settings_changed_title: "Definições da organização atualizadas",
    settings_changed_description:
      "Um administrador alterou uma ou mais definições do workspace.",
  },
} as const;

type DeepWriteable<T> = {
  [K in keyof T]: T[K] extends object ? DeepWriteable<T[K]> : string;
};
export type I18nKeys = DeepWriteable<typeof ptPT>;
export default ptPT;
