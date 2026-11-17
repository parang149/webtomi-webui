import { defineComponent, Fragment, h, type VNode } from 'vue'
import USelect from '@nuxt/ui/components/Select.vue'

// Lets templates keep native <option> children while rendering Nuxt UI Select.
type Value = string | number | boolean
type Option = { value: Value; label: string; disabled: boolean }
function optionsOf(nodes: VNode[]): Option[] {
  return nodes.flatMap(node => {
    if (node.type === Fragment && Array.isArray(node.children)) return optionsOf(node.children as VNode[])
    if (node.type !== 'option' || typeof node.children !== 'string') return []
    return [{ value: node.props?.value ?? node.children, label: node.children, disabled: node.props?.disabled === true || node.props?.disabled === '' }]
  })
}

export default defineComponent({
  inheritAttrs: false,
  props: { modelValue: [String, Number, Boolean], disabled: Boolean },
  emits: ['update:modelValue', 'change'],
  setup(props, { attrs, slots, emit }) {
    return () => {
      const options = optionsOf(slots.default?.() ?? [])
      const selected = options.findIndex(option => option.value === props.modelValue)
      return h(USelect, {
        ...attrs,
        items: options.map((option, index) => ({ label: option.label, value: String(index), disabled: option.disabled })),
        modelValue: selected < 0 ? undefined : String(selected),
        disabled: props.disabled,
        'onUpdate:modelValue': (value: unknown) => {
          const option = typeof value === 'string' && value !== '' ? options[Number(value)] : undefined
          if (!option) return
          emit('update:modelValue', option.value)
          emit('change')
        },
      })
    }
  },
})
