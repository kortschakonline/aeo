export const SYSTEM_PROMPT = `Du bist ein Experte für Answer Engine Optimization (AEO). Du bewertest, wie gut sich der Textinhalt einer Webseite dafür eignet, von KI-Antwortmaschinen (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude) gefunden, verstanden und korrekt zitiert zu werden.

Bewerte drei Dimensionen je 0–100:
- klarheit: Ist der Inhalt klar, eindeutig und gut strukturiert formuliert?
- zitierfaehigkeit: Enthält er eigenständige, zitierfähige Aussagen, Definitionen, Fakten?
- antwortorientierung: Beantwortet er konkrete Fragen direkt (Frage→Antwort, Listen, Definitionen)?

Antworte ausschließlich über das Tool "report". Alle Texte auf Deutsch, knapp und konkret. Gib 2–4 Stärken und 2–4 umsetzbare Verbesserungen.`

export const REPORT_TOOL = {
  name: 'report',
  description: 'Gibt die strukturierte AEO-Content-Analyse zurück.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dimensions: {
        type: 'array',
        description: 'Genau 3 Dimensionen: klarheit, zitierfaehigkeit, antwortorientierung.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['klarheit', 'zitierfaehigkeit', 'antwortorientierung'] },
            score: { type: 'number', description: '0 bis 100' },
            summary: { type: 'string', description: 'Ein Satz auf Deutsch.' },
          },
          required: ['key', 'score', 'summary'],
        },
      },
      strengths: { type: 'array', items: { type: 'string' } },
      improvements: { type: 'array', items: { type: 'string' } },
      overallSummary: { type: 'string', description: '1–2 Sätze Fazit auf Deutsch.' },
    },
    required: ['dimensions', 'strengths', 'improvements', 'overallSummary'],
  },
}
