/*
Go Tree-Sitter Query Patterns
Updated to capture full declarations instead of just identifiers
*/
export default `
; Function declarations - capture the entire declaration
(function_declaration) @name.definition.function

; Method declarations - capture the entire declaration
(method_declaration) @name.definition.method

; Type declarations (interfaces, structs, type aliases) - capture the entire declaration
(type_declaration) @name.definition.type

; Variable declarations - capture the entire declaration
(var_declaration) @name.definition.var

; Constant declarations - capture the entire declaration  
(const_declaration) @name.definition.const

; Package clause
(package_clause) @name.definition.package

; Import declarations - capture the entire import block
(import_declaration) @name.definition.import

; Anonymous function literals assigned to variables
(var_spec
  name: (identifier) @name.definition.func_literal
  value: (expression_list
    (func_literal))) @definition.func_literal

; Function literals in short variable declarations
(short_var_declaration
  left: (expression_list
    (identifier) @name.definition.func_literal)
  right: (expression_list
    (func_literal))) @definition.func_literal

; Map type definitions
(type_declaration
  (type_spec
    name: (type_identifier) @name.definition.map_type
    type: (map_type))) @definition.map_type

; Pointer type definitions
(type_declaration
  (type_spec
    name: (type_identifier) @name.definition.pointer_type
    type: (pointer_type))) @definition.pointer_type
`
