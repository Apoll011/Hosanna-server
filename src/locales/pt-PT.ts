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
    trial_started_title: "Período de avaliação iniciado",
    trial_started_description:
      "O teu período de avaliação gratuito começou. Desfruta de todas as funcionalidades do Hosanna!",
    trial_ended_title: "Período de avaliação terminou",
    trial_ended_description:
      "O teu período de avaliação terminou e a tua subscrição está agora ativa.",
    trial_expired_title: "Período de avaliação expirou",
    trial_expired_description:
      "O teu período de avaliação expirou sem pagamento. Renova a tua subscrição para continuar a ter acesso.",
    subscribed_title: "Subscrição ativa",
    subscribed_description:
      "A tua subscrição ao plano {{plan}} está agora ativa.",
    canceled_title: "Subscrição cancelada",
    canceled_description:
      "A tua subscrição foi cancelada. O acesso continuará disponível até ao fim do período faturado.",
  },

  // ── email templates ─────────────────────────────────────────────────────
  email: {
    footer: "© {{year}} Hosanna. Todos os direitos reservados.",
    welcome: {
      subject: "Bem-vindo ao Hosanna",
      heading: "Bem-vindo ao Hosanna{{#if first_name}}, {{first_name}}{{/if}}!",
      body1: "Estamos muito felizes por te teres juntado à nossa comunidade. O Hosanna foi criado para te ajudar a ligar-te, envolver-te e crescer com a tua família de fé.",
      body2: "Para começar, podes explorar o teu painel ou configurar o teu perfil.",
      cta: "Ir para o Painel",
    },
    verify_email: {
      subject: "Verifica o teu endereço de e-mail - Hosanna",
      heading: "Verifica o teu endereço de e-mail",
      body1: "Obrigado por te registares no Hosanna! Por favor, clica no botão abaixo para verificar o teu endereço de e-mail e proteger a tua conta.",
      cta: "Verificar E-mail",
      ignore: "Se não criaste uma conta, podes ignorar este e-mail com segurança.",
    },
    forgot_password: {
      subject: "Redefine a tua palavra-passe Hosanna",
      heading: "Redefine a tua palavra-passe",
      body1: "Recebemos um pedido para redefinir a palavra-passe da tua conta Hosanna. Clica no botão abaixo para escolher uma nova palavra-passe.",
      cta: "Redefinir Palavra-passe",
      expiry: "Este link expira em {{expiry_time}} minutos. Se não solicitaste uma redefinição de palavra-passe, não é necessária nenhuma ação.",
    },
    otp: {
      subject: "O teu código de verificação Hosanna",
      heading: "Aqui está o teu código de acesso Hosanna:",
      expiry: "Este código expirará em {{expiry_time}} minutos. Se não solicitaste isto, podes ignorar este e-mail.",
    },
    password_reset_success: {
      subject: "Palavra-passe atualizada com sucesso - Hosanna",
      heading: "Palavra-passe atualizada com sucesso",
      body1: "A palavra-passe da tua conta Hosanna foi alterada com sucesso.",
      body2: "Se não fizeste esta alteração, por favor contacta o teu administrador ou o suporte Hosanna imediatamente para proteger a tua conta.",
    },
    account_locked: {
      subject: "Conta temporariamente bloqueada - Hosanna",
      heading: "Conta temporariamente bloqueada",
      body1: "Detetámos várias tentativas de login falhadas na tua conta. Para proteger a tua segurança, a tua conta foi temporariamente bloqueada.",
      body2: "Poderás tentar iniciar sessão novamente em {{lockout_minutes}} minutos.",
    },
    change_email_verification: {
      subject: "Verifica o teu novo endereço de e-mail - Hosanna",
      heading: "Verifica o teu novo endereço de e-mail",
      body1: "Solicitaste recentemente a alteração do endereço de e-mail associado à tua conta Hosanna para {{new_email}}.",
      body2: "Por favor, clica no botão abaixo para confirmar esta alteração.",
      cta: "Aprovar Alteração de E-mail",
    },
    email_changed_success: {
      subject: "Endereço de e-mail atualizado - Hosanna",
      heading: "Endereço de e-mail atualizado",
      body1: "O e-mail da tua conta foi atualizado com sucesso para {{new_email}}. Usarás este novo e-mail para iniciar sessão a partir de agora.",
    },
    account_deleted: {
      subject: "A tua conta Hosanna foi eliminada",
      heading: "A tua conta foi eliminada",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Confirmamos que a tua conta Hosanna foi permanentemente eliminada conforme solicitado. Todos os dados associados foram removidos dos nossos sistemas ativos.",
      body2: "Lamentamos ver-te partir. Se algum dia precisares de nós no futuro, és sempre bem-vindo de volta.",
    },
    church_invitation: {
      subject: "Foste convidado para te juntares a uma Igreja - Hosanna",
      heading: "Foste convidado para {{church_name}}",
      body1: "{{inviter_name}} convidou-te para te juntares ao espaço de trabalho no Hosanna.",
      body2: "Junta-te a {{church_name}} para te ligar à tua comunidade, ver eventos e manteres-te atualizado.",
      cta: "Aceitar Convite",
    },
    join_request_received: {
      subject: "Pedido de adesão recebido - Hosanna",
      heading: "Pedido de adesão recebido",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "O teu pedido para te juntares a {{church_name}} foi recebido e está a aguardar aprovação de um administrador.",
      body2: "Notificar-te-emos por e-mail assim que um administrador analisar o teu pedido.",
    },
    join_request_approved: {
      subject: "Estás dentro! Pedido de adesão aprovado - Hosanna",
      heading: "Estás dentro! Pedido aprovado",
      body1: "Ótimas notícias! O teu pedido para te juntares a {{church_name}} foi aprovado por um administrador.",
      body2: "Podes agora aceder ao espaço de trabalho, ver membros e participar.",
      cta: "Entrar no Espaço de Trabalho",
    },
    join_request_denied: {
      subject: "Atualização sobre o teu pedido de adesão - Hosanna",
      heading: "Atualização sobre o teu pedido de adesão",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "O teu pedido para te juntares a {{church_name}} não pôde ser aprovado neste momento.",
      body2: "Se achas que se trata de um erro, por favor contacta diretamente a administração da igreja.",
    },
    promoted_to_admin: {
      subject: "És agora um Administrador - Hosanna",
      heading: "És agora um Administrador",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "O teu papel em {{church_name}} foi atualizado. Passaste a ser Administrador.",
      body2: "Tens agora acesso às definições do espaço de trabalho, gestão de membros e ferramentas administrativas.",
      cta: "Ver Painel de Administrador",
    },
    role_changed: {
      subject: "O teu papel foi atualizado - Hosanna",
      heading: "O teu papel foi atualizado",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "O teu papel em {{church_name}} foi alterado para {{new_role}}.",
      body2: "Se tiveres alguma questão sobre esta alteração, por favor contacta o administrador do teu espaço de trabalho.",
    },
    removed_from_church: {
      subject: "Acesso ao espaço de trabalho removido - Hosanna",
      heading: "Acesso ao espaço de trabalho removido",
      salutation: "Olá{{#if first_name}} {{first_name}}{{/if}},",
      body1: "Foste removido do espaço de trabalho de {{church_name}}. Já não terás acesso ao painel desta comunidade nem às informações dos membros.",
    },

    // ── 4. billing / subscription ─────────────────────────────────────────
    billing_trial_started: {
      subject: "O teu período de avaliação começou - Hosanna",
      heading: "O teu período de avaliação começou",
      body1: "A tua avaliação gratuita do plano {{plan}} está agora ativa para {{church_name}}.",
      body2: "Explora todas as funcionalidades do Hosanna durante o teu período de avaliação.",
    },
    billing_trial_ended: {
      subject: "O teu período de avaliação terminou - Hosanna",
      heading: "O teu período de avaliação terminou",
      body1: "O período de avaliação de {{church_name}} terminou e a tua subscrição ao plano {{plan}} está agora ativa.",
      body2: "Podes gerir a tua subscrição nas definições do espaço de trabalho.",
    },
    billing_trial_expired: {
      subject: "O teu período de avaliação expirou - Hosanna",
      heading: "O teu período de avaliação expirou",
      body1: "O período de avaliação de {{church_name}} expirou sem um método de pagamento válido.",
      body2: "Para continuar a ter acesso, renova a tua subscrição nas definições do espaço de trabalho.",
    },
    billing_subscribed: {
      subject: "Subscrição ativa - Hosanna",
      heading: "Subscrição ativa",
      body1: "A subscrição de {{church_name}} ao plano {{plan}} está agora ativa.",
      body2: "Obrigado por escolheres o Hosanna!",
    },
    billing_canceled: {
      subject: "Subscrição cancelada - Hosanna",
      heading: "Subscrição cancelada",
      body1: "A subscrição de {{church_name}} foi cancelada.",
      body2: "O acesso continuará disponível até ao fim do período faturado. Se mudares de ideias, podes reativar a subscrição a qualquer momento.",
    },
  },
} as const;

type DeepWriteable<T> = {
  [K in keyof T]: T[K] extends object ? DeepWriteable<T[K]> : string;
};
export type I18nKeys = DeepWriteable<typeof ptPT>;
export default ptPT;
