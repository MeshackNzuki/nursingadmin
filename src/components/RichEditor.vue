<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({ modelValue: { type: String, default: '' }, height: { type: Number, default: 118 } })
const emit = defineEmits(['update:modelValue', 'paste', 'change'])
const textarea = ref(null)
let editor
let updating = false
let pasteTimer
let sourceTextarea

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
defineExpose({ syncContent })
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
      extraAllowedContent: 'math[*]; semantics; annotation[*]; mrow; mi; mn; mo; mfrac; msup; msub; msqrt; mroot; mtext; mover; munder; munderover; mtable; mtr; mtd; menclose; mstyle[*]',
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
