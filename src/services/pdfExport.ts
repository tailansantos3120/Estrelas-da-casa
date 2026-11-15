import { jsPDF } from 'jspdf';
import {
  getParticipantName,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from '../shared/schedule.ts';
import type { GameState } from '../shared/types.ts';

export function exportAnalyticsPdf(state: GameState): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(11, 13, 18);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setTextColor(245, 184, 46);
  doc.setFontSize(18);
  doc.text('Estrelas da Casa - Cada um por si', 14, 15);
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(10);
  doc.text(
    `Relatorio Analitico Oficial | Data do painel: ${state.currentDateStr} | Gerado em ${new Date().toLocaleString('pt-BR')}`,
    14,
    24
  );

  // Meta banner
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text('Meta Final: R$ 150 para o 1o Colocado no Fim de Ano!', 14, 44);

  // Ranking table
  let y = 54;
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Classificacao Geral', 14, y);
  y += 6;

  const sorted = [...ROTATION_ORDER].sort(
    (a, b) => state.participants[b].stars - state.participants[a].stars
  );

  const day = state.days[state.currentDateStr];
  sorted.forEach((pid, index) => {
    const p = state.participants[pid];
    const profile = PARTICIPANT_PROFILES[pid];
    const routinesDone = day
      ? ROUTINE_DEFINITIONS.filter((r) => day.routines[pid]?.[r.id]?.completed).length
      : 0;
    const tasksDone = day
      ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === pid).length
      : 0;

    doc.setFillColor(index === 0 ? 254 : 248, index === 0 ? 243 : 250, index === 0 ? 199 : 252);
    doc.roundedRect(14, y, pageW - 28, 12, 2, 2, 'F');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${index + 1}o lugar: ${getParticipantName(state, pid)} (${profile.age} anos) — ${p.stars} estrelas | Rotinas hoje: ${routinesDone}/7 | Tarefas hoje: ${tasksDone}`,
      18,
      y + 7.5
    );
    y += 15;
  });

  // Fantasma, Denunciations & Punishments summary
  y += 4;
  doc.setFontSize(13);
  doc.text('Resumo de Eventos & Penalidades', 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`• Sorteios do Fantasma registrados: ${state.fantasmaDraws.length}`, 16, y);
  y += 6;
  doc.text(`• Justificativas enviadas: ${state.justifications.length}`, 16, y);
  y += 6;
  doc.text(`• Denuncias registradas: ${state.denunciations.length}`, 16, y);
  y += 6;
  doc.text(`• Punicoes de fim de semana: ${state.weekendPunishments.length}`, 16, y);
  y += 10;

  // Current-day notifications log
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Movimentacoes de Hoje', 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const recent = state.notifications.filter((n) => n.dateStr === state.currentDateStr).slice(0, 18);
  for (const n of recent) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    const line = `[${n.timestamp}] ${n.title} — ${n.message}`;
    const wrapped = doc.splitTextToSize(line, pageW - 32);
    doc.text(wrapped, 16, y);
    y += wrapped.length * 4.5 + 1.5;
  }

  doc.save(`estrelas-da-casa-relatorio-${state.currentDateStr}.pdf`);
}
