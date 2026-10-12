<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Select an option' },
  disabled: { type: Boolean, default: false },
  emptyLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const searchInput = ref(null)
const isOpen = ref(false)
const search = ref('')
const inputId = `search-select-${Math.random().toString(36).slice(2)}`
const normalizedOptions = computed(() => {
  const options = props.options.map(option => typeof option === 'object'
    ? { value: option.value ?? option.id ?? '', label: String(option.label ?? option.name ?? option.title ?? ''), disabled: Boolean(option.disabled) }
    : { value: option, label: String(option), disabled: false })
  return props.emptyLabel ? [{ value: '', label: props.emptyLabel }, ...options] : options
})
const selectedLabel = computed(() => normalizedOptions.value.find(option => String(option.value) === String(props.modelValue))?.label || '')
const filteredOptions = computed(() => {
  const term = search.value.trim().toLowerCase()
  return term ? normalizedOptions.value.filter(option => option.label.toLowerCase().includes(term)) : normalizedOptions.value
})

async function open() {
  if (props.disabled) return
  isOpen.value = true
  search.value = ''
  await nextTick()
  searchInput.value?.focus()
}
function close() { isOpen.value = false; search.value = '' }
function select(option) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  close()
}
function handleKeydown(event) {
  if (event.key === 'Escape') close()
  if (event.key === 'Enter' && filteredOptions.value.length === 1) {
    event.preventDefault()
    select(filteredOptions.value[0])
  }
}
function closeOnOutsideClick(event) {
  if (!root.value?.contains(event.target)) close()
}
onMounted(() => document.addEventListener('mousedown', closeOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', closeOnOutsideClick))
</script>

<template>
  <div ref="root" class="search-select" :class="{ disabled }">
    <button v-if="!isOpen" class="search-select-trigger" type="button" :disabled="disabled" :aria-expanded="false" :aria-controls="inputId" @click="open">
      <span :class="{ placeholder: !selectedLabel }">{{ selectedLabel || placeholder }}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    <div v-else class="search-select-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input :id="inputId" ref="searchInput" v-model="search" class="search-select-input" type="search" :placeholder="`Search ${placeholder.toLowerCase()}...`" role="combobox" aria-autocomplete="list" aria-expanded="true" @keydown="handleKeydown" /><button type="button" class="search-select-close" aria-label="Close options" @click="close">×</button></div>
    <div v-if="isOpen" class="search-select-menu" role="listbox">
      <button v-for="(option, index) in filteredOptions" :key="`${option.value}-${index}`" class="search-select-option" :class="{ selected: String(option.value) === String(modelValue), disabled: option.disabled }" type="button" role="option" :disabled="option.disabled" :aria-selected="String(option.value) === String(modelValue)" @click="select(option)">{{ option.label }}<span v-if="String(option.value) === String(modelValue)">✓</span></button>
      <p v-if="filteredOptions.length === 0" class="search-select-empty">No matching options</p>
    </div>
  </div>
</template>

<style scoped>
.search-select{position:relative;width:100%;font-size:11px;font-weight:500}
.search-select-trigger,.search-select-search{display:flex;width:100%;height:38px;align-items:center;justify-content:space-between;gap:8px;border:1px solid #e5e9ef;border-radius:7px;background:#fff;padding:0 10px;color:#4c586a;text-align:left;outline:none}
.search-select-trigger:hover,.search-select-search:focus-within{border-color:#aaa4ef;box-shadow:0 0 0 3px #655be610}
.search-select-trigger svg,.search-select-search svg{width:15px;height:15px;flex:none;fill:none;stroke:#929cad;stroke-width:1.7}
.search-select-trigger .placeholder{color:#9aa4b2}
.search-select-search{justify-content:flex-start}
.search-select-input{width:100%;min-width:0;border:0!important;background:transparent!important;padding:0!important;color:#4c586a!important;font:inherit!important;outline:none!important;box-shadow:none!important}
.search-select-close{border:0;background:none;color:#8994a4;font-size:18px;line-height:1}
.search-select-menu{position:absolute;z-index:50;top:calc(100% + 5px);left:0;max-height:240px;width:100%;overflow-y:auto;border:1px solid #e5e9ef;border-radius:9px;background:#fff;padding:4px;box-shadow:0 12px 28px #2937501a}
.search-select-option{display:flex;width:100%;min-height:34px;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:6px;background:white;padding:7px 9px;color:#536074;text-align:left;font:inherit}
.search-select-option:hover,.search-select-option.selected{background:#f4f3ff;color:#5148cb}
.search-select-option:disabled{cursor:not-allowed;background:#fff;color:#a4adba}
.search-select-option span{color:#5b52dc}
.search-select-empty{padding:10px;color:#9aa4b2;text-align:center}
.search-select.disabled{opacity:.55}
</style>
