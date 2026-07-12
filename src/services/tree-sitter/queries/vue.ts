export const vueQuery = `
; Top-level structure
(component) @component.definition

; Template section
(template_element) @template.definition
(template_element
  (element
    (start_tag
      (tag_name) @element.name.definition))
  (element
    (start_tag
      (attribute
        (attribute_name) @attribute.name.definition)))
  (element
    (start_tag
      (directive_attribute
        (directive_name) @directive.name.definition))))

; Script section
(script_element) @script.definition
(script_element
  (raw_text) @script.content.definition)

; Style section
(style_element) @style.definition
(style_element
  (raw_text) @style.content.definition)

; Interpolation expressions ({{ }})
(interpolation
  (raw_text) @interpolation.expression.definition) @interpolation.definition

; Element attributes
(element
  (start_tag
    (attribute
      (attribute_name) @attribute.name.definition
      (quoted_attribute_value
        (attribute_value) @attribute.value.definition))) @attribute.definition)

; Directive attributes (v-bind, v-if, v-for, etc.)
(element
  (start_tag
    (directive_attribute
      (directive_name) @directive.name.definition))) @directive.definition
`
