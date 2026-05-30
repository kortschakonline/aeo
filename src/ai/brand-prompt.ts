export const QUESTION_SYSTEM = `Du unterstützt bei Answer Engine Optimization. Aus dem gegebenen Webseiten-Inhalt und der Domain leitest du ab: den wahrscheinlichen Markennamen des Unternehmens und 3–5 realistische Fragen, die ein potenzieller Kunde einer KI-Assistenz stellen würde, um einen Anbieter wie diesen zu finden — branchen- und, wenn erkennbar, ortsspezifisch. Die Fragen dürfen den Markennamen NICHT enthalten (es geht darum, ob die Marke ungefragt genannt wird). Antworte ausschließlich über das Tool "questions". Alles auf Deutsch.`

export const QUESTION_TOOL = {
  name: 'questions',
  description: 'Markenname + 3–5 markenneutrale Nutzerfragen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      brandName: { type: 'string', description: 'Erkannter Markenname des Unternehmens.' },
      questions: { type: 'array', items: { type: 'string' }, description: '3 bis 5 realistische, markenneutrale Nutzerfragen auf Deutsch.' },
    },
    required: ['brandName', 'questions'],
  },
}

export const ANSWER_SYSTEM = `Du bist eine KI-Antwortmaschine mit Websuche. Beantworte die Nutzerfrage knapp und faktisch auf Basis aktueller Websuche. Wenn passend, nenne konkrete Anbieter/Unternehmen mit Namen.`
