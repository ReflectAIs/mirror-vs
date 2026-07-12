/*
Supported C++ structures:
- struct/class/union declarations
- function/method declarations
- typedef declarations
- enum declarations
- namespace definitions
- template declarations
- macro definitions
- variable declarations
- constructors/destructors
- operator overloads
- friend declarations
- using declarations
*/
export default `
; Basic declarations
(struct_specifier
  name: (type_identifier) @name.definition.class) @definition.class

(union_specifier
  name: (type_identifier) @name.definition.class) @definition.class

; Function declarations (prototypes)
(declaration
  type: (_)
  declarator: (function_declarator
    declarator: (identifier) @name.definition.function)) @definition.function

; Function definitions (with body)
(function_definition
  type: (_)
  declarator: (function_declarator
    declarator: (identifier) @name.definition.function)) @definition.function

(function_definition
  declarator: (function_declarator
    declarator: (field_identifier) @name.definition.method)) @definition.method

(type_definition
  type: (_)
  declarator: (type_identifier) @name.definition.type) @definition.type

(class_specifier
  name: (type_identifier) @name.definition.class) @definition.class

; Enum declarations
(enum_specifier
  name: (type_identifier) @name.definition.enum) @definition.enum

; Namespace definitions
(namespace_definition
  name: (namespace_identifier) @name.definition.namespace) @definition.namespace

(namespace_definition
  body: (declaration_list
    (namespace_definition
      name: (namespace_identifier) @name.definition.namespace))) @definition.namespace

; Template declarations
(template_declaration
  parameters: (template_parameter_list)
  (class_specifier
    name: (type_identifier) @name.definition.template.class)) @definition.template

; Macro definitions
(preproc_function_def
  name: (identifier) @name.definition.macro) @definition.macro

; Variable declarations with initialization
(declaration
  type: (_)
  declarator: (init_declarator
    declarator: (identifier) @name.definition.variable)) @definition.variable

; Constructor declarations
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name.definition.constructor)) @definition.constructor

; Destructor declarations
(function_definition
  declarator: (function_declarator
    declarator: (destructor_name) @name.definition.destructor)) @definition.destructor

; Operator overloads
(function_definition
  declarator: (function_declarator
    declarator: (operator_name) @name.definition.operator)) @definition.operator

; Friend declarations
(friend_declaration) @definition.friend

; Using declarations
(using_declaration) @definition.using

; Virtual method declarations
(field_declaration
  (virtual)
  type: (_)
  declarator: (function_declarator
    declarator: (identifier) @name.definition.virtual_method)) @definition.virtual_method

; Pure virtual method declarations (= 0)
(field_declaration
  (virtual)
  type: (_)
  declarator: (function_declarator
    declarator: (identifier) @name.definition.pure_virtual_method)) @definition.pure_virtual_method

; Type alias declarations (using T = type)
(alias_declaration
  name: (type_identifier) @name.definition.type_alias) @definition.type_alias

; Base class clauses in class definitions
(class_specifier
  name: (type_identifier) @name.definition.class
  (base_class_clause
    (type_identifier) @name.definition.base_class)) @definition.base_class

; Field initializer lists in constructors
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name.definition.constructor)
  (field_initializer_list)) @definition.field_initializer_list


; Defaulted methods (= default)
(declaration
  declarator: (function_declarator
    declarator: (identifier) @name.definition.defaulted)) @definition.defaulted
`
