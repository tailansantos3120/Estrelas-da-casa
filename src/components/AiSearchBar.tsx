import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Lock, Search, Sparkles, X } from 'lucide-react';
import { MetaAiRingIcon } from './MetaAiRingIcon.tsx';
import { playConfirmEffect, playErrorEffect, unlockCelebrationAudio } from '../services/starCelebrationAudio.ts';
import { t } from '../shared/i18n.ts';
import type { LanguageCode, ParticipantId } from '../shared/types.ts';

interface GroundingSource {
  title: string;
  uri: string;
}

interface AiSearchBarProps {
  lang: LanguageCode;
  participantId: ParticipantId;
  sessionToken: string;
  onAuthExpired?: () => void;
  onOpenAiChat?: (seedExchange?: {
    query: string;
    answer: string;
    sources?: GroundingSource[];
  }) => void;
}

const SUGGESTED_QUERIES = [
  'Quem está ganhando o jogo hoje?',
  'Como tirar gordura do fogão rápido?',
  'Quais são as regras do Fantasma e Chefe?',
  'Receita fácil de bolo de chocolate',
];

const PARTICIPANTS_TO_PURGE: ParticipantId[] = ['tailan', 'carol', 'karine', 'caio'];

function purgeLegacySearchHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const pid of PARTICIPANTS_TO_PURGE) {
      localStorage.removeItem(`estrelas_ai_history_${pid}`);
      sessionStorage.removeItem(`estrelas_ai_history_${pid}`);
    }
  } catch {
    // ignore storage errors
  }
}

export default function AiSearchBar({
  lang,
  participantId,
  sessionToken,
  onAuthExpired,
  onOpenAiChat,
}: AiSearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    query: string;
    answer: string;
    sources: GroundingSource[];
  } | null>(null);

  // Purge any legacy history on mount and wipe ephemeral state if participant switches
  useEffect(() => {
    purgeLegacySearchHistory();
    setQuery('');
    setResult(null);
    setError(null);
  }, [participantId]);

  const runSearch = async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed || loading) return;

    unlockCelebrationAudio();
    setLoading(true);
    setError(null);

    const attemptSearch = () =>
      fetch('/api/ai/search', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          token: sessionToken,
          query: trimmed,
          lang,
        }),
      });

    try {
      let res: Response;
      try {
        res = await attemptSearch();
      } catch {
        res = await attemptSearch();
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        playErrorEffect();
        if (res.status === 401 && onAuthExpired) {
          onAuthExpired();
          return;
        }
        setError(data.error || 'Não foi possível concluir a pesquisa.');
        return;
      }
      playConfirmEffect();
      setResult({
        query: trimmed,
        answer: data.answer || '',
        sources: Array.isArray(data.sources) ? data.sources : [],
      });
    } catch {
      playErrorEffect();
      setError(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Sem conexão com a internet. Verifique sua rede e tente novamente.'
          : 'Falha momentânea ao consultar a Meta AI. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const clearAll = () => {
    setQuery('');
    setResult(null);
    setError(null);
    purgeLegacySearchHistory();
  };

  return (
    <section aria-label="Busca Privada com Inteligência Artificial" className="mb-4 space-y-2">
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="glass-card rounded-2xl p-2 flex items-center gap-2 focus-within:border-amber-400/70 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-500 shrink-0">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </div>

        <input
          type="text"
          role="searchbox"
          name="ai_ephemeral_search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          placeholder={t(lang, 'aiSearchPlaceholder')}
          aria-label="Pesquisar qualquer coisa com IA de forma privada"
          className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none py-2"
        />

        <span
          title="Modo anônimo: nada fica salvo e ninguém sabe o que você pesquisou"
          className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold whitespace-nowrap shrink-0"
        >
          <Lock className="w-3 h-3" />
          <span>Privado</span>
        </span>

        {(query || result || error) && (
          <button
            type="button"
            onClick={clearAll}
            aria-label="Limpar e apagar pesquisa"
            title="Apagar pesquisa da tela"
            className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="min-h-[40px] px-3.5 sm:px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{loading ? 'Buscando...' : 'Pesquisar'}</span>
        </button>

        {onOpenAiChat && (
          <button
            type="button"
            onClick={() => onOpenAiChat()}
            aria-label="Abrir Meta AI estilo WhatsApp"
            title="Conversar com a Meta AI em tela cheia"
            className="min-h-[40px] px-3 rounded-xl border border-sky-400/45 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <MetaAiRingIcon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Meta AI</span>
          </button>
        )}
      </form>

      <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-emerald-500 shrink-0" />
        <span>
          Pesquisa 100% privada: nenhum histórico é salvo e ninguém consegue ver o que você pesquisou.
        </span>
      </p>

      {/* Quick interactive suggestions when no active result */}
      {!result && !loading && !error && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {SUGGESTED_QUERIES.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setQuery(sq);
                runSearch(sq);
              }}
              className="glass-subcard min-h-[32px] px-3 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-300 hover:border-amber-400/60 transition-colors whitespace-nowrap shrink-0"
            >
              ✨ {sq}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl p-3.5 border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200 text-xs sm:text-sm flex items-start justify-between gap-3">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fechar erro"
            className="p-1 opacity-75 hover:opacity-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {result && (
        <div className="glass-card rounded-3xl p-4 sm:p-5 space-y-3 border border-amber-400/35">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-xs font-bold text-amber-600 dark:text-amber-300 truncate">
                Resposta privada para: “{result.query}”
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenAiChat && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAiChat({
                      query: result.query,
                      answer: result.answer,
                      sources: result.sources,
                    });
                    clearAll();
                  }}
                  className="min-h-[32px] px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                >
                  <MetaAiRingIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Continuar na Meta AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                aria-label="Fechar e apagar resposta privada"
                className="min-h-[32px] px-2.5 rounded-xl bg-slate-200/70 dark:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                <span>Apagar</span>
              </button>
            </div>
          </div>

          <div className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
            {result.answer}
          </div>

          {result.sources.length > 0 && (
            <div className="pt-2.5 border-t border-slate-200/70 dark:border-white/10 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fontes pesquisadas
              </p>
              <div className="flex flex-wrap gap-2">
                {result.sources.map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-subcard min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-sky-600 dark:text-sky-300 hover:border-sky-400/60 inline-flex items-center gap-1.5 max-w-full"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[220px]">{src.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
