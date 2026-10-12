/**
 * Question type presentation and payload rules live here instead of being
 * scattered through the builder. Add a layout key + renderer when introducing
 * a new interaction (for example `bowTie`); shared question metadata remains
 * reusable across every layout.
 */
const layouts = {
  MCQ_SINGLE: { layout: 'choices', correctAnswerMode: 'single', correctAnswerPayload: 'choiceIds', optionsPayload: 'choices', defaultChoices: ['', '', '', ''], questionPaste: true, rationalePaste: true, supportsTabs: true, unitPlacement: 'settings' },
  MCQ_MULTI: { layout: 'choices', correctAnswerMode: 'multiple', correctAnswerPayload: 'choiceIds', optionsPayload: 'choices', defaultChoices: ['', '', '', ''], questionPaste: true, rationalePaste: true, supportsTabs: true, unitPlacement: 'settings' },
  TRUE_FALSE: { layout: 'choices', correctAnswerMode: 'single', correctAnswerPayload: 'choiceIds', optionsPayload: 'choices', defaultChoices: ['True', 'False'], supportsTabs: true, unitPlacement: 'settings' },
  FILL_BLANK: { layout: 'fillBlank', correctAnswerMode: 'text', correctAnswerPayload: 'textArray', optionsPayload: 'none', defaultChoices: [], supportsTabs: false, unitPlacement: 'answer' },
}

const defaultLayout = { layout: 'choices', correctAnswerMode: 'multiple', correctAnswerPayload: 'choiceIds', optionsPayload: 'choices', defaultChoices: ['', '', '', ''], supportsTabs: true, unitPlacement: 'settings' }

export function getQuestionTypeLayout(code) {
  return { ...defaultLayout, ...(layouts[code] || {}) }
}

// Keeps the registry open for future question-specific layouts and API data.
export function registerQuestionTypeLayout(code, configuration) {
  if (!code || !configuration || typeof configuration !== 'object') {
    throw new TypeError('A question type code and layout configuration are required.')
  }
  layouts[code] = { ...defaultLayout, ...configuration }
}
