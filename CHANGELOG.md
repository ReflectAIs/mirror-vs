
# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

## [0.0.7] - 2025-10-17

### Added
- **Figma Integration**: Agent can now read and extract data from Figma documents
  - `figma_get_nodes` tool for fetching specific node data by ID
  - `figma_get_styles` tool for retrieving document styles
  - Support for Figma API key stored securely via VS Code secrets
- **Document Analysis Support**: New tools for parsing and analyzing structured documents
- **Test Orchestrator**: Enhanced test execution and reporting capabilities
- **Parsing Improvements**: Better parsing logic for tool tag extraction and validation

## [0.0.6] - 2025-10-16

### Added
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing and packaging
  - Runs tests, linting, and format checks on every push and PR
  - Automatically packages VSIX on version tags
  - Tested against Node.js 18 and 20
