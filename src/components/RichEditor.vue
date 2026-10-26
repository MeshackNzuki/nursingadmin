<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  height: { type: Number, default: 118 },
  preserveWordFormatting: { type: Boolean, default: false },
  imageUpload: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue', 'paste', 'change', 'image-upload-error'])
const textarea = ref(null)
let editor
let updating = false
let pasteTimer
let sourceTextarea
let savedImageInsertRange

function publishContentChange() {
  if (!editor || editor.status !== 'ready') return
  updating = true
  const content = editor.getData()
  emit('update:modelValue', content)
  emit('change', content)
  updating = false
}
function syncContent() {
  publishContentChange()
}
function wrapSelection(attributeName, attributeValue) {
  if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') return ''
  const selection = editor.getSelection()
  const selectedText = selection?.getSelectedText()?.trim()
  if (!selectedText) return ''
  const style = new window.CKEDITOR.style({
    element: 'span',
    attributes: { [attributeName]: attributeValue },
    styles: { 'background-color': '#fff2a8' },
  })
  editor.applyStyle(style)
  publishContentChange()
  return selectedText
}
function removeMarkedText(attributeName, attributeValue) {
  if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') return
  const elements = editor.document.find(`span[${attributeName}]`)
  for (let index = elements.count() - 1; index >= 0; index -= 1) {
    const element = elements.getItem(index)
    if (element.getAttribute(attributeName) === attributeValue) element.remove(true)
  }
  publishContentChange()
}
function removeEmptyListItems() {
  const doc = editor?.document?.$
  if (!doc) return
  doc.querySelectorAll('li').forEach(item => {
    const text = (item.textContent || '').replace(/\u00a0/g, '').trim()
    if (!text && !item.querySelector('img, table, iframe, video, audio')) item.remove()
  })
  doc.querySelectorAll('ul, ol').forEach(list => {
    if (!list.querySelector('li')) list.remove()
  })
}
function wrapSelectionBlock(tagName, attributes = {}) {
  if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') return false
  editor.focus()
  const selection = editor.getSelection()
  const ranges = selection?.getRanges()
  const range = ranges?.[0]
  if (!range || range.collapsed) return false
  editor.fire('saveSnapshot')
  const wrapper = new window.CKEDITOR.dom.element(tagName, editor.document)
  Object.entries(attributes).forEach(([name, value]) => {
    if (value != null && value !== '') wrapper.setAttribute(name, String(value))
  })
  wrapper.append(range.extractContents())
  range.insertNode(wrapper)
  removeEmptyListItems()
  range.selectNodeContents(wrapper)
  selection.selectRanges([range])
  editor.fire('saveSnapshot')
  publishContentChange()
  return true
}
function insertHtmlAtCursor(html) {
  if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') return false
  editor.focus()
  editor.insertHtml(html)
  publishContentChange()
  return true
}
function rememberSelection() {
  if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') return
  const range = editor.getSelection()?.getRanges()?.[0]
  if (range) savedImageInsertRange = range.clone()
}
function restoreImageInsertRange() {
  if (!editor || !savedImageInsertRange) return
  const selection = editor.getSelection()
  if (selection) selection.selectRanges([savedImageInsertRange])
  savedImageInsertRange = null
}
async function insertImageFile(file) {
  if (!props.imageUpload) throw new Error('Image uploads are not enabled for this editor.')
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a valid image file.')
  if (!savedImageInsertRange) rememberSelection()
  try {
    const image = await props.imageUpload(file)
    if (!image?.url) throw new Error('The image upload response did not include a URL.')
    if (!editor || editor.status !== 'ready' || editor.mode !== 'wysiwyg') {
      throw new Error('The lesson editor is not ready to insert the uploaded image.')
    }
    editor.focus()
    restoreImageInsertRange()
    const element = new window.CKEDITOR.dom.element('img', editor.document)
    element.setAttribute('src', image.url)
    element.setAttribute('alt', file.name || 'Lesson image')
    editor.insertElement(element)
    publishContentChange()
    return image
  } catch (error) {
    savedImageInsertRange = null
    emit('image-upload-error', error)
    throw error
  }
}
function dataUrlToFile(dataUrl, index) {
  const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/)
  if (!match) throw new Error('The pasted image data is invalid.')
  const binary = window.atob(match[2])
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const extension = match[1].split('/')[1].replace('+xml', '')
  return new File([bytes], `lesson-image-${Date.now()}-${index}.${extension}`, { type: match[1] })
}
async function handleImagePaste(event) {
  if (!props.imageUpload || !editor || editor.mode !== 'wysiwyg') return
  const pasteData = event.data
  const html = pasteData.dataValue || ''
  const parsedHtml = new DOMParser().parseFromString(html, 'text/html')
  const dataImages = [...parsedHtml.querySelectorAll('img')].filter(image =>
    image.getAttribute('src')?.startsWith('data:image/'))
  const clipboardFiles = pasteData.dataTransfer?.$?.files
    ? [...pasteData.dataTransfer.$.files].filter(file => file.type.startsWith('image/'))
    : []
  if (!dataImages.length && !clipboardFiles.length) return

  rememberSelection()
  event.cancel()
  try {
    if (dataImages.length) {
      const uploaded = await Promise.all(dataImages.map(async (image, index) => {
        const file = dataUrlToFile(image.getAttribute('src'), index)
        const result = await props.imageUpload(file)
        if (!result?.url) throw new Error('The image upload response did not include a URL.')
        return result.url
      }))
      dataImages.forEach((image, index) => image.setAttribute('src', uploaded[index]))
      editor.focus()
      restoreImageInsertRange()
      editor.insertHtml(parsedHtml.body.innerHTML)
    } else {
      const uploaded = await Promise.all(clipboardFiles.map(async file => {
        const result = await props.imageUpload(file)
        if (!result?.url) throw new Error('The image upload response did not include a URL.')
        return { url: result.url, name: file.name }
      }))
      editor.focus()
      restoreImageInsertRange()
      uploaded.forEach(image => {
        const element = new window.CKEDITOR.dom.element('img', editor.document)
        element.setAttribute('src', image.url)
        element.setAttribute('alt', image.name || 'Lesson image')
        editor.insertElement(element)
      })
    }
    publishContentChange()
  } catch (error) {
    savedImageInsertRange = null
    emit('image-upload-error', error)
  }
}
defineExpose({
  syncContent,
  wrapSelection,
  removeMarkedText,
  wrapSelectionBlock,
  insertHtmlAtCursor,
  rememberSelection,
  insertImageFile,
})
function bindSourceInput() {
  const sourceElement = editor?.container?.findOne('textarea.cke_source')?.$
  if (!sourceElement || sourceElement === sourceTextarea) return
  sourceTextarea?.removeEventListener('input', publishContentChange)
  sourceTextarea = sourceElement
  sourceTextarea.addEventListener('input', publishContentChange)
}

