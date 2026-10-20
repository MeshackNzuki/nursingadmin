<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import RichEditor from './components/RichEditor.vue'
import SearchableSelect from './components/SearchableSelect.vue'
import { getQuestionTypeLayout } from './config/questionTypeLayouts.js'

const seed = [
  ['Multiple Choice — Single Answer','MCQ_SINGLE','The learner selects one correct answer from multiple options.','This question type is easy to set up and is the most common format.'],
  ['Multiple Choice — Multiple Answers','MCQ_MULTI','The learner selects two or more correct answers from a list of options.','Multiple Choice Multiple Answers type question allows more than one correct response.'],
  ['True or False','TRUE_FALSE','The learner determines whether a statement is true or false.','A true or false question consists of a statement that the learner evaluates.'],
  ['Short Answer','SHORT_ANSWER','The learner provides a brief text-based answer.','Short answer questions allow users to provide text responses.'],
  ['Matching','MATCHING','The learner matches items from one list with corresponding items in another.','A matching question is two adjacent lists of related words, phrases, or images.'],
  ['Ordered Response','ORDERED_RESPONSE','The learner places items into the correct sequence.','An ordering or sequence question consists of a scrambled list of items.'],
  ['Fill in the Blank','FILL_BLANK','The learner enters the missing word, phrase, or value.','A Fill in the Blank question consists of a phrase with one or more missing parts.'],
  ['Long Answer — Essay','ESSAY','The learner provides a detailed written response on a topic.','Long answer or paragraph question type is equivalent to an essay response.'],
  ['Hotspot','HOTSPOT','The learner selects a specific location or area on an image.','Hot spots to select in the artwork. Hotspot questions use an image as the answer area.'],
  ['Grouping','GROUPING','The learner sorts or assigns items into the appropriate categories.','Grouping questions help learners group options into the right categories.'],
  ['Highlight','HIGHLIGHT','The learner selects or highlights specific words, phrases, or items.','Highlight the target content in the question text.'],
  ['Bow-Tie','BOW_TIE','A clinical decision-making question requiring the learner to connect actions and outcomes.','For questions with multiple answers across linked clinical decision columns.'],
  ['Dropdown','DROPDOWN','The learner selects an answer from one or more dropdown menus.','Dropdown question type presents a choice list in context.'],
  ['Matrix Multiple Response','MATRIX_MULTIPLE_RESPONSE','The learner selects one or more responses for each manifestation or category.','A matrix question with independent multiple-response options for each row.'],
  ['Drag and Drop','DRAG_DROP','The learner drags items and places them into the appropriate areas.','Drag and Drop Question'],
  ['Multiple Response Group','MULTIPLE_RESPONSE_GROUP','The learner answers a group of related questions using multiple response options.','A grouped multiple-response format for clinical assessment items.'],
].map(([name, code, description, details], index) => ({ id: index + 1, name, code, description, details, active: true, category: index < 3 ? 'Core' : index < 8 ? 'Written' : 'Interactive', updated: index < 3 ? 'Today' : `${index + 1} days ago` }))

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://app.nursemerit.com').replace(/\/$/, '')
const AUTH_TOKEN_KEY = 'nursing_content_auth_token'
const PROFILE_KEY = 'nursing_content_profile'
const QUESTION_SESSION_KEY = 'nursing_content_question_session_v1'
function readLocalJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
const restoredQuestionSession = readLocalJson(QUESTION_SESSION_KEY, {})
const apiUrl = (path) => `${API_BASE_URL}/api/${path.replace(/^\//, '')}`
const authToken = ref(localStorage.getItem(AUTH_TOKEN_KEY) || '')
const profile = ref(readLocalJson(PROFILE_KEY, null))
const isAuthenticated = computed(() => Boolean(authToken.value))
function hasEditRole(roles) {
  return Array.isArray(roles) && roles.some(role => ['admin', 'super-admin'].includes(String(role).trim().toLowerCase()))
}
const canEditContent = computed(() => hasEditRole(profile.value?.roles))
const profileName = computed(() => profile.value?.name || profile.value?.email || 'Content admin')
const profileInitials = computed(() => profileName.value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'CA')
const loginForm = ref({ email: '', password: '' })
const loginError = ref('')
const loginLoading = ref(false)
const logoutLoading = ref(false)
const questions = ref([])
const products = ref([])
const subjects = ref([])
const questionRecords = ref([])
const editingQuestionId = ref(null)
const query = ref('')
const activeFilter = ref('All types')
const selected = ref(null)
const modalOpen = ref(false)
const toast = ref('')
const questionPage = ref(null)
const activeSection = ref('questions')
const allQuestionFilters = ref({ productId: '', topicId: '', premadeExamId: '' })
const allQuestionSearch = ref('')
const questionDrafts = ref(restoredQuestionSession.questionDrafts || {})
const questionDraft = ref(null)
const questionSaving = ref(false)
const lastQuestionPayload = ref(null)
const questionPayloadError = ref('')
const payloadCopied = ref(false)
const introEditor = ref(null)
const promptEditor = ref(null)
const explanationEditor = ref(null)
const tabEditors = ref({})
const explanationLatexError = ref('')
const explanationLatexMessage = ref('')
const questionPayloadJson = computed(() => lastQuestionPayload.value ? JSON.stringify(lastQuestionPayload.value, null, 2) : '')
const subtopics = ref([])
const subtopicsLoading = ref(false)
const subtopicsError = ref('')
const premadeExamOptions = ref([])
const premadeExamsLoading = ref(false)
const premadeExamsError = ref('')
const premadeExamSaving = ref(false)
const premadeExamSaveError = ref('')
const sessionContext = ref({ subtopicId: '', premadeExamId: '', topicId: '', ...(restoredQuestionSession.sessionContext || {}) })
const contextLocked = ref(Boolean(restoredQuestionSession.contextLocked))
const hasLockedPremadeExam = computed(() => contextLocked.value && Boolean(sessionContext.value.premadeExamId))
const subtopicRequired = computed(() => !questionDraft.value?.premadeExamId)
const hasQuestionContext = computed(() => Boolean(questionDraft.value?.subtopicId || questionDraft.value?.premadeExamId))
const wordPasteHtml = ref('')
const wordImportError = ref('')
const wordImportMessage = ref('')
const rationalePasteHtml = ref('')
const rationaleImportError = ref('')
const rationaleImportMessage = ref('')
let questionAutoImportTimer
let rationaleAutoImportTimer
const savedQuestionPayloads = ref([])
watch([sessionContext, contextLocked, questionDrafts], () => {
  try {
    localStorage.setItem(QUESTION_SESSION_KEY, JSON.stringify({
      sessionContext: sessionContext.value,
      contextLocked: contextLocked.value,
      questionDrafts: questionDrafts.value,
    }))
  } catch {
    // Keep editing if browser storage is unavailable or full.
  }
}, { deep: true })
watch(questionDraft, draft => {
  if (draft && questionPage.value?.code) {
    questionDrafts.value = { ...questionDrafts.value, [questionPage.value.code]: draft }
  }
}, { deep: true })
const SUBTOPICS_ENDPOINT = '/content/subtopics'
const QUESTION_EXAMS_ENDPOINT = '/content/premade-exams'
const CATEGORIES_ENDPOINT = '/content/categories'
const TOPICS_ENDPOINT = '/content/topics'
const PRODUCTS_ENDPOINT = '/content/products'
const SUBJECTS_ENDPOINT = '/content/subjects'
const QUESTION_TYPES_ENDPOINT = '/content/question-types'
const QUESTIONS_ENDPOINT = '/content/questions'
const nursingCategories = ref([])
const topics = ref([])
const taxonomyLoading = ref(false)
const taxonomyError = ref('')
const premadeExams = ref([])
const examModalOpen = ref(false)
const examForm = ref(blankExam())
function responseData(body) { return body?.data ?? body }
function responseRows(body, keys = []) {
  let data = responseData(body)
  if (!Array.isArray(data) && Array.isArray(data?.data)) data = data.data
  if (Array.isArray(data)) return data
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key]
  return []
}
async function apiRequest(path, options = {}, includeStatus = false) {
  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !canEditContent.value) {
    throw new Error('Access denied. Only admin and super-admin accounts can edit content.')
  }
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (authToken.value) headers.set('Authorization', `Bearer ${authToken.value}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(apiUrl(path), { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (response.status === 401 && authToken.value) {
    logout()
    throw new Error('Your session has expired. Please sign in again.')
  }
  if (!response.ok) {
    const errors = body?.errors ? Object.values(body.errors).flat().join(' ') : ''
    throw new Error(errors || responseData(body)?.message || `Request failed (${response.status})`)
  }
  return includeStatus ? { body, status: response.status } : body
}
function logout() {
  authToken.value = ''
  profile.value = null
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(PROFILE_KEY)
  questions.value = []
  questionRecords.value = []
}
async function login() {
  loginError.value = ''
  loginLoading.value = true
  try {
    const response = await fetch(apiUrl('/login'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value),
    })
    const body = await response.json().catch(() => ({}))
    const data = responseData(body)
    if (!response.ok || !data?.token) {
      const errors = body?.errors ? Object.values(body.errors).flat().join(' ') : ''
      throw new Error(errors || data?.message || 'Unable to sign in. Check your email and password.')
    }
    if (!hasEditRole(data.roles)) {
      throw new Error('Access denied. Only admin and super-admin accounts can edit content.')
    }
    authToken.value = data.token
    profile.value = { name: data.name, email: data.email, avatar: data.avatar, roles: data.roles }
    localStorage.setItem(AUTH_TOKEN_KEY, data.token)
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile.value))
    await loadReferenceData()
  } catch (error) {
    loginError.value = error instanceof Error ? error.message : 'Unable to sign in.'
  } finally {
    loginLoading.value = false
  }
}
async function loadReferenceData() {
  await Promise.all([fetchQuestionTypes(), fetchTaxonomy(), fetchSubtopics(), fetchPremadeExamOptions(), fetchQuestions()])
}
function blankExam() { return { id: null, product_id: '', subject_id: '', nursing_category_id: '', topic_id: '', name: '', slug: '', short_description: '', description: '', question_count: 0, status: 'draft' } }
const isCategoryOptionalProduct = computed(() => {
  const product = products.value.find(item => String(item.id ?? item.product_id) === String(examForm.value.product_id))
  const productCode = String(product?.code ?? product?.slug ?? product?.name ?? '').trim().toUpperCase()
  return ['TEAS', 'HESI'].includes(productCode)
})
const requiresNursingCategory = computed(() => !isCategoryOptionalProduct.value)
const visibleSubjects = computed(() => subjects.value.filter(subject => {
  const productId = subject.product_id ?? subject.productId
  return productId == null || !examForm.value.product_id || String(productId) === String(examForm.value.product_id)
}))
const visibleCategories = computed(() => nursingCategories.value.filter(category => {
  const linkedProductId = category.product_id ?? category.productId
  return linkedProductId == null || !examForm.value.product_id || String(linkedProductId) === String(examForm.value.product_id)
}))
const visibleTopics = computed(() => topics.value.filter(topic => {
  const subjectId = topic.subject_id ?? topic.subjectId
  const matchesSubject = subjectId == null || !examForm.value.subject_id || String(subjectId) === String(examForm.value.subject_id)
  const categoryId = topic.nursing_category_id ?? topic.category_id
  const matchesCategory = isCategoryOptionalProduct.value || categoryId == null || String(categoryId) === String(examForm.value.nursing_category_id)
  return matchesSubject && matchesCategory
}))
const productOptions = computed(() => products.value.map(product => ({ value: String(product.id ?? product.product_id), label: product.name ?? product.title ?? product.code ?? `Product ${product.id ?? product.product_id}` })))
const subjectOptions = computed(() => visibleSubjects.value.map(subject => ({ value: String(subject.id ?? subject.subject_id), label: subject.name ?? subject.subject_name ?? subject.title ?? subject.code ?? `Subject ${subject.id ?? subject.subject_id}` })))
const subtopicOptions = computed(() => subtopics.value.map(item => ({ value: String(item.id), label: item.name })))
const premadeExamSelectOptions = computed(() => [
  { value: '', label: 'No premade exam', disabled: true },
  ...premadeExamOptions.value.map(item => ({ value: String(item.id), label: item.name })),
])
const categoryOptions = computed(() => visibleCategories.value.map(item => ({ value: String(item.id), label: item.name })))
const topicOptions = computed(() => visibleTopics.value.map(item => ({ value: String(item.id), label: item.name })))
const NURSING_SCHOOL_PRODUCT_ID = '3'
function examSubjectId(exam) {
  const examTopicId = exam?.topic_id ?? exam?.topicId ?? exam?.topic?.id ?? exam?.topic?.topic_id
  const examTopic = exam?.topic
    ?? topics.value.find(item => String(item.id) === String(examTopicId))
  return exam?.subject_id ?? exam?.subjectId ?? exam?.subject?.id ?? exam?.subject?.subject_id
    ?? examTopic?.subject_id ?? examTopic?.subjectId ?? examTopic?.subject?.id ?? examTopic?.subject?.subject_id
}
const selectedQuestionExam = computed(() => {
  const examId = questionDraft.value?.premadeExamId || sessionContext.value.premadeExamId
  return premadeExamOptions.value.find(item => String(item.id) === String(examId))
})
const selectedQuestionExamSubjectId = computed(() => examSubjectId(selectedQuestionExam.value))
const selectedQuestionExamIsNursingSchool = computed(() => {
  const exam = selectedQuestionExam.value
  if (!exam) return false
  const subject = exam.subject
    ?? subjects.value.find(item => String(item.id ?? item.subject_id) === String(selectedQuestionExamSubjectId.value))
  const examTopicId = exam.topic_id ?? exam.topicId ?? exam.topic?.id ?? exam.topic?.topic_id
  const examTopic = exam.topic ?? topics.value.find(item => String(item.id) === String(examTopicId))
  const productId = exam.product_id ?? exam.productId ?? exam.product?.id ?? exam.product?.product_id
    ?? subject?.product_id ?? subject?.productId ?? examTopic?.product_id ?? examTopic?.productId
  return String(productId ?? '') === NURSING_SCHOOL_PRODUCT_ID
})
const questionTopicOptions = computed(() => {
  const exam = selectedQuestionExam.value
  if (!exam || !selectedQuestionExamIsNursingSchool.value) {
    return topics.value.map(item => ({ value: String(item.id), label: item.name }))
  }
  if (selectedQuestionExamSubjectId.value == null) return []
  return topics.value
    .filter(item => {
      const topicSubjectId = item.subject_id ?? item.subjectId ?? item.subject?.id ?? item.subject?.subject_id
      return topicSubjectId != null
        && String(topicSubjectId) === String(selectedQuestionExamSubjectId.value)
    })
    .map(item => ({ value: String(item.id), label: item.name }))
})
watch([questionTopicOptions, taxonomyLoading], () => {
  const topicId = questionDraft.value?.topicId
  if (taxonomyLoading.value || !topicId) return
  if (!questionTopicOptions.value.some(item => item.value === String(topicId))) {
    questionDraft.value.topicId = ''
    sessionContext.value.topicId = ''
  }
})
async function fetchTaxonomy() {
  taxonomyLoading.value = true
  taxonomyError.value = ''
  try {
    const [categoryResponse, topicResponse, productResponse, subjectResponse] = await Promise.all([
      apiRequest(CATEGORIES_ENDPOINT),
      apiRequest(TOPICS_ENDPOINT),
      apiRequest(PRODUCTS_ENDPOINT),
      apiRequest(SUBJECTS_ENDPOINT),
    ])
    const categoryRows = responseRows(categoryResponse, ['categories', 'nursing_categories', 'nursingCategories'])
    const topicRows = responseRows(topicResponse, ['topics'])
    products.value = responseRows(productResponse, ['products'])
    subjects.value = responseRows(subjectResponse, ['subjects'])
    nursingCategories.value = categoryRows.map(item => ({
      ...item,
      id: item.id ?? item.nursing_category_id ?? item.category_id,
      name: item.name ?? item.nursing_category_name ?? item.category_name ?? item.title ?? item.label,
    })).filter(item => item.id != null && item.name)
    topics.value = topicRows.map(item => ({ ...item, id: item.id ?? item.topic_id, name: item.name ?? item.topic_name ?? item.title ?? item.label })).filter(item => item.id != null && item.name)
  } catch (error) {
    taxonomyError.value = 'Categories or topics could not be loaded. Check the configured API endpoints.'
  } finally {
    taxonomyLoading.value = false
  }
}
async function fetchQuestionTypes() {
  try {
    const response = await apiRequest(QUESTION_TYPES_ENDPOINT)
    questions.value = responseRows(response, ['question_types', 'questionTypes']).map((item, index) => {
      const sourceCode = item.code ?? item.type_code ?? item.key ?? ''
      const normalizedCode = String(sourceCode).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      const id = item.id ?? item.question_type_id
      const code = normalizedCode
      return {
        ...item,
        id: id ?? index + 1,
        name: item.name ?? item.title ?? item.label ?? code,
        code,
        description: item.description ?? item.short_description ?? '',
        details: item.details ?? item.guidance ?? '',
        active: item.active ?? item.is_active ?? (item.status ? item.status === 'active' : true),
        category: item.category ?? 'Core',
        updated: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '',
      }
    })
    if (new URLSearchParams(window.location.search).get('page') === 'question') syncQuestionRoute()
  } catch (error) {
    taxonomyError.value = error.message || 'Question types could not be loaded.'
  }
}
const form = ref(blankForm())
function blankForm() { return { id: null, name: '', code: '', description: '', details: '', active: true, category: 'Core' } }
const filters = ['All types', 'Core', 'Written', 'Interactive']
const visibleQuestions = computed(() => questions.value.filter(q => {
  const matchesFilter = activeFilter.value === 'All types' || q.category === activeFilter.value
  const term = query.value.trim().toLowerCase()
  return matchesFilter && (!term || `${q.name} ${q.code} ${q.description}`.toLowerCase().includes(term))
}))
const enabledCount = computed(() => questions.value.filter(q => q.active).length)
const questionLayout = computed(() => getQuestionTypeLayout(questionPage.value?.code))
const isFillBlank = computed(() => questionLayout.value.layout === 'fillBlank')
const isBowTie = computed(() => questionLayout.value.layout === 'bowTie')
const isMatrixMultipleResponse = computed(() => questionLayout.value.layout === 'matrixMultipleResponse')
const isMatrixClassification = computed(() => questionLayout.value.layout === 'matrixClassification')
const isDropdown = computed(() => questionLayout.value.layout === 'dropdown')
const isHighlight = computed(() => questionLayout.value.layout === 'highlight')
const usesChoices = computed(() => questionLayout.value.layout === 'choices')
const bowTieChoiceGroups = [
  { key: 'conditionOptions', title: 'Potential condition', correctLabel: 'Correct condition' },
  { key: 'actionOptions', title: 'Actions to take', correctLabel: 'Correct action' },
  { key: 'monitorOptions', title: 'Parameters to monitor', correctLabel: 'Correct parameter' },
]
const commonUnits = ['mg', 'mcg', 'g', 'kg', 'mL', 'L', 'units', 'IU', 'tablet(s)', 'capsule(s)', 'drop(s)', 'mEq', 'mmol', 'bpm', 'mmHg', '°C', '°F', '%']
let nextChoiceId = 1
let nextTabId = 1
let nextHighlightId = 1
let nextMatrixClassificationId = 1
let nextDropdownId = 1
function normalizeDraftTabs(value) {
  const tabs = parseJsonValue(value, [])
  if (!Array.isArray(tabs)) return []
  return tabs.map(tab => ({
    id: nextTabId++,
    title: typeof tab?.title === 'string' ? tab.title : '',
    content: typeof tab?.content === 'string' ? tab.content : '',
  }))
}
function blankQuestionDraft(type) {
  const layout = getQuestionTypeLayout(type.code)
  const initialChoices = layout.defaultChoices
  return {
    subtopicId: '',
    premadeExamId: '',
    topicId: '',
    questionIntro: '',
    prompt: '',
    answer: '',
    choices: initialChoices.map((option) => ({ id: nextChoiceId++, option, rationale: '', correct: false })),
    highlightTargets: [],
    bowTie: {
      conditionOptions: [blankBowTieOption('c1'), blankBowTieOption('c2')],
      actionOptions: [blankBowTieOption('a1'), blankBowTieOption('a2'), blankBowTieOption('a3')],
      monitorOptions: [blankBowTieOption('m1'), blankBowTieOption('m2'), blankBowTieOption('m3')],
    },
    matrixRows: [
      blankMatrixRow(),
      blankMatrixRow(),
      blankMatrixRow(),
    ],
    matrixClassificationColumns: [
      blankMatrixClassificationColumn(),
      blankMatrixClassificationColumn(),
    ],
    matrixClassificationRows: [
      blankMatrixClassificationRow(),
      blankMatrixClassificationRow(),
      blankMatrixClassificationRow(),
    ],
    dropdowns: [],
    tabs: [],
    unit: '',
    difficulty: 'medium',
    points: 1,
    explanation: '',
    status: 'draft',
    displayOrder: 0,
  }
}
function addHighlightTarget() {
  let id
  do { id = `h${nextHighlightId++}` }
  while (questionDraft.value.highlightTargets.some(target => target.id === id))
  const text = promptEditor.value?.wrapSelection('data-highlight-id', id) || ''
  if (!text) {
    questionPayloadError.value = 'Select some passage text in the editor before marking it as a highlight target.'
    return
  }
  questionPayloadError.value = ''
  questionDraft.value.highlightTargets.push({ id, text, correct: false })
}
function removeHighlightTarget(target) {
  promptEditor.value?.removeMarkedText('data-highlight-id', target.id)
  questionDraft.value.highlightTargets = questionDraft.value.highlightTargets.filter(item => item.id !== target.id)
}
function blankDropdownOption(id) {
  return { id, text: '', correct: false }
}
function addDropdown() {
  let id
  do { id = `d${nextDropdownId++}` }
  while (questionDraft.value.dropdowns.some(dropdown => dropdown.id === id))
  const nextNumber = questionDraft.value.dropdowns.reduce((highest, dropdown) => {
    const match = String(dropdown.label).match(/^Select (\d+)$/)
    return Math.max(highest, Number(match?.[1] || 0))
  }, 0) + 1
  const label = `Select ${nextNumber}`
  const inserted = promptEditor.value?.insertHtmlAtCursor(
    `<span data-dropdown-id="${id}">${label}</span>`,
  )
  if (!inserted) {
    questionPayloadError.value = 'The question editor is not ready to insert a dropdown. Try again in a moment.'
    return
  }
  questionPayloadError.value = ''
  questionDraft.value.dropdowns.push({
    id,
    label,
    options: [blankDropdownOption('a'), blankDropdownOption('b')],
  })
}
function removeDropdown(dropdown) {
  promptEditor.value?.removeMarkedText('data-dropdown-id', dropdown.id)
  questionDraft.value.dropdowns = questionDraft.value.dropdowns
    .filter(item => item.id !== dropdown.id)
}
function addDropdownOption(dropdown) {
  dropdown.options.push(blankDropdownOption(matrixOptionId(dropdown.options.length)))
}
function removeDropdownOption(dropdown, optionId) {
  dropdown.options = dropdown.options.filter(option => option.id !== optionId)
  dropdown.options.forEach((option, index) => { option.id = matrixOptionId(index) })
}
function setDropdownCorrect(dropdown, selectedOption) {
  dropdown.options.forEach(option => { option.correct = option.id === selectedOption.id })
}
function normalizeDropdowns(options, correctAnswer) {
  return options.dropdowns.map(dropdown => ({
    id: dropdown.id,
    label: dropdown.label,
    options: dropdown.options.map(option => ({
      id: option.id,
      text: option.text,
      correct: correctAnswer[dropdown.id] === option.id,
    })),
  }))
}
function blankMatrixRow() {
  return {
    id: `matrix-row-${nextChoiceId++}`,
    label: '',
    options: [
      { id: 'a', text: '', correct: false },
      { id: 'b', text: '', correct: false },
      { id: 'c', text: '', correct: false },
    ],
  }
}
function matrixRowKey(label) {
  return String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function matrixOptionId(index) {
  let value = index + 1
  let id = ''
  while (value > 0) {
    value -= 1
    id = String.fromCharCode(97 + value % 26) + id
    value = Math.floor(value / 26)
  }
  return id
}
function addMatrixRow() { questionDraft.value.matrixRows.push(blankMatrixRow()) }
function removeMatrixRow(rowId) {
  questionDraft.value.matrixRows = questionDraft.value.matrixRows.filter(row => row.id !== rowId)
}
function addMatrixOption(row) {
  row.options.push({ id: matrixOptionId(row.options.length), text: '', correct: false })
}
function removeMatrixOption(row, optionId) {
  row.options = row.options.filter(option => option.id !== optionId)
  row.options.forEach((option, index) => { option.id = matrixOptionId(index) })
}
function blankMatrixClassificationColumn() {
  return { id: `classification-column-${nextMatrixClassificationId++}`, label: '' }
}
function blankMatrixClassificationRow() {
  return { id: `classification-row-${nextMatrixClassificationId++}`, label: '', selectedColumnIds: [] }
}
function addMatrixClassificationColumn() {
  questionDraft.value.matrixClassificationColumns.push(blankMatrixClassificationColumn())
}
function removeMatrixClassificationColumn(columnId) {
  questionDraft.value.matrixClassificationColumns = questionDraft.value.matrixClassificationColumns
    .filter(column => column.id !== columnId)
  questionDraft.value.matrixClassificationRows.forEach(row => {
    row.selectedColumnIds = row.selectedColumnIds.filter(id => id !== columnId)
  })
}
function addMatrixClassificationRow() {
  questionDraft.value.matrixClassificationRows.push(blankMatrixClassificationRow())
}
function removeMatrixClassificationRow(rowId) {
  questionDraft.value.matrixClassificationRows = questionDraft.value.matrixClassificationRows
    .filter(row => row.id !== rowId)
}
function normalizeMatrixClassification(options, correctAnswer) {
  if (!options || Array.isArray(options) || typeof options !== 'object') return { columns: [], rows: [] }
  const entries = Object.entries(options)
  const sourceColumns = Array.isArray(entries[0]?.[1]?.options) ? entries[0][1].options : []
  const columns = sourceColumns.map((option, index) => ({
    id: `classification-column-${nextMatrixClassificationId++}`,
    answerId: String(option?.id ?? matrixOptionId(index)),
    label: String(option?.text ?? ''),
  }))
  const columnIdsByAnswerId = new Map(columns.map(column => [column.answerId, column.id]))
  const rows = entries.map(([key, row], index) => {
    const answerIds = String(correctAnswer?.[key]?.answers ?? '').split(',').map(id => id.trim()).filter(Boolean)
    return {
      id: `classification-row-${nextMatrixClassificationId++}`,
      label: String(row?.label ?? ''),
      selectedColumnIds: answerIds.map(id => columnIdsByAnswerId.get(id)).filter(Boolean),
    }
  })
  return { columns, rows }
}
function normalizeMatrixRows(options, correctAnswer) {
  if (!options || Array.isArray(options) || typeof options !== 'object') return []
  return Object.entries(options).map(([key, row], rowIndex) => {
    const correctIds = String(correctAnswer?.[key]?.answers ?? '').split(',').map(id => id.trim()).filter(Boolean)
    const rowOptions = Array.isArray(row?.options) ? row.options : []
    return {
      id: `matrix-row-${rowIndex + 1}-${nextChoiceId++}`,
      label: String(row?.label ?? ''),
      options: rowOptions.map((option, optionIndex) => ({
        id: String(option?.id ?? matrixOptionId(optionIndex)),
        text: String(option?.text ?? ''),
        correct: correctIds.includes(String(option?.id ?? matrixOptionId(optionIndex))),
      })),
    }
  })
}
function blankBowTieOption(id) { return { id, text: '', correct: false } }
function addBowTieOption(group) {
  const prefix = { conditionOptions: 'c', actionOptions: 'a', monitorOptions: 'm' }[group]
  const options = questionDraft.value.bowTie[group]
  let index = options.length + 1
  while (options.some(option => option.id === `${prefix}${index}`)) index += 1
  options.push(blankBowTieOption(`${prefix}${index}`))
}
function removeBowTieOption(group, optionId) {
  questionDraft.value.bowTie[group] = questionDraft.value.bowTie[group].filter(option => option.id !== optionId)
}
function setBowTieCorrect(group, option, checked) {
  if (group === 'conditionOptions' && checked) {
    questionDraft.value.bowTie[group].forEach(item => { item.correct = item.id === option.id })
  } else option.correct = checked
}
function normalizeBowTieOptions(options, prefix, correctIds = []) {
  if (!Array.isArray(options)) return []
  return options.map((option, index) => ({
    id: String(option?.id ?? `${prefix}${index + 1}`),
    text: String(option?.text ?? option?.option_text ?? ''),
    correct: correctIds.includes(String(option?.id ?? `${prefix}${index + 1}`)),
  }))
}
async function fetchSubtopics() {
  subtopicsLoading.value = true
  subtopicsError.value = ''
  try {
    const result = await apiRequest(SUBTOPICS_ENDPOINT)
    const rows = responseRows(result, ['subtopics'])
    subtopics.value = rows.map(item => ({ ...item, id: item.id ?? item.subtopic_id, name: item.name ?? item.title ?? item.subtopic_name })).filter(item => item.id != null && item.name)
  } catch (error) {
    subtopicsError.value = 'Subtopics could not be loaded. Check the subtopics API endpoint.'
  } finally {
    subtopicsLoading.value = false
  }
}
async function fetchPremadeExamOptions() {
  premadeExamsLoading.value = true
  premadeExamsError.value = ''
  try {
    const result = await apiRequest(QUESTION_EXAMS_ENDPOINT)
    const rows = responseRows(result, ['exams', 'premade_exams', 'premadeExams'])
    const normalizedExams = rows.map(item => ({ ...item, id: item.id ?? item.premade_exam_id, name: item.name ?? item.title })).filter(item => item.id != null && item.name)
    premadeExamOptions.value = normalizedExams
    premadeExams.value = normalizedExams
  } catch (error) {
    premadeExamsError.value = 'Premade exams could not be loaded. Check the premade exams API endpoint.'
  } finally {
    premadeExamsLoading.value = false
  }
}
async function fetchQuestions() {
  try {
    const result = await apiRequest(QUESTIONS_ENDPOINT)
    questionRecords.value = responseRows(result, ['questions']).map(normalizeQuestionRecord)
  } catch (error) {
    questionPayloadError.value = error.message || 'Questions could not be loaded.'
  }
}
function parseJsonValue(value, fallback = null) {
  if (typeof value !== 'string') return value ?? fallback
  try { return JSON.parse(value) } catch { return fallback }
}
function normalizeQuestionRecord(record) {
  return { ...record, options: parseJsonValue(record.options, []), correct_answer: parseJsonValue(record.correct_answer, []), tabs: parseJsonValue(record.tabs, null) }
}
function linkedSubtopic(record) { return subtopics.value.find(item => String(item.id) === String(record.subtopic_id)) }
function linkedExam(record) { return premadeExams.value.find(item => String(item.id) === String(record.premade_exam_id)) }
function questionProductId(record) {
  const topic = topics.value.find(item => String(item.id) === String(questionTopicId(record)))
  const subject = subjects.value.find(item => String(item.id ?? item.subject_id) === String(topic?.subject_id ?? topic?.subjectId))
  return record.product_id ?? record.product?.id ?? linkedSubtopic(record)?.product_id ?? linkedExam(record)?.product_id ?? topic?.product_id ?? subject?.product_id
}
function questionTopicId(record) { return record.topic_id ?? record.topic?.id ?? linkedSubtopic(record)?.topic_id ?? linkedExam(record)?.topic_id }
const allQuestionRecords = computed(() => {
  const { productId, topicId, premadeExamId } = allQuestionFilters.value
  const term = allQuestionSearch.value.trim().toLowerCase()
  return questionRecords.value.filter(record => {
    if (productId && String(questionProductId(record) ?? '') !== String(productId)) return false
    if (topicId && String(questionTopicId(record) ?? '') !== String(topicId)) return false
    if (premadeExamId && String(record.premade_exam_id ?? record.premade_exam?.id ?? '') !== String(premadeExamId)) return false
    return !term || `${plain(record.question_text)} ${record.id} ${questionTypeName(record.question_type_id)}`.toLowerCase().includes(term)
  })
})
async function editQuestionRecord(record) {
  try {
    const response = await apiRequest(`${QUESTIONS_ENDPOINT}/${record.id}`)
    const details = responseData(response)
    const current = normalizeQuestionRecord(details?.question || details)
    const type = questions.value.find(item => String(item.id) === String(current.question_type_id))
    if (!type) throw new Error('The question type for this record was not found.')
    routeToQuestion(type)
    editingQuestionId.value = current.id
    contextLocked.value = false
    const answers = Array.isArray(current.correct_answer) ? current.correct_answer : [current.correct_answer].filter(Boolean)
    const bowTieAnswers = current.correct_answer && !Array.isArray(current.correct_answer) ? current.correct_answer : {}
    const options = Array.isArray(current.options) ? current.options : []
    const highlightOptions = current.options?.highlight_targets
    const highlightAnswers = Array.isArray(current.correct_answer) ? current.correct_answer.map(String) : []
    questionDraft.value = {
      ...blankQuestionDraft(type), subtopicId: String(current.subtopic_id ?? ''),
      premadeExamId: current.premade_exam_id ? String(current.premade_exam_id) : '',
      topicId: current.topic_id ? String(current.topic_id) : '',
      questionIntro: current.question_intro || '', prompt: current.question_text || '',
      answer: getQuestionTypeLayout(type.code).correctAnswerMode === 'text' ? String(answers[0] ?? '') : '',
      choices: options.map((option, index) => ({
        id: nextChoiceId++,
        option: String(option.option_text ?? option.text ?? ''),
        rationale: option.rationale || '',
        correct: option.is_correct === true || Number(option.is_correct) === 1 || answers.includes(String(option.label ?? option.option_label ?? option.id ?? String.fromCharCode(65 + index))),
      })),
      ...(getQuestionTypeLayout(type.code).layout === 'bowTie' ? {
        bowTie: {
          conditionOptions: normalizeBowTieOptions(current.options?.condition_options, 'c', bowTieAnswers.condition),
          actionOptions: normalizeBowTieOptions(current.options?.action_options, 'a', bowTieAnswers.actions),
          monitorOptions: normalizeBowTieOptions(current.options?.monitor_options, 'm', bowTieAnswers.monitor),
        },
      } : {}),
      ...(getQuestionTypeLayout(type.code).layout === 'matrixMultipleResponse' ? {
        matrixRows: normalizeMatrixRows(current.options, current.correct_answer),
      } : {}),
      ...(getQuestionTypeLayout(type.code).layout === 'matrixClassification' ? (() => {
        const classification = normalizeMatrixClassification(current.options, current.correct_answer)
        return {
          matrixClassificationColumns: classification.columns,
          matrixClassificationRows: classification.rows,
        }
      })() : {}),
      ...(getQuestionTypeLayout(type.code).layout === 'dropdown' ? {
        dropdowns: normalizeDropdowns(current.options, current.correct_answer),
      } : {}),
      ...(getQuestionTypeLayout(type.code).layout === 'highlight' ? {
        highlightTargets: Array.isArray(highlightOptions) ? highlightOptions.map(target => ({
          id: String(target?.id ?? `h${nextHighlightId++}`),
          text: String(target?.text ?? ''),
          correct: highlightAnswers.includes(String(target?.id ?? '')),
        })) : [],
      } : {}),
      tabs: normalizeDraftTabs(current.tabs), unit: current.unit || '',
      difficulty: current.difficulty || 'medium', points: current.points ?? 1,
      explanation: current.explanation ?? current.explanation_text ?? current.full_explanation ?? '',
      status: current.status || 'draft', displayOrder: current.display_order ?? 0,
    }
    questionDrafts.value[type.code] = questionDraft.value
    if (current.subtopic_id) sessionContext.value.subtopicId = String(current.subtopic_id)
    if (current.premade_exam_id) sessionContext.value.premadeExamId = String(current.premade_exam_id)
    if (current.topic_id) sessionContext.value.topicId = String(current.topic_id)
  } catch (error) {
    questionPayloadError.value = error.message || 'The question could not be loaded.'
  }
}
async function deleteQuestionRecord(record) {
  if (!window.confirm(`Delete question #${record.id}?`)) return
  try {
    await apiRequest(`${QUESTIONS_ENDPOINT}/${record.id}`, { method: 'DELETE' })
    questionRecords.value = questionRecords.value.filter(item => String(item.id) !== String(record.id))
    toast.value = 'Question deleted'
    window.setTimeout(() => toast.value = '', 2400)
  } catch (error) {
    taxonomyError.value = error.message || 'The question could not be deleted.'
  }
}
function routeToQuestion(type, addHistory = true) {
  activeSection.value = 'questions'
  questionPage.value = type
  editingQuestionId.value = null
  lastQuestionPayload.value = null
  questionPayloadError.value = ''
  questionDraft.value = {
    ...blankQuestionDraft(type),
    ...(questionDrafts.value[type.code] || {}),
  }
  questionDraft.value.tabs = normalizeDraftTabs(questionDraft.value.tabs)
  if (getQuestionTypeLayout(type.code).layout === 'highlight' && !Array.isArray(questionDraft.value.highlightTargets)) {
    questionDraft.value.highlightTargets = []
  }
  if (sessionContext.value.subtopicId) questionDraft.value.subtopicId = sessionContext.value.subtopicId
  if (sessionContext.value.premadeExamId) questionDraft.value.premadeExamId = sessionContext.value.premadeExamId
  if (sessionContext.value.topicId) questionDraft.value.topicId = sessionContext.value.topicId
  if (addHistory) window.history.pushState({ questionType: type.code }, '', `?page=question&type=${encodeURIComponent(type.code)}`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function returnToQuestionTypes(addHistory = true) {
  if (questionPage.value && questionDraft.value) questionDrafts.value[questionPage.value.code] = questionDraft.value
  questionPage.value = null
  questionDraft.value = null
  editingQuestionId.value = null
  if (addHistory) window.history.pushState({}, '', window.location.pathname)
}
function syncQuestionRoute() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('page') === 'question') {
    activeSection.value = 'questions'
    const type = questions.value.find(item => item.code === params.get('type'))
    if (type) routeToQuestion(type, false)
    else { questionPage.value = null; questionDraft.value = null }
  } else {
    if (questionPage.value) returnToQuestionTypes(false)
    activeSection.value = ['exams', 'all-questions'].includes(params.get('section')) ? params.get('section') : 'questions'
  }
}
onMounted(() => {
  syncQuestionRoute()
  window.addEventListener('popstate', syncQuestionRoute)
  if (isAuthenticated.value && canEditContent.value) loadReferenceData()
})
onBeforeUnmount(() => window.removeEventListener('popstate', syncQuestionRoute))
function addChoice() { questionDraft.value.choices.push({ id: nextChoiceId++, option: '', rationale: '', correct: false }) }
function setQuestionUnit(unit) { questionDraft.value.unit = unit }
function removeChoice(choiceId) { questionDraft.value.choices = questionDraft.value.choices.filter(choice => choice.id !== choiceId) }
function setCorrect(choice, isCorrect) {
  if (questionLayout.value.correctAnswerMode === 'single' && isCorrect) {
    questionDraft.value.choices.forEach(item => { item.correct = item.id === choice.id })
  } else choice.correct = isCorrect
}
function addQuestionTab() {
  questionDraft.value.tabs.push({ id: nextTabId++, title: '', content: '' })
}
function removeQuestionTab(tabId) {
  questionDraft.value.tabs = questionDraft.value.tabs.filter(tab => tab.id !== tabId)
}
function setTabEditorRef(tabId, editor) {
  if (editor) tabEditors.value[tabId] = editor
  else delete tabEditors.value[tabId]
}
function insertExhibitPlaceholder() {
  introEditor.value?.syncContent()
  const marker = '<exhibit-placeholder></exhibit-placeholder>'
  const intro = questionDraft.value.questionIntro || ''
  if (!intro.includes(marker)) questionDraft.value.questionIntro = `${intro}${intro ? '\n' : ''}${marker}`
}
function updateSessionContext(field, value) {
  if (contextLocked.value) return
  sessionContext.value[field] = value
  questionDraft.value[field] = value
  if (field === 'premadeExamId' && questionDraft.value.topicId
    && !questionTopicOptions.value.some(item => item.value === String(questionDraft.value.topicId))) {
    questionDraft.value.topicId = ''
    sessionContext.value.topicId = ''
  }
}
function lockQuestionContext() {
  if (!questionDraft.value.subtopicId && !questionDraft.value.premadeExamId) return
  sessionContext.value.subtopicId = questionDraft.value.subtopicId
  sessionContext.value.premadeExamId = questionDraft.value.premadeExamId
  sessionContext.value.topicId = questionDraft.value.topicId
  contextLocked.value = true
  toast.value = 'Question context locked for this session'
  window.setTimeout(() => toast.value = '', 2400)
}
function unlockQuestionContext() { contextLocked.value = false }
function splitSentences(text) {
  const safeText = text.replace(/\b(Dr|Mr|Mrs|Ms|St|Prof|e\.g|i\.e|vs)\./gi, '$1<DOT>')
  return (safeText.match(/[^.!?]+(?:[.!?]+|$)/g) || [safeText]).map(part => part.replaceAll('<DOT>', '.').trim()).filter(Boolean)
}
function htmlText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ').trim()
}
function htmlRawText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
}
function splitHtmlAtTextIndex(html, index) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  let count = 0
  let target = null
  let offset = 0
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length || 0
    if (count + length >= index) { target = node; offset = index - count; break }
    count += length
  }
  if (!target) return [root.innerHTML, '']
  const before = doc.createRange()
  before.setStart(root, 0)
  before.setEnd(target, offset)
  const after = doc.createRange()
  after.setStart(target, offset)
  after.setEnd(root, root.childNodes.length)
  const left = doc.createElement('div')
  const right = doc.createElement('div')
  left.append(before.cloneContents())
  right.append(after.cloneContents())
  return [left.innerHTML, right.innerHTML]
}
function stripHtmlPrefix(html, expression) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = (doc.body.textContent || '').replace(/\u00a0/g, ' ')
  const match = text.match(expression)
  if (!match) return html
  return splitHtmlAtTextIndex(html, match[0].length)[1]
}
function firstSentenceSplit(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rawText = (doc.body.textContent || '').replace(/\u00a0/g, ' ')
  const text = rawText.trim()
  const sentences = splitSentences(text)
  if (sentences.length < 2) return null
  const firstSentence = sentences[0]
  const start = rawText.indexOf(firstSentence)
  return splitHtmlAtTextIndex(html, start + firstSentence.length)
}
function splitNodeAtBreaks(node) {
  if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') return [[], []]
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').split(/\r?\n/).map(text => [node.ownerDocument.createTextNode(text)])
  if (node.nodeType !== Node.ELEMENT_NODE) return [[node.cloneNode(true)]]
  const segments = [[node.cloneNode(false)]]
  for (const child of node.childNodes) {
    const childSegments = splitNodeAtBreaks(child)
    segments[segments.length - 1][0].append(...childSegments[0])
    for (const childSegment of childSegments.slice(1)) {
      const wrapper = node.cloneNode(false)
      wrapper.append(...childSegment)
      segments.push([wrapper])
    }
  }
  return segments
}
function readPasteBlocks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = [...doc.body.children].flatMap(element => {
    if (element.tagName === 'OL' || element.tagName === 'UL') {
      const items = [...element.children].filter(child => child.tagName === 'LI')
      return items.map((item, listIndex) => ({
        html: item.innerHTML,
        text: (item.textContent || '').replace(/\u00a0/g, ' ').trim(),
        listType: element.tagName === 'OL' ? 'ordered' : 'unordered',
        listIndex,
        listCount: items.length,
      }))
    }
    return splitNodeAtBreaks(element).map(nodes => {
      const wrapper = doc.createElement('div')
      wrapper.append(...nodes)
      return { html: wrapper.innerHTML, text: (wrapper.textContent || '').replace(/\u00a0/g, ' ').trim() }
    })
  }).filter(block => block.text)
  const sourceBlocks = blocks.length ? blocks : (htmlText(html) ? [{ html: `<p>${doc.body.innerHTML}</p>`, text: htmlText(html) }] : [])
  return sourceBlocks.flatMap(splitInlineNumberedChoices)
}
function splitInlineNumberedChoices(block) {
  const markerPattern = /(?:^|\s)([1-9]\d?)[.)]\s+/g
  const markers = [...htmlRawText(block.html).matchAll(markerPattern)].map(match => ({
    number: Number(match[1]),
    position: match.index + match[0].indexOf(match[1]),
  }))
  let firstChoiceMarker = -1
  for (let index = 1; index < markers.length - 1; index += 1) {
    if (markers[index + 1].number === markers[index].number + 1) { firstChoiceMarker = index; break }
  }
  if (firstChoiceMarker < 0) return [block]

  const optionMarkers = markers.slice(firstChoiceMarker)
  const splitPositions = optionMarkers.map(marker => marker.position)
  const fragments = []
  let remainingHtml = block.html
  let priorPosition = 0
  for (const position of splitPositions) {
    const [before, after] = splitHtmlAtTextIndex(remainingHtml, position - priorPosition)
    fragments.push(before)
    remainingHtml = after
    priorPosition = position
  }
  fragments.push(remainingHtml)
  return fragments.map(fragment => ({ html: fragment, text: htmlText(fragment) })).filter(item => item.text)
}
function detectChoiceLabels(blocks) {
  const letterPunct = /^\s*(?:(?:option|choice)\s*)?(?:\(([A-D])\)\s*|([A-D])\s*[.)]\s*)/i
  const letterSeparator = /^\s*(?:option|choice\s*)?([A-D])\s*[-:]\s*/i
  const letterBare = /^\s*([A-D])\s+\S/i
  const numberPunct = /^\s*(?:(?:option|choice)\s*)?(?:\(([1-9]\d?)\)\s*|([1-9]\d?)\s*[.)]\s*)/i
  const orderedListStart = blocks.findIndex((block, index) => index > 0 && block.listType === 'ordered' && block.listIndex === 0 && block.listCount >= 2)
  if (orderedListStart >= 0) return { index: orderedListStart, type: 'listNumber' }
  for (let index = 0; index < blocks.length; index += 1) {
    if (letterPunct.test(blocks[index].text)) return { index, type: 'letterPunct' }
    if (letterSeparator.test(blocks[index].text)) return { index, type: 'letterSeparator' }
  }
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const first = blocks[index].text.match(letterBare)
    const next = blocks[index + 1].text.match(letterBare)
    if (first && next && next[1].toUpperCase().charCodeAt(0) === first[1].toUpperCase().charCodeAt(0) + 1) return { index, type: 'letterBare' }
  }
  for (let index = 1; index < blocks.length - 1; index += 1) {
    const first = blocks[index].text.match(numberPunct)
    const next = blocks[index + 1].text.match(numberPunct)
    if (first && next && Number(next[1] || next[2]) === Number(first[1] || first[2]) + 1) return { index, type: 'numberPunct' }
  }
  return null
}
function removeChoiceLabel(html, type) {
  const expressions = {
    letterPunct: /^\s*(?:(?:option|choice)\s*)?(?:\([A-D]\)\s*|[A-D]\s*[.)]\s*)/i,
    letterSeparator: /^\s*(?:option|choice\s*)?[A-D]\s*[-:]\s*/i,
    letterBare: /^\s*[A-D]\s+/i,
    numberPunct: /^\s*(?:(?:option|choice)\s*)?(?:\([1-9]\d?\)\s*|[1-9]\d?\s*[.)]\s*)/i,
  }
  return type === 'listNumber' ? html : stripHtmlPrefix(html, expressions[type] || expressions.letterPunct)
}
function inlineChoiceParagraphs(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const paragraph of [...doc.body.querySelectorAll('p')]) {
    const replacement = doc.createDocumentFragment()
    if (paragraph.previousSibling) replacement.append(doc.createTextNode(' '))
    while (paragraph.firstChild) replacement.append(paragraph.firstChild)
    paragraph.replaceWith(replacement)
  }
  return `<p>${doc.body.innerHTML}</p>`
}
function parsePastedQuestion(html) {
  const blocks = readPasteBlocks(html)
  if (!blocks.length) throw new Error('Paste a question and its answer choices into the field first.')
  blocks[0].html = stripHtmlPrefix(blocks[0].html, /^\s*(?:question\s*)?\d+\s*[.)]\s*/i)
  blocks[0].html = stripHtmlPrefix(blocks[0].html, /^\s*intro\s*:\s*/i)
  blocks[0].text = htmlText(blocks[0].html)

  const detectedLabels = detectChoiceLabels(blocks)
  let intro = ''
  let prompt = ''
  let choiceBlocks = []

  if (detectedLabels) {
    const stemBlocks = blocks.slice(0, detectedLabels.index)
    if (!stemBlocks.length) throw new Error('Add the question text before the labeled choices.')
    const combined = stemBlocks.map(block => block.html).join('')
    const stemText = stemBlocks.map(block => block.text).join(' ')
    const split = firstSentenceSplit(combined)
    if (split && splitSentences(stemText).length >= 2) {
      intro = split[0]
      prompt = stripHtmlPrefix(split[1], /^\s*question\s*:\s*/i)
    } else if (stemBlocks.length >= 2) {
      intro = stripHtmlPrefix(stemBlocks[0].html, /^\s*intro\s*:\s*/i)
      prompt = stemBlocks.slice(1).map(block => block.html.replace(/^<p>\s*question\s*:\s*/i, '<p>')).join('')
    } else prompt = stripHtmlPrefix(combined, /^\s*question\s*:\s*/i)

    choiceBlocks = blocks.slice(detectedLabels.index).map(block => removeChoiceLabel(block.html, detectedLabels.type)).filter(content => htmlText(content))
  } else if (blocks.length >= 3) {
    const firstSplit = firstSentenceSplit(blocks[0].html)
    if (firstSplit && blocks.length >= 3) {
      intro = firstSplit[0]
      prompt = firstSplit[1]
      choiceBlocks = blocks.slice(1).map(block => block.html)
    } else if (blocks.length >= 4) {
      intro = blocks[0].html
      prompt = blocks[1].html
      choiceBlocks = blocks.slice(2).map(block => block.html)
    } else {
      prompt = blocks[0].html
      choiceBlocks = blocks.slice(1).map(block => block.html)
    }
  }

  const choices = choiceBlocks.map(content => inlineChoiceParagraphs(content).trim()).filter(content => htmlText(content))
  if (!htmlText(prompt) || choices.length < 2) throw new Error('Could not identify the question and at least two choices. Put each choice on its own line and label them A./B./C./D., A)/B)/C)/D), or 1./2./3./4.')
  return { intro, prompt, choices }
}
function importPastedQuestion() {
  wordImportError.value = ''
  wordImportMessage.value = ''
  try {
    const parsed = parsePastedQuestion(wordPasteHtml.value)
    questionDraft.value.questionIntro = parsed.intro
    questionDraft.value.prompt = parsed.prompt
    questionDraft.value.choices = parsed.choices.map(option => ({ id: nextChoiceId++, option, rationale: '', correct: false }))
    wordImportMessage.value = `Filled the intro, question, and ${parsed.choices.length} choices. Review the content before saving.`
  } catch (error) {
    wordImportError.value = error instanceof Error ? error.message : 'The pasted question could not be parsed.'
  }
}
async function convertLatexToMathML(source) {
  const mathJax = window.MathJax
  if (!mathJax?.tex2mmlPromise) throw new Error('MathJax is still loading. Try again in a moment.')
  const pattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  const matches = [...source.matchAll(pattern)]
  if (!matches.length) throw new Error('No LaTeX found. Use \\(…\\), \\[ … \\], or $…$ delimiters.')
  let converted = ''
  let cursor = 0
  for (const match of matches) {
    converted += source.slice(cursor, match.index)
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4]
    converted += await mathJax.tex2mmlPromise(tex.trim(), { display: false })
    cursor = match.index + match[0].length
  }
  return { content: converted + source.slice(cursor), count: matches.length }
}
async function convertPastedQuestionLatex() {
  wordImportError.value = ''
  wordImportMessage.value = ''
  try {
    window.clearTimeout(questionAutoImportTimer)
    const { content, count } = await convertLatexToMathML(wordPasteHtml.value)
    wordPasteHtml.value = content
    importPastedQuestion()
    wordImportMessage.value = `Converted ${count} LaTeX expression${count === 1 ? '' : 's'} to MathML and refreshed the question fields.`
  } catch (error) {
    wordImportError.value = error instanceof Error ? error.message : 'LaTeX conversion failed.'
  }
}
async function convertExplanationLatex() {
  explanationLatexError.value = ''
  explanationLatexMessage.value = ''
  explanationEditor.value?.syncContent()
  try {
    const { content, count } = await convertLatexToMathML(questionDraft.value.explanation || '')
    questionDraft.value.explanation = content
    explanationLatexMessage.value = `Converted ${count} LaTeX expression${count === 1 ? '' : 's'} to MathML.`
  } catch (error) {
    explanationLatexError.value = error instanceof Error ? error.message : 'LaTeX conversion failed.'
  }
}
function scheduleQuestionAutoImport() {
  window.clearTimeout(questionAutoImportTimer)
  if (htmlText(wordPasteHtml.value)) questionAutoImportTimer = window.setTimeout(importPastedQuestion, 500)
}
function rationaleLabel(text) {
  const letter = text.match(/^\s*(?:\(([A-D])\)|([A-D])\s*[.)])\s*/i)
  if (letter) return { index: (letter[1] || letter[2]).toUpperCase().charCodeAt(0) - 65, expression: /^\s*(?:\([A-D]\)\s*|[A-D]\s*[.)]\s*)/i }
  const number = text.match(/^\s*(?:\(([1-9]\d?)\)|([1-9]\d?)\s*[.)])\s*/)
  if (number) return { index: Number(number[1] || number[2]) - 1, expression: /^\s*(?:\([1-9]\d?\)\s*|[1-9]\d?\s*[.)]\s*)/ }
  return null
}
function importPastedRationales() {
  rationaleImportError.value = ''
  rationaleImportMessage.value = ''
  try {
    const blocks = readPasteBlocks(rationalePasteHtml.value)
    if (!blocks.length) throw new Error('Paste the labeled rationales into the field first.')
    const updates = []
    blocks.forEach((block, fallbackIndex) => {
      const label = rationaleLabel(block.text)
      const choiceIndex = label ? label.index : fallbackIndex
      if (choiceIndex < 0 || choiceIndex >= questionDraft.value.choices.length) return
      const contentHtml = label ? stripHtmlPrefix(block.html, label.expression) : block.html
      const rawContent = htmlRawText(contentHtml)
      const optionText = htmlText(questionDraft.value.choices[choiceIndex]?.option || '')
      const optionMatch = optionText && rawContent.trimStart().toLocaleLowerCase().startsWith(optionText.toLocaleLowerCase())
        ? rawContent.indexOf(optionText.trim()) + optionText.trim().length
        : -1
      const separatorMatch = rawContent.match(/[:\\]/)
      const splitAt = optionMatch >= 0
        ? optionMatch
        : separatorMatch
          ? separatorMatch.index + 1
          : 0
      const [, rationaleHtml] = splitHtmlAtTextIndex(contentHtml, splitAt)
      const cleanedRationale = rationaleHtml.replace(/^\s*(?:[:\\]|[-–—])\s*/, '')
      const rationale = cleanedRationale.trim()
      if (!htmlText(rationale)) throw new Error(`No rationale text found for choice ${String.fromCharCode(65 + choiceIndex)}.`)
      updates.push({ choiceIndex, rationale })
    })
    if (!updates.length) throw new Error('No matching choice rationales were found.')
    updates.forEach(({ choiceIndex, rationale }) => { questionDraft.value.choices[choiceIndex].rationale = rationale })
    rationaleImportMessage.value = `Filled ${updates.length} choice rationale${updates.length === 1 ? '' : 's'}. Review them before saving.`
  } catch (error) {
    rationaleImportError.value = error instanceof Error ? error.message : 'The rationales could not be parsed.'
  }
}
async function convertPastedRationalesLatex() {
  rationaleImportError.value = ''
  rationaleImportMessage.value = ''
  try {
    const { content, count } = await convertLatexToMathML(rationalePasteHtml.value)
    rationalePasteHtml.value = content
    importPastedRationales()
    if (rationaleImportError.value) return
    rationaleImportMessage.value = `Converted ${count} LaTeX expression${count === 1 ? '' : 's'} to MathML. ${rationaleImportMessage.value}`
  } catch (error) {
    rationaleImportError.value = error instanceof Error ? error.message : 'LaTeX conversion failed.'
  }
}
function scheduleRationaleAutoImport() {
  window.clearTimeout(rationaleAutoImportTimer)
  if (htmlText(rationalePasteHtml.value)) rationaleAutoImportTimer = window.setTimeout(importPastedRationales, 500)
}
async function saveQuestionContent() {
  questionPayloadError.value = ''
  introEditor.value?.syncContent()
  promptEditor.value?.syncContent()
  explanationEditor.value?.syncContent()
  Object.values(tabEditors.value).forEach(editor => editor?.syncContent())
  const draft = questionDraft.value
  const fullExplanation = [draft.explanation, draft.fullExplanation, draft.explanation_text]
    .find(value => typeof value === 'string' && value.trim()) || null
  if (!draft.subtopicId && !draft.premadeExamId) { questionPayloadError.value = 'Select a subtopic or premade exam before saving this question.'; return }
  if (!draft.prompt.trim()) { questionPayloadError.value = 'Enter the question before building the payload.'; return }
  if (questionLayout.value.correctAnswerMode === 'text' && !draft.answer.trim()) { questionPayloadError.value = 'Enter the accepted answer before building the payload.'; return }
  const dropdowns = isDropdown.value ? draft.dropdowns.map(dropdown => ({
    ...dropdown,
    options: dropdown.options.map((option, index) => ({
      ...option,
      id: matrixOptionId(index),
      text: option.text.trim(),
    })).filter(option => option.text),
  })) : null
  const promptDropdownIds = [...draft.prompt.matchAll(/data-dropdown-id=["']([^"']+)["']/g)]
    .map(match => match[1])
  if (isDropdown.value && (
    !dropdowns.length
    || new Set(promptDropdownIds).size !== promptDropdownIds.length
    || promptDropdownIds.length !== dropdowns.length
    || new Set(dropdowns.map(dropdown => dropdown.id)).size !== dropdowns.length
    || dropdowns.some(dropdown => !promptDropdownIds.includes(dropdown.id)
      || dropdown.options.length < 2
      || dropdown.options.filter(option => option.correct).length !== 1)
    || dropdowns.some(dropdown => {
      const optionTexts = dropdown.options.map(option => option.text.toLowerCase())
      return new Set(optionTexts).size !== optionTexts.length
    })
  )) {
    questionPayloadError.value = 'Insert at least one select placeholder. For each select, add at least two different options and mark exactly one correct answer.'
    return
  }
  const bowTieGroups = isBowTie.value ? {
    conditionOptions: draft.bowTie.conditionOptions.filter(option => option.text.trim()),
    actionOptions: draft.bowTie.actionOptions.filter(option => option.text.trim()),
    monitorOptions: draft.bowTie.monitorOptions.filter(option => option.text.trim()),
  } : null
  if (isBowTie.value && (
    !bowTieGroups.conditionOptions.some(option => option.correct)
    || !bowTieGroups.actionOptions.some(option => option.correct)
    || !bowTieGroups.monitorOptions.some(option => option.correct)
    || !bowTieGroups.conditionOptions.length
    || !bowTieGroups.actionOptions.length
    || !bowTieGroups.monitorOptions.length
  )) {
    questionPayloadError.value = 'Add options and mark at least one correct answer in the condition, actions, and monitoring groups.'
    return
  }
  const matrixRows = isMatrixMultipleResponse.value ? draft.matrixRows.map(row => ({
    ...row,
    key: matrixRowKey(row.label),
    options: row.options.map((option, index) => ({ ...option, id: matrixOptionId(index) }))
      .filter(option => option.text.trim()),
  })) : null
  if (isMatrixMultipleResponse.value && (
    !matrixRows.length
    || matrixRows.some(row => !row.label.trim() || !row.key || row.options.length === 0
      || !row.options.some(option => option.correct))
    || new Set(matrixRows.map(row => row.key)).size !== matrixRows.length
  )) {
    questionPayloadError.value = 'Each matrix row needs a unique label, at least one response option, and at least one correct response.'
    return
  }
  const matrixClassificationColumns = isMatrixClassification.value
    ? draft.matrixClassificationColumns.map((column, index) => ({
      ...column,
      answerId: matrixOptionId(index),
      label: column.label.trim(),
    }))
    : null
  const matrixClassificationRows = isMatrixClassification.value
    ? draft.matrixClassificationRows.map(row => ({
      ...row,
      key: matrixRowKey(row.label),
      label: row.label.trim(),
      selectedColumnIds: row.selectedColumnIds.filter(id =>
        draft.matrixClassificationColumns.some(column => column.id === id)),
    }))
    : null
  if (isMatrixClassification.value && (
    matrixClassificationColumns.length < 2
    || matrixClassificationColumns.some(column => !column.label)
    || new Set(matrixClassificationColumns.map(column => column.label.toLowerCase())).size
      !== matrixClassificationColumns.length
    || !matrixClassificationRows.length
    || matrixClassificationRows.some(row => !row.label || !row.key)
    || new Set(matrixClassificationRows.map(row => row.key)).size !== matrixClassificationRows.length
    || matrixClassificationColumns.some(column => !matrixClassificationRows.some(row =>
      row.selectedColumnIds.includes(column.id)))
  )) {
    questionPayloadError.value = 'Add at least two uniquely named classification columns and uniquely named findings, then select each classification in at least one finding.'
    return
  }
  const highlightTargets = isHighlight.value ? draft.highlightTargets : null
  if (isHighlight.value && (
    !highlightTargets.length
    || !highlightTargets.some(target => target.correct)
    || highlightTargets.some(target => !target.text.trim())
  )) {
    questionPayloadError.value = 'Mark at least one passage selection as a highlight target and choose at least one correct target.'
    return
  }
  const tabs = draft.tabs.length
    ? draft.tabs.map(({ title, content }) => ({ title, content }))
    : null
  const populatedChoices = draft.choices.map((choice, index) => ({
    id: String.fromCharCode(65 + index),
    text: choice.option.trim(),
    rationale: choice.rationale || '',
    correct: choice.correct,
  })).filter(choice => htmlText(choice.text))
  const bowTieOptions = bowTieGroups ? {
    condition_options: bowTieGroups.conditionOptions.map(({ id, text }) => ({ id, text: text.trim() })),
    action_options: bowTieGroups.actionOptions.map(({ id, text }) => ({ id, text: text.trim() })),
    monitor_options: bowTieGroups.monitorOptions.map(({ id, text }) => ({ id, text: text.trim() })),
    labels: {
      condition: 'Potential condition',
      actions: 'Actions to take',
      monitor: 'Parameters to monitor',
    },
  } : null
  const bowTieCorrectAnswer = bowTieGroups ? {
    condition: bowTieGroups.conditionOptions.filter(option => option.correct).map(option => option.id),
    actions: bowTieGroups.actionOptions.filter(option => option.correct).map(option => option.id),
    monitor: bowTieGroups.monitorOptions.filter(option => option.correct).map(option => option.id),
  } : null
  const matrixOptions = matrixRows ? Object.fromEntries(matrixRows.map(row => [row.key, {
    label: row.label.trim(),
    options: row.options.map(({ id, text }) => ({ id, text: text.trim() })),
  }])) : null
  const matrixCorrectAnswer = matrixRows ? Object.fromEntries(matrixRows.map(row => [row.key, {
    answers: row.options.filter(option => option.correct).map(option => option.id).join(','),
  }])) : null
  const matrixClassificationOptions = matrixClassificationRows ? Object.fromEntries(
    matrixClassificationRows.map(row => [row.key, {
      label: row.label,
      options: matrixClassificationColumns.map(column => ({
        id: column.answerId,
        text: column.label,
      })),
    }]),
  ) : null
  const matrixClassificationCorrectAnswer = matrixClassificationRows
    ? Object.fromEntries(matrixClassificationRows.map(row => [row.key, {
      answers: matrixClassificationColumns
        .filter(column => row.selectedColumnIds.includes(column.id))
        .map(column => column.answerId)
        .join(','),
    }]))
    : null
  const dropdownOptions = dropdowns ? {
    dropdowns: dropdowns.map(({ id, label, options }) => ({
      id,
      label,
      options: options.map(({ id: optionId, text }) => ({ id: optionId, text })),
    })),
  } : null
  const dropdownCorrectAnswer = dropdowns
    ? Object.fromEntries(dropdowns.map(dropdown => [
      dropdown.id,
      dropdown.options.find(option => option.correct)?.id,
    ]))
    : null
  const highlightOptions = highlightTargets ? {
    highlight_targets: highlightTargets.map(({ id, text }) => ({ id, text })),
  } : null
  const highlightCorrectAnswer = highlightTargets
    ? highlightTargets.filter(target => target.correct).map(target => target.id)
    : null
  const payload = {
    subtopic_id: draft.subtopicId ? Number(draft.subtopicId) : null,
    premade_exam_id: draft.premadeExamId ? Number(draft.premadeExamId) : null,
    topic_id: draft.topicId ? Number(draft.topicId) : null,
    question_type_id: Number(questionPage.value.id),
    question_intro: draft.questionIntro || null,
    question_text: draft.prompt,
    options: questionLayout.value.optionsPayload === 'highlightTargets' ? highlightOptions
      : questionLayout.value.optionsPayload === 'matrixMultipleResponse' ? matrixOptions
      : questionLayout.value.optionsPayload === 'matrixClassification' ? matrixClassificationOptions
      : questionLayout.value.optionsPayload === 'dropdowns' ? dropdownOptions
      : questionLayout.value.optionsPayload === 'bowTie' ? bowTieOptions
      : questionLayout.value.optionsPayload === 'choices' ? populatedChoices.map(({ id, text, rationale, correct }, index) => ({
        label: id,
        option_label: id,
        option_text: text,
        is_correct: correct,
        display_order: index,
        ...(rationale ? { rationale } : {}),
      })) : null,
    correct_answer: questionLayout.value.correctAnswerPayload === 'highlightIds' ? highlightCorrectAnswer
      : questionLayout.value.correctAnswerPayload === 'matrixMultipleResponse' ? matrixCorrectAnswer
      : questionLayout.value.correctAnswerPayload === 'matrixClassification' ? matrixClassificationCorrectAnswer
      : questionLayout.value.correctAnswerPayload === 'dropdowns' ? dropdownCorrectAnswer
      : questionLayout.value.correctAnswerPayload === 'bowTie' ? bowTieCorrectAnswer
      : questionLayout.value.correctAnswerPayload === 'textArray' ? [draft.answer.trim()]
        : populatedChoices.filter(choice => choice.correct).map(choice => choice.id),
    tabs,
    unit: draft.unit.trim() || null,
    difficulty: draft.difficulty,
    points: Number(draft.points),
    explanation: fullExplanation,
    status: draft.status,
    display_order: Number(draft.displayOrder),
  }
  if (isMatrixMultipleResponse.value || isMatrixClassification.value) {
    delete payload.tabs
    delete payload.unit
    delete payload.status
    delete payload.display_order
    payload.is_active = draft.status === 'active'
  }
  const isEditing = Boolean(editingQuestionId.value)
  const preservedMetadata = {
    subtopicId: draft.subtopicId,
    premadeExamId: draft.premadeExamId,
    topicId: draft.topicId,
    difficulty: draft.difficulty,
    points: draft.points,
    status: draft.status,
    displayOrder: draft.displayOrder,
  }
  questionSaving.value = true
  try {
    const { body: response, status: responseStatus } = await apiRequest(isEditing ? `${QUESTIONS_ENDPOINT}/${editingQuestionId.value}` : QUESTIONS_ENDPOINT, {
      method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(payload),
    }, true)
    const savedRecord = responseData(response)
    lastQuestionPayload.value = payload
    if (!editingQuestionId.value) savedQuestionPayloads.value.push(payload)
    const returnedQuestion = savedRecord?.question || savedRecord
    const savedQuestion = normalizeQuestionRecord(returnedQuestion?.id ? returnedQuestion : { ...payload, id: editingQuestionId.value })
    const recordIndex = questionRecords.value.findIndex(record => String(record.id) === String(editingQuestionId.value || savedQuestion.id))
    if (recordIndex >= 0) questionRecords.value.splice(recordIndex, 1, savedQuestion)
    else questionRecords.value.unshift(savedQuestion)
    payloadCopied.value = false
    if (!isEditing && responseStatus === 201) {
      const nextDraft = { ...blankQuestionDraft(questionPage.value), ...preservedMetadata }
      questionDraft.value = nextDraft
      questionDrafts.value[questionPage.value.code] = nextDraft
      wordPasteHtml.value = ''
      rationalePasteHtml.value = ''
      wordImportError.value = ''
      wordImportMessage.value = ''
      rationaleImportError.value = ''
      rationaleImportMessage.value = ''
      window.clearTimeout(questionAutoImportTimer)
      window.clearTimeout(rationaleAutoImportTimer)
      toast.value = 'Question created · ready for the next one'
    } else {
      questionDrafts.value[questionPage.value.code] = questionDraft.value
      toast.value = isEditing ? 'Question updated successfully' : 'Question created successfully'
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => toast.value = '', 2400)
  } catch (error) {
    questionPayloadError.value = error.message || 'The question could not be saved.'
  } finally {
    questionSaving.value = false
  }
}
async function copyQuestionPayload() {
  try {
    await navigator.clipboard.writeText(questionPayloadJson.value)
    payloadCopied.value = true
    window.setTimeout(() => payloadCopied.value = false, 1800)
  } catch {
    questionPayloadError.value = 'Clipboard access is unavailable in this browser.'
  }
}
function openNew() { form.value = blankForm(); modalOpen.value = true }
function editQuestion(q) { form.value = { ...q }; modalOpen.value = true }
function saveQuestion() {
  if (!form.value.name.trim() || !form.value.code.trim()) return
  if (form.value.id) {
    const i = questions.value.findIndex(q => q.id === form.value.id)
    if (i >= 0) questions.value[i] = { ...form.value, updated: 'Just now' }
  } else {
    const id = Math.max(0, ...questions.value.map(q => q.id)) + 1
    questions.value.unshift({ ...form.value, id, updated: 'Just now' })
  }
  modalOpen.value = false
  toast.value = 'Question type saved'
  window.setTimeout(() => toast.value = '', 2400)
}
function openSection(section) {
  activeSection.value = section
  questionPage.value = null
  questionDraft.value = null
  window.history.pushState({ section }, '', section === 'questions' ? window.location.pathname : `?section=${encodeURIComponent(section)}`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function openNewExam() { examForm.value = blankExam(); examModalOpen.value = true }
async function editExam(exam) {
  premadeExamSaveError.value = ''
  examForm.value = { ...blankExam(), ...exam }
  examModalOpen.value = true
  try {
    const response = await apiRequest(`${QUESTION_EXAMS_ENDPOINT}/${exam.id}`)
    const data = responseData(response)
    const details = data?.premade_exam ?? data?.exam ?? data
    const category = nursingCategories.value.find(item => String(item.id) === String(details.nursing_category_id))
    const topic = topics.value.find(item => String(item.id ?? item.topic_id) === String(details.topic_id))
    const subjectId = details.subject_id ?? topic?.subject_id ?? topic?.subjectId ?? ''
    const subject = subjects.value.find(item => String(item.id ?? item.subject_id) === String(subjectId))
    examForm.value = {
      ...blankExam(), ...details,
      product_id: details.product_id ?? subject?.product_id ?? subject?.productId ?? category?.product_id ?? category?.productId ?? '',
      subject_id: subjectId,
    }
  } catch (error) {
    premadeExamSaveError.value = error.message || 'Premade exam details could not be loaded.'
  }
}
function changeExamProduct(productId) {
  examForm.value.product_id = productId
  examForm.value.subject_id = ''
  examForm.value.nursing_category_id = ''
  examForm.value.topic_id = ''
}
function changeExamSubject(subjectId) {
  examForm.value.subject_id = subjectId
  examForm.value.topic_id = ''
}
async function saveExam() {
  if (!examForm.value.product_id || !examForm.value.subject_id || (requiresNursingCategory.value && !examForm.value.nursing_category_id) || !examForm.value.name.trim() || !examForm.value.slug.trim()) return
  premadeExamSaveError.value = ''
  premadeExamSaving.value = true
  const payload = {
    product_id: Number(examForm.value.product_id),
    subject_id: Number(examForm.value.subject_id),
    nursing_category_id: requiresNursingCategory.value ? Number(examForm.value.nursing_category_id) : null,
    topic_id: examForm.value.topic_id ? Number(examForm.value.topic_id) : null,
    name: examForm.value.name.trim(),
    slug: examForm.value.slug.trim(),
    short_description: examForm.value.short_description || null,
    description: examForm.value.description || null,
    question_count: Number(examForm.value.question_count) || 0,
    status: examForm.value.status,
  }
  try {
    const isUpdate = Boolean(examForm.value.id)
    const endpoint = isUpdate ? `${QUESTION_EXAMS_ENDPOINT}/${examForm.value.id}` : QUESTION_EXAMS_ENDPOINT
    const response = await apiRequest(endpoint, { method: isUpdate ? 'PUT' : 'POST', body: JSON.stringify(payload) })
    const responseValue = responseData(response)
    let saved = responseValue?.premade_exam ?? responseValue?.exam ?? responseValue
    let id = saved?.id ?? saved?.premade_exam_id ?? examForm.value.id
    if (id == null) {
      await fetchPremadeExamOptions()
      saved = premadeExamOptions.value.find(item => item.slug === payload.slug) || premadeExamOptions.value.find(item => item.name === payload.name)
      id = saved?.id
    }
    if (id == null) throw new Error('The exam was submitted, but the response did not include its ID.')
    const record = { ...payload, ...(saved || {}), id, product_id: Number(examForm.value.product_id), subject_id: Number(examForm.value.subject_id) }
    const existingIndex = premadeExams.value.findIndex(item => String(item.id) === String(id))
    if (existingIndex >= 0) premadeExams.value.splice(existingIndex, 1, record)
    else premadeExams.value.unshift(record)
    const optionIndex = premadeExamOptions.value.findIndex(item => String(item.id) === String(id))
    if (optionIndex >= 0) premadeExamOptions.value.splice(optionIndex, 1, record)
    else premadeExamOptions.value.unshift(record)
    sessionContext.value.premadeExamId = String(id)
    if (questionDraft.value) questionDraft.value.premadeExamId = String(id)
    examModalOpen.value = false
    toast.value = `${isUpdate ? 'Premade exam updated' : 'Premade exam saved'} · ID ${id}`
    window.setTimeout(() => toast.value = '', 3000)
  } catch (error) {
    premadeExamSaveError.value = error.message || 'Premade exam could not be saved.'
  } finally {
    premadeExamSaving.value = false
  }
}
async function removeExam(exam) {
  if (!window.confirm(`Delete “${exam.name}”?`)) return
  taxonomyError.value = ''
  try {
    await apiRequest(`${QUESTION_EXAMS_ENDPOINT}/${exam.id}`, { method: 'DELETE' })
    premadeExams.value = premadeExams.value.filter(item => String(item.id) !== String(exam.id))
    premadeExamOptions.value = premadeExamOptions.value.filter(item => String(item.id) !== String(exam.id))
    if (String(sessionContext.value.premadeExamId) === String(exam.id)) sessionContext.value.premadeExamId = ''
    toast.value = 'Premade exam deleted'
    window.setTimeout(() => toast.value = '', 2400)
  } catch (error) {
    taxonomyError.value = error.message || 'Premade exam could not be deleted.'
  }
}
function categoryName(id) { return nursingCategories.value.find(item => String(item.id) === String(id))?.name || `Category ${id}` }
function topicName(id) { return id ? topics.value.find(item => String(item.id) === String(id))?.name || `Topic ${id}` : 'Topic not set' }
function productName(id) { return products.value.find(item => String(item.id ?? item.product_id) === String(id))?.name || 'Product not set' }
function subjectName(id) { return subjects.value.find(item => String(item.id ?? item.subject_id) === String(id))?.name || 'Subject not set' }
function questionTypeName(id) { return questions.value.find(item => String(item.id) === String(id))?.name || `Type ${id}` }
function makeSlug(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function updateExamSlug() { examForm.value.slug = makeSlug(examForm.value.name) }
function removeQuestion(q) {
  if (!window.confirm(`Delete “${q.name}”?`)) return
  questions.value = questions.value.filter(item => item.id !== q.id)
  toast.value = 'Question type deleted'
  window.setTimeout(() => toast.value = '', 2400)
}
function toggleActive(q) { q.active = !q.active }
function plain(text) { return (text || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() }
</script>

<template>
  <main v-if="!isAuthenticated" class="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-5 py-10 text-slate-800">
    <form class="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_12px_50px_rgba(35,54,86,.08)] sm:p-9" @submit.prevent="login">
      <div class="mb-7 flex items-center gap-3"><div class="brand-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M16 5v22M5 16h22" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/></svg></div><div><div class="font-display text-[17px] font-extrabold tracking-tight text-slate-900">Nursemerit</div><div class="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Content admin</div></div></div>
      <p class="eyebrow">SECURE WORKSPACE</p><h1 class="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">Sign in</h1><p class="mt-2 text-sm leading-6 text-slate-500">Sign in with your admin account to manage nursing content.</p>
      <label class="form-field mt-6"><span>Email</span><input v-model="loginForm.email" type="email" autocomplete="username" required placeholder="you@example.com" /></label>
      <label class="form-field mt-4"><span>Password</span><input v-model="loginForm.password" type="password" autocomplete="current-password" required placeholder="Your password" /></label>
      <p v-if="loginError" class="field-error mt-4 rounded-lg bg-rose-50 px-3 py-2">{{ loginError }}</p>
      <button class="primary-button mt-6 w-full justify-center" type="submit" :disabled="loginLoading">{{ loginLoading ? 'Signing in…' : 'Sign in' }} <span>→</span></button>
      <p class="mt-4 text-center text-[11px] text-slate-400">The API token is stored in this browser for authenticated requests.</p>
    </form>
  </main>
  <main v-else-if="!canEditContent" class="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-5 py-10 text-slate-800">
    <section class="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-7 text-center shadow-[0_12px_50px_rgba(35,54,86,.08)] sm:p-9">
      <p class="eyebrow text-rose-600">ACCESS DENIED</p>
      <h1 class="mt-2 font-display text-2xl font-extrabold tracking-tight text-slate-900">No permission</h1>
      <p class="mt-2 text-sm leading-6 text-slate-500">Only admin and super-admin accounts can access content editing.</p>
      <button class="primary-button mt-6 w-full justify-center" type="button" @click="logout">Sign out</button>
    </section>
  </main>
  <div v-else class="min-h-screen bg-[#f6f8fb] text-slate-800">
    <aside class="sidebar fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white lg:flex">
      <div class="flex h-[76px] items-center gap-3 px-6">
        <div class="brand-mark"><svg viewBox="0 0 32 32" fill="none"><path d="M16 5v22M5 16h22" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2"/></svg></div>
        <div><div class="font-display text-[17px] font-extrabold tracking-tight text-slate-900">Nursemerit</div><div class="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Learning platform</div></div>
      </div>
      <div class="px-4 pt-8"><p class="nav-label">WORKSPACE</p>
        <nav class="mt-3 space-y-1">
          <a class="nav-item" href="#"><span class="nav-icon">▦</span>Overview</a>
          <a class="nav-item" href="#" @click.prevent="openSection('questions')"><span class="nav-icon">▤</span>Courses <span class="nav-count">12</span></a>
          <a class="nav-item" :class="{ current: activeSection === 'questions' }" href="#" @click.prevent="openSection('questions')"><span class="nav-icon">▧</span>Question types</a>
          <a class="nav-item" :class="{ current: activeSection === 'all-questions' }" href="#" @click.prevent="openSection('all-questions')"><span class="nav-icon">☷</span>All questions</a>
          <a class="nav-item" :class="{ current: activeSection === 'exams' }" href="#" @click.prevent="openSection('exams')"><span class="nav-icon">▣</span>Premade exams</a>
          <a class="nav-item" href="#"><span class="nav-icon">♧</span>Learners</a>
          <a class="nav-item" href="#"><span class="nav-icon">◷</span>Reports</a>
        </nav>
        <p class="nav-label mt-9">PREFERENCES</p>
        <nav class="mt-3 space-y-1"><a class="nav-item" href="#"><span class="nav-icon">⚙</span>Settings</a><a class="nav-item" href="#"><span class="nav-icon">◉</span>Help center</a></nav>
      </div>
      <div class="mt-auto p-4"><div class="upgrade-card"><div class="mb-2 flex items-center gap-2"><span class="sparkle">✦</span><span class="text-xs font-bold text-slate-800">Nursemerit Pro</span></div><p class="text-xs leading-5 text-slate-500">Create richer learning experiences for your nursing team.</p><button class="mt-3 text-xs font-bold text-indigo-600">Explore features <span>→</span></button></div>
        <div class="mt-4 flex items-center gap-3 border-t border-slate-100 px-2 pt-4"><div class="avatar">{{ profileInitials }}</div><div class="min-w-0 flex-1"><p class="truncate text-xs font-bold text-slate-800">{{ profileName }}</p><p class="text-[11px] text-slate-400">{{ profile?.roles?.[0] || 'Content admin' }}</p></div><button class="text-slate-400" title="Sign out" @click="logout">↪</button></div></div>
    </aside>

    <main v-if="!questionPage && activeSection === 'questions'" class="lg:ml-[248px]">
      <header class="topbar flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
        <div class="flex items-center gap-3"><div class="mobile-mark lg:hidden">✚</div><div class="text-[13px] text-slate-400">Workspace <span class="mx-2 text-slate-300">/</span><span class="font-semibold text-slate-700">Question types</span></div></div>
        <div class="flex items-center gap-4"><button class="icon-button relative" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-dot"></span></button><div class="hidden h-8 w-px bg-slate-200 sm:block"></div><div class="avatar">{{ profileInitials }}</div><button class="text-xs font-semibold text-slate-500 hover:text-indigo-600" @click="logout">Sign out</button></div>
      </header>
      <div class="mx-auto max-w-[1440px] px-5 pb-12 pt-8 sm:px-8 sm:pt-10 xl:px-12">
        <div class="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div class="mb-2 flex items-center gap-2"><span class="eyebrow-dot"></span><span class="eyebrow">CONTENT LIBRARY</span></div><h1 class="font-display text-[29px] font-extrabold tracking-[-.04em] text-slate-900 sm:text-[34px]">Question types</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Build and manage the question formats that power your nursing assessments.</p></div>
          <button class="primary-button" @click="openNew"><span class="text-lg leading-none">+</span> Add question type</button>
        </div>
        <section class="stats-grid mb-7 grid gap-4 sm:grid-cols-3">
          <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4m-5 3v4"/></svg></div><div><p class="stat-label">TOTAL QUESTION TYPES</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">{{ questions.length }}</span><span class="stat-change">formats available</span></div></div><div class="stat-spark">▂▅▄▇▅▆</div></div>
          <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div><div><p class="stat-label">ACTIVE FORMATS</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">{{ enabledCount }}</span><span class="stat-change">ready to use</span></div></div><div class="status-chip"><i></i>All systems go</div></div>
          <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24"><path d="M4 19V5m0 14h17M8 15l3-4 3 2 5-7"/></svg></div><div><p class="stat-label">CONTENT CATEGORIES</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">03</span><span class="stat-change">organized groups</span></div></div><div class="stat-orbit">✳</div></div>
        </section>
        <div v-if="taxonomyError" class="mb-5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">{{ taxonomyError }}</div>
        <section class="content-panel overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(35,54,86,.025)]">
          <div class="panel-heading flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h2 class="font-display text-[16px] font-bold text-slate-900">All question types</h2><p class="mt-1 text-xs text-slate-400">Manage question formats across your courses</p></div><button class="export-button" @click="toast='Export is ready'; setTimeout(() => toast='', 2200)"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg>Export list</button></div>
          <div class="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div class="filter-tabs"> <button v-for="filter in filters" :key="filter" class="filter-tab" :class="{ selected: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}<span v-if="filter==='All types'" class="tab-count">{{ questions.length }}</span></button></div><label class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg><input v-model="query" placeholder="Search question types..."/><kbd>⌘ K</kbd></label></div>
          <div class="table-scroll"><table class="w-full border-collapse text-left"><thead><tr><th class="w-[30%]">QUESTION TYPE</th><th class="w-[16%]">TYPE CODE</th><th class="w-[31%]">DESCRIPTION</th><th class="w-[12%]">STATUS</th><th class="w-[11%] text-right">ACTIONS</th></tr></thead><tbody>
            <tr v-for="q in visibleQuestions" :key="q.id" class="question-row" :class="{ 'row-selected': selected === q.id }" @click="routeToQuestion(q)"><td><div class="flex items-center gap-3"><div class="type-icon" :class="'type-'+(q.id%5)"><span v-if="q.code.includes('MCQ')">☷</span><span v-else-if="q.code==='TRUE_FALSE'">✓</span><span v-else-if="q.code==='MATCHING'">⇄</span><span v-else-if="q.code==='ESSAY'">¶</span><span v-else-if="q.code==='HOTSPOT'">◎</span><span v-else-if="q.code==='DRAG_DROP'">⠿</span><span v-else>▤</span></div><div class="min-w-0"><p class="truncate text-[13px] font-bold text-slate-800">{{ q.name }}</p><p class="mt-1 text-[11px] text-slate-400">{{ q.category }} <span class="mx-1">·</span> Updated {{ q.updated }}</p></div></div></td><td><span class="code-badge">{{ q.code }}</span></td><td><p class="line-clamp-2 max-w-[380px] text-xs leading-[19px] text-slate-500">{{ plain(q.description) }}</p></td><td><button class="status-toggle" :class="{ off: !q.active }" @click.stop="toggleActive(q)"><span class="toggle-dot"></span>{{ q.active ? 'Active' : 'Inactive' }}</button></td><td><div class="flex justify-end gap-1"><button class="row-action" title="Write a question" @click.stop="routeToQuestion(q)"><svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button><button class="row-action danger" title="Delete" @click.stop="removeQuestion(q)"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button><button class="row-action more" title="Edit type details" @click.stop="editQuestion(q)">···</button></div></td></tr>
            <tr v-if="visibleQuestions.length === 0"><td colspan="5" class="empty-state"><div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-xl text-slate-400">⌕</div><p class="font-bold text-slate-700">No question types found</p><p class="mt-1 text-xs text-slate-400">Try another search or add a new format.</p></td></tr>
          </tbody></table></div>
          <div class="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:px-6"><span>Showing <b class="font-semibold text-slate-600">{{ visibleQuestions.length ? 1 : 0 }}–{{ visibleQuestions.length }}</b> of <b class="font-semibold text-slate-600">{{ questions.length }}</b> question types</span><div class="flex items-center gap-3"><span>Rows per page</span><button class="rows-button">20 <span>⌄</span></button><div class="flex gap-1"><button class="page-button disabled" aria-label="Previous">‹</button><button class="page-button active-page">1</button><button class="page-button disabled" aria-label="Next">›</button></div></div></div>
        </section>
        <section class="content-panel mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(35,54,86,.025)]">
          <div class="panel-heading flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h2 class="font-display text-[16px] font-bold text-slate-900">Saved questions</h2><p class="mt-1 text-xs text-slate-400">Questions loaded from the Laravel content API</p></div><span class="code-badge">{{ questionRecords.length }} total</span></div>
          <div class="table-scroll"><table class="w-full border-collapse text-left"><thead><tr><th>QUESTION</th><th>TYPE</th><th>STATUS</th><th class="text-right">ACTIONS</th></tr></thead><tbody>
            <tr v-for="record in questionRecords" :key="record.id" class="question-row"><td><p class="max-w-[520px] truncate text-[13px] font-semibold text-slate-800">{{ plain(record.question_text) || 'Untitled question' }}</p><p class="mt-1 text-[10px] text-slate-400">ID {{ record.id }} · Subtopic {{ record.subtopic_id }}</p></td><td><span class="code-badge">{{ questionTypeName(record.question_type_id) }}</span></td><td><span class="exam-status" :class="'exam-'+(record.status || 'draft')">{{ record.status || 'draft' }}</span></td><td><div class="flex justify-end gap-1"><button class="row-action" title="Edit question" @click="editQuestionRecord(record)"><svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button><button class="row-action danger" title="Delete question" @click="deleteQuestionRecord(record)"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></div></td></tr>
            <tr v-if="questionRecords.length === 0"><td colspan="4" class="empty-state"><p class="font-bold text-slate-700">No saved questions yet</p><p class="mt-1 text-xs text-slate-400">Build a question in any question type to add it here.</p></td></tr>
          </tbody></table></div>
        </section>
        <div class="mt-5 flex items-center gap-2 text-[11px] text-slate-400"><span class="text-indigo-400">✦</span> Built for better learning outcomes <span class="mx-1 text-slate-300">·</span> Last synced just now</div>
      </div>
    </main>

    <main v-else-if="!questionPage && activeSection === 'all-questions'" class="lg:ml-[248px]">
      <header class="topbar flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
        <div class="flex items-center gap-3"><div class="mobile-mark lg:hidden">✚</div><div class="text-[13px] text-slate-400">Workspace <span class="mx-2 text-slate-300">/</span><span class="font-semibold text-slate-700">All questions</span></div></div>
        <div class="flex items-center gap-4"><div class="avatar">{{ profileInitials }}</div><button class="text-xs font-semibold text-slate-500 hover:text-indigo-600" @click="logout">Sign out</button></div>
      </header>
      <div class="mx-auto max-w-[1440px] px-5 pb-12 pt-8 sm:px-8 sm:pt-10 xl:px-12">
        <div class="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div class="mb-2 flex items-center gap-2"><span class="eyebrow-dot"></span><span class="eyebrow">QUESTION LIBRARY</span></div><h1 class="font-display text-[29px] font-extrabold tracking-[-.04em] text-slate-900 sm:text-[34px]">All questions</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Browse saved questions by product, topic, and premade exam.</p></div><button class="primary-button" @click="openSection('questions')"><span class="text-lg leading-none">+</span> Add new question</button></div>
        <section class="content-panel overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(35,54,86,.025)]">
          <div class="panel-heading flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h2 class="font-display text-[16px] font-bold text-slate-900">Question bank</h2><p class="mt-1 text-xs text-slate-400">{{ allQuestionRecords.length }} matching question{{ allQuestionRecords.length === 1 ? '' : 's' }}</p></div><label class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg><input v-model="allQuestionSearch" placeholder="Search questions..."/></label></div>
          <div class="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-3 sm:px-6">
            <label class="form-field"><span>Product</span><select v-model="allQuestionFilters.productId"><option value="">All products</option><option v-for="item in products" :key="item.id ?? item.product_id" :value="String(item.id ?? item.product_id)">{{ item.name ?? item.title ?? item.code }}</option></select></label>
            <label class="form-field"><span>Topic</span><select v-model="allQuestionFilters.topicId"><option value="">All topics</option><option v-for="item in topics" :key="item.id" :value="String(item.id)">{{ item.name }}</option></select></label>
            <label class="form-field"><span>Premade exam</span><select v-model="allQuestionFilters.premadeExamId"><option value="">All exams</option><option v-for="item in premadeExams" :key="item.id" :value="String(item.id)">{{ item.name }}</option></select></label>
          </div>
          <div class="table-scroll"><table class="w-full border-collapse text-left"><thead><tr><th>QUESTION</th><th>PRODUCT / TOPIC</th><th>PREMADE EXAM</th><th>TYPE</th><th>STATUS</th><th class="text-right">ACTIONS</th></tr></thead><tbody>
            <tr v-for="record in allQuestionRecords" :key="record.id" class="question-row"><td><p class="max-w-[520px] truncate text-[13px] font-semibold text-slate-800">{{ plain(record.question_text) || 'Untitled question' }}</p><p class="mt-1 text-[10px] text-slate-400">ID {{ record.id }} · Subtopic {{ record.subtopic_id ?? '—' }}</p></td><td><p class="text-xs font-semibold text-slate-700">{{ productName(questionProductId(record)) }}</p><p class="mt-1 text-[10px] text-slate-400">{{ questionTopicId(record) ? topicName(questionTopicId(record)) : 'Topic not set' }}</p></td><td><span class="text-xs text-slate-600">{{ premadeExamOptions.find(item => String(item.id) === String(record.premade_exam_id))?.name || '—' }}</span></td><td><span class="code-badge">{{ questionTypeName(record.question_type_id) }}</span></td><td><span class="exam-status" :class="'exam-'+(record.status || 'draft')">{{ record.status || 'draft' }}</span></td><td><div class="flex justify-end gap-1"><button class="row-action" title="Edit question" @click="editQuestionRecord(record)"><svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button><button class="row-action danger" title="Delete question" @click="deleteQuestionRecord(record)"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></div></td></tr>
            <tr v-if="allQuestionRecords.length === 0"><td colspan="6" class="empty-state"><p class="font-bold text-slate-700">No matching questions</p><p class="mt-1 text-xs text-slate-400">Adjust the filters or create questions in Question types.</p></td></tr>
          </tbody></table></div>
        </section>
      </div>
    </main>

    <main v-else-if="!questionPage && activeSection === 'exams'" class="lg:ml-[248px]">
      <header class="topbar flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
        <div class="flex items-center gap-3"><div class="mobile-mark lg:hidden">✚</div><div class="text-[13px] text-slate-400">Workspace <span class="mx-2 text-slate-300">/</span><span class="font-semibold text-slate-700">Premade exams</span></div></div>
        <div class="flex items-center gap-4"><button class="icon-button relative" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="notification-dot"></span></button><div class="hidden h-8 w-px bg-slate-200 sm:block"></div><div class="avatar">{{ profileInitials }}</div><button class="text-xs font-semibold text-slate-500 hover:text-indigo-600" @click="logout">Sign out</button></div>
      </header>
      <div class="mx-auto max-w-[1440px] px-5 pb-12 pt-8 sm:px-8 sm:pt-10 xl:px-12">
        <div class="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div class="mb-2 flex items-center gap-2"><span class="eyebrow-dot"></span><span class="eyebrow">ASSESSMENT LIBRARY</span></div><h1 class="font-display text-[29px] font-extrabold tracking-[-.04em] text-slate-900 sm:text-[34px]">Premade exams</h1><p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create and organize ready-made nursing exams by category, with optional topics on individual questions.</p></div><button class="primary-button" @click="openNewExam"><span class="text-lg leading-none">+</span> Create premade exam</button></div>
        <section class="stats-grid mb-7 grid gap-4 sm:grid-cols-3"><div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></div><div><p class="stat-label">PREMADE EXAMS</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">{{ premadeExams.length }}</span><span class="stat-change">in your library</span></div></div></div><div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div><div><p class="stat-label">ACTIVE EXAMS</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">{{ premadeExams.filter(item => item.status === 'active').length }}</span><span class="stat-change">ready to assign</span></div></div></div><div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24"><path d="M4 19V5m0 14h17M8 15l3-4 3 2 5-7"/></svg></div><div><p class="stat-label">QUESTION TOPICS</p><div class="mt-1 flex items-baseline gap-2"><span class="stat-value">{{ new Set(questionRecords.map(item => questionTopicId(item)).filter(Boolean)).size }}</span><span class="stat-change">used by questions</span></div></div></div></section>
        <section class="content-panel overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(35,54,86,.025)]"><div class="panel-heading flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h2 class="font-display text-[16px] font-bold text-slate-900">Exam library</h2><p class="mt-1 text-xs text-slate-400">Premade exams linked to nursing categories; topic is optional for mixed-topic exams</p></div><span class="code-badge">{{ premadeExams.length }} total</span></div>
          <div v-if="taxonomyError" class="mx-5 mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:mx-6">{{ taxonomyError }} <span class="ml-1 text-amber-700">({{ CATEGORIES_ENDPOINT }}, {{ TOPICS_ENDPOINT }})</span></div>
          <div class="table-scroll"><table class="w-full border-collapse text-left"><thead><tr><th>EXAM</th><th>CATEGORY / TOPIC</th><th>CODE / SLUG</th><th>QUESTIONS</th><th>STATUS</th><th class="text-right">ACTIONS</th></tr></thead><tbody><tr v-for="exam in premadeExams" :key="exam.id" class="question-row"><td><p class="text-[13px] font-bold text-slate-800">{{ exam.name }}</p><p class="mt-1 max-w-[280px] truncate text-[11px] text-slate-400">{{ plain(exam.short_description) || 'No short description' }}</p><p class="mt-1 text-[10px] text-slate-400">{{ productName(exam.product_id) }} · {{ subjectName(exam.subject_id) }}</p></td><td><p class="text-xs font-semibold text-slate-700">{{ categoryName(exam.nursing_category_id) }}</p><p class="mt-1 text-[11px] text-slate-400">{{ topicName(exam.topic_id) }}</p></td><td><span class="code-badge">{{ exam.code }}</span><p class="mt-1 text-[10px] text-slate-400">{{ exam.slug }}</p></td><td><span class="text-xs font-semibold text-slate-700">{{ exam.question_count }}</span></td><td><span class="exam-status" :class="'exam-'+exam.status">{{ exam.status }}</span></td><td><div class="flex justify-end gap-1"><button class="row-action" title="Edit exam" @click="editExam(exam)"><svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg></button><button class="row-action danger" title="Delete exam" @click="removeExam(exam)"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></div></td></tr>
            <tr v-if="premadeExams.length === 0"><td colspan="6" class="empty-state"><div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-xl text-slate-400">▣</div><p class="font-bold text-slate-700">No premade exams yet</p><p class="mt-1 text-xs text-slate-400">Create an exam and link it to a nursing category.</p><button class="mt-4 text-xs font-bold text-indigo-600" @click="openNewExam">Create your first exam →</button></td></tr>
          </tbody></table></div>
          <div class="border-t border-slate-100 px-5 py-4 text-xs text-slate-400 sm:px-6">Showing {{ premadeExams.length }} premade exam{{ premadeExams.length === 1 ? '' : 's' }}</div>
        </section>
      </div>
    </main>

    <main v-else class="question-builder min-h-screen lg:ml-[248px]">
      <header class="topbar flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white px-5 sm:px-8">
        <div class="flex items-center gap-3"><button class="back-button" @click="returnToQuestionTypes()" aria-label="Back to question types">←</button><div class="text-[13px] text-slate-400">Question types <span class="mx-2 text-slate-300">/</span><span class="font-semibold text-slate-700">{{ questionPage.name }}</span></div></div>
        <div class="flex items-center gap-3"><span class="draft-badge" :class="{ 'editing-badge': editingQuestionId }"><i></i>{{ editingQuestionId ? `Editing #${editingQuestionId}` : 'Draft' }}</span><div class="avatar">{{ profileInitials }}</div><button class="text-xs font-semibold text-slate-500 hover:text-indigo-600" @click="logout">Sign out</button></div>
      </header>
      <div class="question-builder-content mx-auto max-w-[1000px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
        <button class="builder-back-link" @click="returnToQuestionTypes()">← <span>All question types</span></button>
        <div class="mb-7 mt-5"><div class="mb-2 flex items-center gap-2"><span class="eyebrow-dot"></span><span class="eyebrow">{{ editingQuestionId ? 'EDIT SAVED QUESTION' : `${questionPage.category} QUESTION` }}</span></div><div class="flex flex-wrap items-end justify-between gap-3"><div><h1 class="font-display text-[28px] font-extrabold tracking-[-.04em] text-slate-900">{{ editingQuestionId ? 'Edit question' : questionPage.name }}</h1><p class="mt-2 text-sm text-slate-500">{{ editingQuestionId ? 'Update the question content, answer choices, context, or publishing details.' : isFillBlank ? 'Create a fill-in-the-blank question with an accepted answer and unit.' : 'Create a question and provide feedback for each answer choice.' }}</p></div><span class="code-badge">{{ questionPage.code }}</span></div></div>
        <form class="question-form-card" @submit.prevent="saveQuestionContent">
          <section class="builder-section"><div class="section-heading"><span class="section-number">01</span><div><h2>Question settings</h2><p>Choose where this question belongs and set its scoring and publishing details.</p></div></div>
            <div class="context-lock-card"><div><p class="context-lock-title">Question batch context <span class="context-state" :class="{ locked: contextLocked }">{{ contextLocked ? 'Locked for this session' : 'Editable' }}</span></p><p class="context-lock-copy">{{ contextLocked ? 'These selections will carry into new questions, including across question types.' : 'Choose a subtopic or premade exam, then lock it to reuse across your question batch.' }}</p></div><button v-if="!contextLocked" type="button" class="context-lock-button" :disabled="!questionDraft.subtopicId && !questionDraft.premadeExamId" @click="lockQuestionContext">Lock for session</button><button v-else type="button" class="context-lock-button unlock" @click="unlockQuestionContext">Change context</button></div>
            <div class="question-meta-grid">
              <label class="form-field"><span>Subtopic <b v-if="subtopicRequired">*</b><small v-else>Optional when a premade exam is locked</small></span><SearchableSelect v-model="questionDraft.subtopicId" :options="subtopicOptions" :disabled="subtopicsLoading || contextLocked" :placeholder="subtopicRequired ? 'Select a subtopic' : 'Optional · exam context is locked'" @change="updateSessionContext('subtopicId', $event)"/><small v-if="subtopicsError" class="field-error">{{ subtopicsError }} Endpoint: {{ SUBTOPICS_ENDPOINT }}</small></label>
              <label class="form-field"><span>Premade exam <small>Optional</small></span><SearchableSelect v-model="questionDraft.premadeExamId" :options="premadeExamSelectOptions" :disabled="premadeExamsLoading || contextLocked" placeholder="No premade exam" @change="updateSessionContext('premadeExamId', $event)"/><small v-if="premadeExamsLoading" class="field-hint">Loading premade exams…</small><small v-else-if="premadeExamsError" class="field-error">{{ premadeExamsError }} Endpoint: {{ QUESTION_EXAMS_ENDPOINT }}</small></label>
              <label class="form-field"><span>Topic <small>Optional</small></span><SearchableSelect :key="`${questionDraft.premadeExamId}:${selectedQuestionExamSubjectId ?? ''}`" v-model="questionDraft.topicId" :options="questionTopicOptions" :disabled="taxonomyLoading || contextLocked" placeholder="No question topic" @change="updateSessionContext('topicId', $event)"/></label>
              <label class="form-field"><span>Question type</span><input :value="`${questionPage.name} · ID ${questionPage.id}`" readonly /></label>
              <label class="form-field"><span>Difficulty</span><SearchableSelect v-model="questionDraft.difficulty" :options="['easy', 'medium', 'hard']" placeholder="Select difficulty"/></label>
              <label class="form-field"><span>Points</span><input v-model="questionDraft.points" type="number" min="0" step="0.01" required /></label>
              <label v-if="questionLayout.unitPlacement === 'settings'" class="form-field"><span>Unit <small>Optional · choose a common unit or enter your own</small></span><input v-model="questionDraft.unit" placeholder="e.g. mg, mL, bpm, tablet(s)" /><span class="unit-shortcuts"><button v-for="unit in commonUnits" :key="unit" type="button" class="unit-chip" :class="{ selected: questionDraft.unit === unit }" @click="setQuestionUnit(unit)">{{ unit }}</button></span></label>
              <label class="form-field"><span>Status</span><SearchableSelect v-model="questionDraft.status" :options="['draft', 'active', 'archived']" placeholder="Select status"/></label>
              <label class="form-field"><span>Display order</span><input v-model="questionDraft.displayOrder" type="number" step="1" /></label>
            </div>
            <div v-if="questionLayout.questionPaste" class="word-import-block">
              <div class="word-import-heading"><div><p class="word-import-title">Paste question content</p><p class="word-import-copy">The first sentence becomes the intro. Supports A/B/C/D or 1/2/3/4 choice labels with periods, parentheses, or sequential letters.</p></div><span class="word-badge">MCQ ONLY</span></div>
              <div class="word-paste-editor"><RichEditor v-model="wordPasteHtml" :height="180" @paste="scheduleQuestionAutoImport" @change="scheduleQuestionAutoImport" /></div>
              <div class="word-paste-actions"><span class="word-drop-hint">Pasting auto-fills the intro, question, and choices. Convert LaTeX before reviewing or saving.</span><button type="button" class="context-lock-button" :disabled="!htmlText(wordPasteHtml)" @click="convertPastedQuestionLatex">Convert LaTeX</button><button type="button" class="context-lock-button" :disabled="!htmlText(wordPasteHtml)" @click="importPastedQuestion">Parse again</button></div>
              <p v-if="wordImportError" class="field-error word-import-feedback">{{ wordImportError }}</p>
              <p v-if="wordImportMessage" class="word-import-success">{{ wordImportMessage }}</p>
            </div>
            <div v-if="questionLayout.rationalePaste" class="word-import-block rationale-import-block">
              <div class="word-import-heading"><div><p class="word-import-title">Paste choice rationales</p><p class="word-import-copy">Use one labeled line per choice, like “A. Simvastatin: rationale text”. Bold formatting is preserved.</p></div><span class="word-badge">MCQ ONLY</span></div>
              <div class="rationale-paste-editor"><RichEditor v-model="rationalePasteHtml" :height="170" @paste="scheduleRationaleAutoImport" @change="scheduleRationaleAutoImport" /></div>
              <div class="word-paste-actions"><span class="word-drop-hint">Pasting auto-fills rationales. Convert LaTeX before importing if needed. A./B./C./D. or 1./2./3./4. labels map to choices.</span><button type="button" class="context-lock-button" :disabled="!htmlText(rationalePasteHtml)" @click="convertPastedRationalesLatex">Convert LaTeX</button><button type="button" class="context-lock-button" :disabled="!htmlText(rationalePasteHtml)" @click="importPastedRationales">Fill rationales again</button></div>
              <p v-if="rationaleImportError" class="field-error word-import-feedback">{{ rationaleImportError }}</p>
              <p v-if="rationaleImportMessage" class="word-import-success">{{ rationaleImportMessage }}</p>
            </div>
          </section>
          <section class="builder-section"><div class="section-heading"><span class="section-number">02</span><div><h2>Question introduction <span class="optional-tag">Optional</span></h2><p>Add shared context, a clinical scenario, or instructions shown before the question.</p></div></div><div class="question-editor"><RichEditor ref="introEditor" :key="`${questionPage.code}-intro`" v-model="questionDraft.questionIntro" :height="130" /></div><div class="mt-3 flex flex-wrap items-center gap-3"><button type="button" class="context-lock-button" @click="insertExhibitPlaceholder">Insert exhibit placeholder</button><span class="text-[11px] text-slate-400">Adds the exhibit marker below the introduction.</span></div></section>
          <section class="builder-section"><div class="section-heading"><span class="section-number">T</span><div><h2>Question tabs <span class="optional-tag">Optional</span></h2><p>Add titled content panels for exhibits or supporting information.</p></div></div>
            <div v-if="questionDraft.tabs.length" class="space-y-4">
              <article v-for="(tab, index) in questionDraft.tabs" :key="tab.id" class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div class="mb-4 flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-700">Tab {{ index + 1 }}</h3><button type="button" class="remove-choice" @click="removeQuestionTab(tab.id)">Remove tab</button></div>
                <label class="form-field"><span>Title</span><input v-model="tab.title" class="choice-input" placeholder="e.g. Assessment" /></label>
                <label class="form-field mt-4"><span>Content</span><RichEditor :ref="editor => setTabEditorRef(tab.id, editor)" :key="`${questionPage.code}-tab-${tab.id}`" v-model="tab.content" :height="150" /></label>
              </article>
              <button type="button" class="context-lock-button" @click="addQuestionTab">Add another tab</button>
            </div>
            <button v-else type="button" class="context-lock-button" @click="addQuestionTab">Add tabs</button>
          </section>
          <section class="builder-section"><div class="section-heading"><span class="section-number">03</span><div><h2>{{ isHighlight ? 'Passage to highlight' : 'Question' }}</h2><p>{{ isHighlight ? 'Write or paste the passage, then select text and mark it as a highlight target.' : 'Paste or write the question learners will answer.' }}</p></div></div><div class="question-editor"><RichEditor ref="promptEditor" :key="`${questionPage.code}-prompt`" v-model="questionDraft.prompt" :height="190" /></div>
            <div v-if="isDropdown" class="mt-3 space-y-3">
              <button type="button" class="context-lock-button" @click="addDropdown">Insert “select”</button>
              <p class="text-[11px] text-slate-500">Place the cursor in the question above, then insert a select where the learner should choose an answer.</p>
            </div>
            <div v-if="isHighlight" class="mt-3 space-y-4">
              <button type="button" class="context-lock-button" @click="addHighlightTarget">Mark selected text as a target</button>
              <p class="text-[11px] text-slate-500">Select text in the passage first. Targets remain embedded in the rich text as stable highlight IDs.</p>
              <div v-if="questionDraft.highlightTargets.length" class="space-y-2">
                <div v-for="target in questionDraft.highlightTargets" :key="target.id" class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <code class="code-badge">{{ target.id }}</code>
                  <span class="min-w-0 flex-1 text-sm text-slate-700">{{ target.text }}</span>
                  <label class="correct-choice shrink-0"><input v-model="target.correct" type="checkbox" :name="`highlight-${questionPage.code}`"/><span>Correct target</span></label>
                  <button type="button" class="remove-choice" :aria-label="`Remove highlight target ${target.id}`" @click="removeHighlightTarget(target)">Remove</button>
                </div>
              </div>
            </div>
          </section>
          <section v-if="isDropdown" class="builder-section choices-section">
            <div class="section-heading"><span class="section-number">04</span><div><h2>Dropdown choices</h2><p>Add the available choices and mark one correct answer for each select in the question.</p></div></div>
            <div v-if="questionDraft.dropdowns.length" class="space-y-5">
              <article v-for="dropdown in questionDraft.dropdowns" :key="dropdown.id" class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div class="mb-4 flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-700">{{ dropdown.label }} choices</h3><button type="button" class="remove-choice" @click="removeDropdown(dropdown)">Remove select</button></div>
                <div class="space-y-3">
                  <div v-for="option in dropdown.options" :key="option.id" class="flex items-center gap-3">
                    <span class="code-badge">{{ option.id }}</span>
                    <input v-model="option.text" class="choice-input min-w-0 flex-1" placeholder="Enter a dropdown choice" />
                    <label class="correct-choice shrink-0"><input :checked="option.correct" type="radio" :name="`correct-${questionPage.code}-${dropdown.id}`" @change="setDropdownCorrect(dropdown, option)" /><span>Correct answer</span></label>
                    <button v-if="dropdown.options.length > 2" type="button" class="remove-choice" :aria-label="`Remove option ${option.id} from ${dropdown.label}`" @click="removeDropdownOption(dropdown, option.id)">Remove</button>
                  </div>
                </div>
                <button type="button" class="add-choice-button mt-3" @click="addDropdownOption(dropdown)"><span>+</span> Add option</button>
              </article>
            </div>
            <p v-else class="text-sm text-slate-500">Insert a “select” placeholder into the question to add its choices here.</p>
          </section>
          <section v-if="isFillBlank" class="builder-section fill-blank-answer-section"><div class="section-heading"><span class="section-number">04</span><div><h2>Answer</h2><p>Enter the expected word, phrase, or value for the blank.</p></div></div><label class="form-field"><span>Accepted answer <b>*</b></span><input v-model="questionDraft.answer" class="choice-input" placeholder="Enter the correct answer" required /></label><label class="form-field fill-blank-unit"><span>Unit <small>Optional · choose a common unit or enter your own</small></span><input v-model="questionDraft.unit" class="choice-input" placeholder="e.g. mg, mL, bpm, tablet(s)" /><span class="unit-shortcuts"><button v-for="unit in commonUnits" :key="unit" type="button" class="unit-chip" :class="{ selected: questionDraft.unit === unit }" @click="setQuestionUnit(unit)">{{ unit }}</button></span></label></section>
          <section v-if="isBowTie" class="builder-section choices-section"><div class="section-heading"><span class="section-number">04</span><div><h2>Bow-tie answer options</h2><p>Add possible conditions, actions, and monitoring parameters, then select the correct answer or answers in each group.</p></div></div>
            <div class="space-y-5">
              <article v-for="group in bowTieChoiceGroups" :key="group.key" class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 class="mb-3 text-sm font-semibold text-slate-700">{{ group.title }}</h3>
                <div class="space-y-3">
                  <div v-for="option in questionDraft.bowTie[group.key]" :key="option.id" class="flex items-center gap-3">
                    <input v-model="option.text" class="choice-input min-w-0 flex-1" :placeholder="`${group.title} option`" />
                    <label class="correct-choice shrink-0"><input :checked="option.correct" :type="group.key === 'conditionOptions' ? 'radio' : 'checkbox'" :name="`bowtie-${group.key}`" @change="setBowTieCorrect(group.key, option, $event.target.checked)"/><span>{{ group.correctLabel }}</span></label>
                    <button type="button" class="remove-choice" :aria-label="`Remove ${group.title} option`" @click="removeBowTieOption(group.key, option.id)">Remove</button>
                  </div>
                </div>
                <button type="button" class="add-choice-button mt-3" @click="addBowTieOption(group.key)"><span>+</span> Add option</button>
              </article>
            </div>
          </section>
          <section v-if="isMatrixMultipleResponse" class="builder-section choices-section"><div class="section-heading"><span class="section-number">04</span><div><h2>Matrix rows and responses</h2><p>Add each manifestation and its response options, then mark every correct response for that row.</p></div></div>
            <div class="space-y-5">
              <article v-for="(row, rowIndex) in questionDraft.matrixRows" :key="row.id" class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div class="mb-4 flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-700">Manifestation {{ rowIndex + 1 }}</h3><button type="button" class="remove-choice" @click="removeMatrixRow(row.id)">Remove row</button></div>
                <label class="form-field"><span>Manifestation label</span><input v-model="row.label" class="choice-input" placeholder="e.g. Risk for self-harm" /></label>
                <div class="mt-4 space-y-3">
                  <div v-for="option in row.options" :key="option.id" class="flex items-center gap-3">
                    <span class="code-badge">{{ option.id }}</span>
                    <input v-model="option.text" class="choice-input min-w-0 flex-1" placeholder="Nursing intervention" />
                    <label class="correct-choice shrink-0"><input v-model="option.correct" type="checkbox" :name="`matrix-${row.id}`"/><span>Correct</span></label>
                    <button type="button" class="remove-choice" :aria-label="`Remove response option ${option.id}`" @click="removeMatrixOption(row, option.id)">Remove</button>
                  </div>
                </div>
                <button type="button" class="add-choice-button mt-3" @click="addMatrixOption(row)"><span>+</span> Add response</button>
              </article>
              <button type="button" class="add-choice-button" @click="addMatrixRow"><span>+</span> Add manifestation</button>
            </div>
          </section>
          <section v-if="isMatrixClassification" class="builder-section choices-section">
            <div class="section-heading"><span class="section-number">04</span><div><h2>Classification columns and findings</h2><p>Define the classifications once, then select independently for each finding. Each column needs at least one selection; a finding may have none.</p></div></div>
            <div class="mb-6 space-y-3">
              <div v-for="(column, index) in questionDraft.matrixClassificationColumns" :key="column.id" class="flex items-center gap-3">
                <span class="code-badge">{{ matrixOptionId(index) }}</span>
                <input v-model="column.label" class="choice-input min-w-0 flex-1" placeholder="Classification or disease process" />
                <button type="button" class="remove-choice" :aria-label="`Remove classification ${index + 1}`" @click="removeMatrixClassificationColumn(column.id)">Remove</button>
              </div>
              <button type="button" class="add-choice-button" @click="addMatrixClassificationColumn"><span>+</span> Add classification column</button>
            </div>
            <div class="space-y-4">
              <article v-for="(row, rowIndex) in questionDraft.matrixClassificationRows" :key="row.id" class="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div class="mb-4 flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-700">Finding {{ rowIndex + 1 }}</h3><button type="button" class="remove-choice" @click="removeMatrixClassificationRow(row.id)">Remove finding</button></div>
                <label class="form-field"><span>Client finding</span><input v-model="row.label" class="choice-input" placeholder="e.g. Lanugo" /></label>
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <label v-for="column in questionDraft.matrixClassificationColumns" :key="column.id" class="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <input v-model="row.selectedColumnIds" type="checkbox" :value="column.id" class="mt-0.5" />
                    <span>{{ column.label || 'Unnamed classification' }}</span>
                  </label>
                  <p v-if="!questionDraft.matrixClassificationColumns.length" class="text-xs text-slate-500">Add at least one classification column.</p>
                </div>
              </article>
              <button type="button" class="add-choice-button" @click="addMatrixClassificationRow"><span>+</span> Add finding</button>
            </div>
          </section>
          <section v-if="usesChoices" class="builder-section choices-section"><div class="section-heading"><span class="section-number">04</span><div><h2>Answer choices <span class="optional-tag">Formatted content supported</span></h2><p>Add each option, mark the correct answer, then write its rationale directly below.</p></div></div>
            <div class="choice-list"><article v-for="(choice, index) in questionDraft.choices" :key="choice.id" class="choice-card"><div class="choice-topline"><div class="choice-label"><span class="choice-letter">{{ String.fromCharCode(65 + index) }}</span><span>Choice {{ index + 1 }}</span></div><label class="correct-choice"><input :checked="choice.correct" :type="questionLayout.correctAnswerMode === 'single' ? 'radio' : 'checkbox'" :name="`correct-${questionPage.code}`" @change="setCorrect(choice, $event.target.checked)"/><span>{{ questionLayout.correctAnswerMode === 'single' ? 'Correct answer' : 'Mark as correct' }}</span></label><button v-if="questionDraft.choices.length > 2" class="remove-choice" type="button" @click="removeChoice(choice.id)">Remove</button></div>
              <RichEditor :key="`${questionPage.code}-choice-${choice.id}`" v-model="choice.option" :height="90" />
              <div class="rationale-block"><label :for="`rationale-label-${choice.id}`" class="rationale-label"><span>Rationale</span><small>Feedback for this choice</small></label><RichEditor :key="`${questionPage.code}-rationale-${choice.id}`" v-model="choice.rationale" :height="105" /></div>
            </article></div>
            <button type="button" class="add-choice-button" @click="addChoice"><span>+</span> Add another choice</button>
          </section>
          <section class="builder-section explanation-section"><div class="section-heading"><span class="section-number">05</span><div><h2>{{ isFillBlank ? 'Explanation' : 'Full explanation' }}</h2><p>{{ isFillBlank ? 'Explain why this answer is correct.' : 'Give the complete clinical reasoning after all choices and rationales.' }}</p></div></div><div class="explanation-editor"><RichEditor ref="explanationEditor" :key="`${questionPage.code}-explanation`" v-model="questionDraft.explanation" :height="190" /></div><div class="mt-2 flex flex-wrap items-center gap-3"><button type="button" class="context-lock-button" :disabled="!htmlText(questionDraft.explanation)" @click="convertExplanationLatex">Convert LaTeX</button><p v-if="explanationLatexError" class="field-error">{{ explanationLatexError }}</p><p v-if="explanationLatexMessage" class="word-import-success">{{ explanationLatexMessage }}</p></div></section>
          <p v-if="questionPayloadError" class="field-error px-6 pb-3">{{ questionPayloadError }}</p>
          <div class="builder-footer"><button class="cancel-button" type="button" @click="returnToQuestionTypes()">{{ editingQuestionId ? 'Cancel edit' : 'Back to question types' }}</button><button class="primary-button" type="submit" :disabled="questionSaving || !hasQuestionContext || !questionDraft.prompt.trim() || (isFillBlank && !questionDraft.answer.trim())">{{ questionSaving ? (editingQuestionId ? 'Updating…' : 'Saving…') : (editingQuestionId ? 'Update question' : 'Save question') }} <span v-if="!questionSaving">→</span></button></div>
        </form>
        <details v-if="lastQuestionPayload" class="payload-preview"><summary>Payload preview <span>JSON</span></summary><div class="payload-preview-tools"><p>This object is ready to send to your question API. The database creates id and timestamps.</p><button class="export-button" type="button" @click="copyQuestionPayload">{{ payloadCopied ? 'Copied' : 'Copy JSON' }}</button></div><pre class="payload-json">{{ questionPayloadJson }}</pre></details>
        <p class="builder-footnote"><span>✦</span> Your content is saved in this browser session.</p>
      </div>
    </main>

    <Transition name="fade"><div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen=false"><section class="edit-modal"><div class="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><p class="eyebrow">QUESTION LIBRARY</p><h2 class="mt-1 font-display text-xl font-bold text-slate-900">{{ form.id ? 'Edit question type' : 'New question type' }}</h2><p class="mt-1 text-xs text-slate-400">Define how learners will interact with this format.</p></div><button class="modal-close" @click="modalOpen=false">×</button></div><form class="modal-body" @submit.prevent="saveQuestion"><div class="form-grid"><label class="form-field"><span>Question type name <b>*</b></span><input v-model="form.name" required placeholder="e.g. Multiple choice" /></label><label class="form-field"><span>Type code <b>*</b></span><input v-model="form.code" required placeholder="e.g. MCQ_SINGLE" /></label><label class="form-field"><span>Category</span><SearchableSelect v-model="form.category" :options="['Core', 'Written', 'Interactive']" placeholder="Select category"/></label><label class="form-field flex-row items-center justify-between"><span>Available to learners</span><button type="button" class="status-toggle" :class="{ off: !form.active }" @click="form.active=!form.active"><span class="toggle-dot"></span>{{ form.active ? 'Active' : 'Inactive' }}</button></label></div><label class="form-field editor-field"><span>Description <small>Short summary shown in the question builder</small></span><RichEditor v-model="form.description" :height="105" /></label><label class="form-field editor-field"><span>Learning guidance <small>Explain how this question format works</small></span><RichEditor v-model="form.details" :height="130" /></label><div class="modal-footer"><button type="button" class="cancel-button" @click="modalOpen=false">Cancel</button><button type="submit" class="primary-button" :disabled="!form.name.trim() || !form.code.trim()">{{ form.id ? 'Save changes' : 'Create question type' }}<span>→</span></button></div></form></section></div></Transition>
    <Transition name="fade"><div v-if="examModalOpen" class="modal-backdrop" @click.self="examModalOpen=false"><section class="edit-modal exam-modal"><div class="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><p class="eyebrow">ASSESSMENT LIBRARY</p><h2 class="mt-1 font-display text-xl font-bold text-slate-900">{{ examForm.id ? 'Edit premade exam' : 'Create premade exam' }}</h2><p class="mt-1 text-xs text-slate-400">Set the exam details and optionally link a broad topic.</p></div><button class="modal-close" @click="examModalOpen=false">×</button></div>
      <form class="modal-body" @submit.prevent="saveExam"><div class="form-grid">
        <label class="form-field"><span>Product <b>*</b></span><SearchableSelect :model-value="examForm.product_id" :options="productOptions" :disabled="taxonomyLoading" placeholder="Select a product" @update:model-value="changeExamProduct"/></label>
        <label class="form-field"><span>Subject <b>*</b></span><SearchableSelect :model-value="examForm.subject_id" :options="subjectOptions" :disabled="taxonomyLoading || !examForm.product_id" placeholder="Select a subject" @update:model-value="changeExamSubject"/></label>
        <label class="form-field"><span>Nursing category <b v-if="requiresNursingCategory">*</b><small v-else>Not used for TEAS or HESI exams</small></span><SearchableSelect v-model="examForm.nursing_category_id" :options="categoryOptions" :disabled="taxonomyLoading || !examForm.product_id || isCategoryOptionalProduct" :placeholder="isCategoryOptionalProduct ? 'Not required for this product' : 'Select a category'" @change="examForm.topic_id=''"/></label>
        <label class="form-field"><span>Topic <small>Optional</small></span><SearchableSelect v-model="examForm.topic_id" :options="topicOptions" :disabled="taxonomyLoading || !examForm.subject_id || (requiresNursingCategory && !examForm.nursing_category_id)" placeholder="No exam-level topic"/></label>
        <label class="form-field"><span>Exam name <b>*</b></span><input v-model="examForm.name" required placeholder="e.g. Cardiac nursing essentials" @input="updateExamSlug" /></label>
        <label class="form-field"><span>Slug <b>*</b></span><input v-model="examForm.slug" required placeholder="cardiac-nursing-essentials" /></label>
        <label class="form-field"><span>Question count</span><input v-model="examForm.question_count" type="number" min="0" step="1" /></label>
        <label class="form-field"><span>Status</span><SearchableSelect v-model="examForm.status" :options="['draft', 'active', 'archived']" placeholder="Select status"/></label>
      </div>
      <p v-if="taxonomyError" class="field-error mt-3">{{ taxonomyError }} Endpoints: {{ CATEGORIES_ENDPOINT }} and {{ TOPICS_ENDPOINT }}</p>
      <p v-if="premadeExamSaveError" class="field-error mt-3 rounded-lg bg-rose-50 px-3 py-2">{{ premadeExamSaveError }}</p>
      <label class="form-field editor-field"><span>Short description <small>Brief summary shown in exam lists</small></span><RichEditor v-model="examForm.short_description" :height="100" /></label>
      <label class="form-field editor-field"><span>Description <small>Full exam overview and instructions</small></span><RichEditor v-model="examForm.description" :height="150" /></label>
      <div class="modal-footer"><button type="button" class="cancel-button" @click="examModalOpen=false">Cancel</button><button type="submit" class="primary-button" :disabled="premadeExamSaving || !examForm.product_id || !examForm.subject_id || (requiresNursingCategory && !examForm.nursing_category_id) || !examForm.name.trim() || !examForm.slug.trim()">{{ premadeExamSaving ? 'Saving…' : examForm.id ? 'Save changes' : 'Create exam' }}<span v-if="!premadeExamSaving">→</span></button></div></form>
    </section></div></Transition>
    <Transition name="toast"><div v-if="toast" class="toast-message"><span>✓</span>{{ toast }}</div></Transition>
  </div>
</template>
