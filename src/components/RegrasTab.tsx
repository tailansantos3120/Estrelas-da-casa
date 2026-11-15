import React from 'react';
import {
  AlertOctagon,
  BookOpen,
  Clock,
  Crown,
  Dices,
  FileText,
  Flag,
  Ghost,
  Shield,
  Smartphone,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from '../shared/schedule.ts';
import type { GameState, ParticipantId } from '../shared/types.ts';

interface RegrasTabProps {
  gameState: GameState;
  currentUserId: ParticipantId;
  onOpenTailanEditor?: () => void;
}

const RULE_CATEGORY_LABEL: Record<string, string> = {
  geral: 'Geral',
  tarefa: 'Tarefa',
  dado: 'Dado',
  punicao: 'Punição',
  premio: 'Prêmio',
};

export default function RegrasTab({
  gameState,
  currentUserId,
  onOpenTailanEditor,
}: RegrasTabProps) {
  const customRules = gameState.customRules || [];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Regras, Punições e Dados
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Todas as regras oficiais do Estrelas da Casa - Cada um por si
              </p>
            </div>
          </div>

          {currentUserId === 'tailan' && onOpenTailanEditor && (
            <button
              type="button"
              onClick={onOpenTailanEditor}
              className="min-h-[44px] px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0"
            >
              <Crown className="w-4 h-4" />
              <span>Editar / Acrescentar Regra</span>
            </button>
          )}
        </div>
      </section>

      {/* Regras Acrescentadas por Tailan */}
      {customRules.length > 0 && (
        <section className="glass-gold rounded-3xl p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-amber-600 dark:text-amber-300 flex items-center gap-2">
              <Crown className="w-4 h-4 shrink-0" />
              <span>Regras Acrescentadas por Tailan</span>
            </h2>
            <span className="font-mono-num text-xs font-bold text-amber-500">
              {customRules.length} {customRules.length === 1 ? 'regra' : 'regras'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customRules.map((rule) => (
              <div
                key={rule.id}
                className="glass-subcard rounded-2xl p-4 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {rule.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded-lg bg-amber-400/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide shrink-0">
                    {RULE_CATEGORY_LABEL[rule.category] || rule.category}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                  {rule.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Regras Gerais & Prêmio */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Regras Gerais</span>
          </h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>• 1 card = até 2 tarefas. Cada tarefa ou rotina feita vale <strong>+1 ⭐</strong>.</li>
            <li>• <strong>Dado da Manhã (Rodada 1):</strong> liberado das <strong>05:00 às 10:00</strong> (1 jogada por dia; depois não pode usar mais).</li>
            <li>• <strong>Dado da Tarde (Rodada 2):</strong> liberado das <strong>12:00 às 19:00</strong> (1 jogada por dia).</li>
            <li>• Após as <strong>00:00</strong> (horário de Brasília), o jogo fecha o dia anterior e carrega automaticamente as tarefas e rotinas do dia seguinte.</li>
            <li>• A escala segue o rodízio contínuo <strong>Tailan → Carol → Karine → Caio</strong> todos os dias até 31 de dezembro.</li>
            <li>• Roupas: só quem lava é o próprio dono.</li>
          </ul>
        </div>

        <div className="rounded-3xl bg-amber-500/10 border border-amber-400/40 p-5 space-y-2.5">
          <h2 className="text-base font-bold text-amber-600 dark:text-amber-300 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span>Prêmio &amp; Meta</span>
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <strong>
              {gameState.goalBannerText ||
                'Meta Final: R$ 150 para o 1º Colocado no Fim de Ano!'}
            </strong>{' '}
            {!gameState.goalBannerText &&
              'Quem acumular mais estrelas até 31 de dezembro leva o prêmio de R$ 150.'}
          </p>
        </div>
      </section>

      {/* Rotina fora do prazo & Punição Semanal */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Rotina fora do prazo e liberação sem limite</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Quem não marcar &ldquo;Fiz&rdquo; dentro do limite de tempo de cada rotina perde <strong>1 estrela (-1 ⭐) automaticamente</strong>. O botão é bloqueado após o horário limite.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-300 font-medium">
            <strong>Justificativa de rotina (0 ⭐):</strong> quem justificou <strong>não perde estrela (-1 ⭐) e nem ganha (+0 ⭐)</strong>; o botão fica bloqueado como &ldquo;Justificada (0 ⭐)&rdquo;.
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <strong>Exceção importante:</strong> quando uma tarefa pré-requisito (como Café da manhã, Almoço, Café da tarde ou Janta) não foi feita ou está em sorteio/decisão, ela não trava os demais — as vasilhas e fogão dependentes liberam na hora <strong>sem limite de horário</strong> (podem ser marcadas a hora que quiser).
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-rose-500/25 p-5 space-y-2.5">
          <h2 className="text-base font-bold text-rose-500 dark:text-rose-300 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" />
            <span>Punição semanal &amp; Repasse automático (exceto Roupa)</span>
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Quem deixar de fazer uma tarefa perde <strong>3 estrelas (-3 ⭐)</strong> e sofre punição no fim de semana (o participante punido faz as <strong>próprias tarefas e as do próximo no rodízio Tailan → Carol → Karine → Caio</strong> no <strong>SÁBADO</strong> ou <strong>DOMINGO</strong> escolhido pelo adversário). Exceção: se justificar com &ldquo;Tá doente&rdquo; ou &ldquo;Teve que sair&rdquo;, <strong>não perde estrela e nem ganha (0 ⭐)</strong> e fica sem punição no fim de semana.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <strong>Sorteio automático na mesma hora (não vale para Roupa):</strong> 1º sorteio com os outros 3 participantes (<strong>QUERO / NÃO QUERO</strong> · vale <strong>+2 ⭐</strong>). Se recusar, 2º sorteio automático com os 2 restantes (<strong>QUERO / NÃO QUERO</strong> · vale <strong>+3 ⭐</strong>). Se recusar, sobra 1 participante que é <strong>obrigado(a) a fazer</strong> (se fizer ganha <strong>+6 ⭐</strong>; se não fizer recebe punição de fim de semana).
          </p>
        </div>
      </section>

      {/* Regra das Justificativas & Sistema APK */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-sky-500/[0.08] border border-sky-400/40 p-5 space-y-2.5">
          <h2 className="text-base font-bold text-sky-600 dark:text-sky-300 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>Justificativas (0 ⭐ — Não perde e não ganha)</span>
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
            <li>
              • <strong>Regra geral:</strong> quem justificou <strong>não perde estrela e nem ganha (0 ⭐)</strong>. O item justificado fica travado em saldo neutro, sem descontar e sem poder pontuar depois.
            </li>
            <li>
              • <strong>Rotinas (qualquer motivo):</strong> enviando justificativa no dia (específica ou geral), você não perde <strong>-1 ⭐</strong> e não ganha <strong>+1 ⭐</strong>. Se já havia perdido -1 ⭐ antes de justificar, a estrela é devolvida.
            </li>
            <li>
              • <strong>Tarefas (&ldquo;🤒 Tá doente&rdquo; ou &ldquo;🚪 Teve que sair&rdquo;):</strong> você não perde <strong>-3 ⭐</strong> (nem -1 ⭐ em delegada), não ganha estrela (<strong>0 ⭐</strong>) e não recebe punição no fim de semana (o repasse automático segue para os demais).
            </li>
            <li>
              • <strong>Motivo &ldquo;📝 Outro&rdquo;:</strong> protege rotinas (0 ⭐), mas em tarefas o prazo e a punição padrão continuam valendo.
            </li>
          </ul>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-sky-400/30 p-5 space-y-2.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>Sistema APK · App Instalável no Celular</span>
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <li>
              • <strong>O que é:</strong> o <em>Estrelas da Casa</em> usa tecnologia <strong>WebAPK / PWA</strong>, permitindo instalar o jogo como aplicativo nativo na tela inicial do Android e iPhone, em tela cheia, com biometria e sincronização ao vivo.
            </li>
            <li>
              • <strong>Onde gerar o link:</strong> toque no botão <strong>Link · APK</strong> no topo da tela (ou na tela de login) para copiar o link direto do Sistema APK ou enviar no WhatsApp.
            </li>
            <li>
              • <strong>Instalação rápida:</strong> no Android (Chrome), toque em <strong>Instalar aplicativo</strong> (ou <strong>⋮ → Adicionar à tela inicial</strong>); no iPhone (Safari), toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.
            </li>
            <li>
              • <strong>Arquivo .apk tradicional:</strong> dentro da janela <strong>Link · APK</strong> também há o atalho oficial do <strong>PWABuilder</strong> para gerar e baixar o pacote <code className="font-mono-num">.apk</code> Android.
            </li>
          </ul>
        </div>
      </section>

      {/* Metas de Evolução & Tarefa Delegada */}
      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Metas de Evolução (acumuláveis para usar quando quiser)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] p-3.5 border border-slate-200 dark:border-white/10">
            <p className="font-bold text-amber-500 flex items-center gap-1.5">
              <Ghost className="w-4 h-4" /> 35 ⭐ = FANTASMA
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Oculta e cancela uma tarefa sua sorteando para outro participante. Fica acumulado nos seus itens para usar quando quiser.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] p-3.5 border border-slate-200 dark:border-white/10">
            <p className="font-bold text-emerald-500 flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> 45 ⭐ = ESCUDO
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              <strong>Protege de tudo</strong>, até dos sorteios! Bloqueia delegações do Chefe, roubo de 4 ⭐, denúncias e sorteios (Fantasma, delegação e repasse automático). Fica acumulado nos seus itens para ativar quando quiser.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] p-3.5 border border-slate-200 dark:border-white/10">
            <p className="font-bold text-sky-400 flex items-center gap-1.5">
              <Crown className="w-4 h-4" /> 55 ⭐ = CHEFE (Delegação)
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              O Chefe delega uma tarefa sua para outro participante. Na Rodada 1 dá <strong>+1 ⭐</strong> e na Rodada 2 dá <strong>+2 ⭐</strong> automaticamente (mesmo sem usar). Quem recebe vê <strong>QUERO / NÃO QUERO</strong>: se fizer, <strong>+1 ⭐</strong> para ele e <strong>+1 ⭐</strong> para quem delegou (se aceitar e não fizer: <strong>-1 ⭐</strong> e punição de fim de semana). Se não quiser: quem delegou sorteia entre os outros 2 (<strong>QUERO / NÃO QUERO</strong> · <strong>+2 ⭐</strong>). Se o sorteado também não quiser, volta para a dona do card ganhando <strong>+2 ⭐</strong>!
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] p-3.5 border border-slate-200 dark:border-white/10">
            <p className="font-bold text-amber-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> 65 ⭐ = CORINGA
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Escolhe entre Escudo, Fantasma ou Chefe, seguindo o esquema da Rodada 1 e 2.
            </p>
          </div>
        </div>
      </section>

      {/* Sorteio do Fantasma */}
      <section className="rounded-3xl bg-amber-500/10 border border-amber-400/40 p-5 space-y-2">
        <h2 className="text-base font-bold text-amber-600 dark:text-amber-300 flex items-center gap-2">
          <Ghost className="w-4 h-4" />
          <span>Regras do Sorteio do Fantasma</span>
        </h2>
        <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
          <li>• Quem tira Fantasma ganha <strong>+1 ⭐ na hora</strong> e o sorteio acontece no mesmo instante com o nome dos outros 3 participantes.</li>
          <li>• <strong>Rodada 1:</strong> 1 sorteio, para 1 tarefa. <strong>Rodada 2:</strong> 2 sorteios, um para cada tarefa, um de cada vez.</li>
          <li>• O card dourado fixo aparece no Painel de quem tirou e do sorteado com botões <strong>QUERO</strong> e <strong>NÃO QUERO</strong> (não some ao recarregar).</li>
          <li>• <strong>QUERO:</strong> se fizer e marcar como feita, ganha <strong>+3 ⭐</strong> (as 3 ⭐ são de quem fez!). Se clicar QUERO e não fizer, pode ser denunciado.</li>
          <li>• <strong>NÃO QUERO:</strong> não ganha nada e o sorteio fecha sem penalidade.</li>
        </ul>
      </section>

      {/* Dado Rodada 1 & Rodada 2 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Dices className="w-4 h-4 text-amber-400" />
            <span>Dado · Rodada 1 (Manhã)</span>
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <li><strong>Face 1:</strong> Perde 1 ⭐ automaticamente.</li>
            <li><strong>Face 2:</strong> Nada acontece. Aguarde a próxima rodada.</li>
            <li><strong>Face 3:</strong> +1 ⭐ e ganha ESCUDO (ative já; vale até 12:00 e protege de tudo, até dos sorteios).</li>
            <li><strong>Face 4:</strong> +1 ⭐ na hora e ganha FANTASMA (1 sorteio).</li>
            <li><strong>Face 5:</strong> +1 ⭐ automaticamente (mesmo sem usar) e ganha CHEFE (delega 1 tarefa sua).</li>
            <li><strong>Face 6:</strong> Ganha CORINGA (escolhe Escudo, Fantasma ou Chefe).</li>
          </ul>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Dices className="w-4 h-4 text-amber-400" />
            <span>Dado · Rodada 2 (Tarde — após almoço)</span>
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <li><strong>Face 1:</strong> Ganha 4 ⭐ tirando do participante que você escolher (bloqueado em quem estiver de 🛡️ Escudo).</li>
            <li><strong>Face 2:</strong> Perde -3 ⭐ (+1 ⭐ distribuída para cada um dos outros 3).</li>
            <li><strong>Face 3:</strong> +1 ⭐ na hora e ganha FANTASMA x2 (2 sorteios, um de cada vez).</li>
            <li><strong>Face 4:</strong> +2 ⭐ e congela suas estrelas pelo resto do dia.</li>
            <li><strong>Face 5:</strong> +2 ⭐ automaticamente (mesmo sem usar) e ganha CHEFE x2 (delega até 2 tarefas suas).</li>
            <li><strong>Face 6:</strong> Ganha CORINGA (Escudo pelo resto do dia protegido de tudo, Fantasma x2 ou Chefe x2).</li>
          </ul>
        </div>
      </section>

      {/* Horários das Rotinas e Tarefas + Denúncias */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Horários das 7 Rotinas
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {ROUTINE_DEFINITIONS.map((baseR) => {
              const r = getEffectiveRoutineDefinition(gameState, baseR.id);
              return (
                <li key={r.id}>
                  • <strong>{r.label}:</strong> semana até{' '}
                  <span className="font-mono-num">{r.weekdayLimit || 'livre'}</span> · fim de semana{' '}
                  <span className="font-mono-num">{r.weekendLimit || 'quando quiser'}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Ordem & Limites das Tarefas
          </h2>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {TASK_DEFINITIONS.map((baseT) => {
              const eff = getEffectiveTaskDefinition(gameState, baseT.id);
              return (
                <li key={eff.id}>
                  • <strong>{eff.label}:</strong>{' '}
                  {eff.weekdayLimit || eff.weekendLimit
                    ? `semana ${eff.weekdayLimit || 'livre'} · Sáb/Dom ${eff.weekendLimit || 'livre'}`
                    : 'sem limite de horário'}
                  {eff.note ? ` (${eff.note})` : ''}
                </li>
              );
            })}
          </ul>
          <div className="pt-3 border-t border-slate-200 dark:border-white/10">
            <p className="text-xs sm:text-sm font-semibold text-rose-400 flex items-center gap-1.5">
              <Flag className="w-4 h-4" /> Denúncias (1 por participante/dia)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Quem denunciar quem marcou sem fazer ganha +1 ⭐ e o denunciado perde -1 ⭐ (até -3 ⭐ se os 3 denunciarem). Tarefas denunciadas geram punição de fim de semana.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