onMounted(() => {
  const init = () => {
    if (!textarea.value || !window.CKEDITOR) return
    editor = window.CKEDITOR.replace(textarea.value, {
      height: props.height,
      removePlugins: 'elementspath',
      resize_enabled: false,
      allowedContent: props.preserveWordFormatting ? true : undefined,
      extraAllowedContent: 'exhibit-placeholder[*]; div[id,class]; span[data-highlight-id,data-dropdown-id]{background-color}; math[*]; semantics[*]; annotation[*]; mrow[*]; mi[*]; mn[*]; mo[*]; mfrac[*]; msup[*]; msub[*]; msqrt[*]; mroot[*]; mtext[*]; mover[*]; munder[*]; munderover[*]; mtable[*]; mtr[*]; mtd[*]; menclose[*]; mstyle[*]; mspace[*]; mpadded[*]; mphantom[*]; mmultiscripts[*]; mprescripts[*]; none[*]; maction[*]; ms[*]; mglyph[*]; merror[*]',
      pasteFromWordRemoveFontStyles: !props.preserveWordFormatting,
      pasteFromWordRemoveStyles: !props.preserveWordFormatting,
      forcePasteAsPlainText: false,
      toolbar: [
        { name: 'document', items: ['Source'] },
        { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline'] },
        { name: 'paragraph', items: ['NumberedList', 'BulletedList', 'Blockquote'] },
        { name: 'links', items: ['Link', 'Unlink'] },
        { name: 'styles', items: ['Format'] },
        { name: 'insert', items: ['Table'] },
        { name: 'tools', items: ['Maximize'] },
      ],
    })
    editor.on('instanceReady', () => editor.setData(props.modelValue || ''))
    editor.on('change', publishContentChange)
    editor.on('mode', () => window.setTimeout(bindSourceInput, 0))
    editor.on('paste', () => {
      window.clearTimeout(pasteTimer)
      pasteTimer = window.setTimeout(() => emit('paste'), 350)
    })
    if (props.imageUpload) editor.on('paste', handleImagePaste, null, null, 20)
  }
  if (window.CKEDITOR) init()
  else {
    const timer = window.setInterval(() => {
      if (window.CKEDITOR) { window.clearInterval(timer); init() }
    }, 100)
    window.setTimeout(() => window.clearInterval(timer), 10000)
  }
})

watch(() => props.modelValue, (value) => {
  if (!updating && editor && editor.status === 'ready' && editor.getData() !== value) editor.setData(value || '')
})

onBeforeUnmount(() => {
  window.clearTimeout(pasteTimer)
  sourceTextarea?.removeEventListener('input', publishContentChange)
  if (editor) { editor.destroy(true); editor = null }
})
</script>

<template>
  <textarea ref="textarea" :value="modelValue" class="rich-editor-fallback" />
</template>
