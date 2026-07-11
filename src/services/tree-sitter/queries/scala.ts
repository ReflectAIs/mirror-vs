export const scalaQuery = `
; Classes
(class_definition
  name: (identifier) @name.definition) @definition.class

(class_definition
  (modifiers)
  name: (identifier) @name.definition) @definition.class

; Objects
(object_definition
  name: (identifier) @name.definition) @definition.object

(object_definition
  name: (identifier) @name.definition
  extend: (extends_clause)?) @definition.object

; Traits
(trait_definition
  name: (identifier) @name.definition) @definition.trait

; Methods
(function_definition
  name: (identifier) @name.definition) @definition.method

; Values and Variables
(val_definition
  pattern: (identifier) @name.definition) @definition.variable

(var_definition
  pattern: (identifier) @name.definition) @definition.variable

(val_definition
  (modifiers)
  pattern: (identifier) @name.definition) @definition.variable

; Types
(type_definition
  name: (type_identifier) @name.definition) @definition.type

; Package declarations
(package_clause
  name: (package_identifier) @name.definition) @definition.namespace

; Match expressions
(function_definition
  body: (block
    (match_expression))) @definition.match_expression

; For comprehensions (WASM v13 doesn't support for_expression node type)
; (function_definition
;   body: (block
;     (for_expression))) @definition.for_comprehension
`
