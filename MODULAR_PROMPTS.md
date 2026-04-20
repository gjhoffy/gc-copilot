# Modular Prompt System

The ConstructBuilt Giga Brain now uses a modular prompt system that allows for flexible, maintainable, and customizable AI prompts.

## Overview

Instead of monolithic prompt strings, prompts are now composed from reusable **modules** that can be mixed and matched based on the query type and user preferences.

## Architecture

### Prompt Modules

Each module contains:

- **ID**: Unique identifier
- **Name**: Human-readable name
- **Description**: What the module does
- **Content**: The actual prompt text
- **Tags**: Categories for filtering and organization
- **Required**: Whether the module must always be included

### Available Modules

#### Core Identity Modules

- **Identity**: Core AI identity as ConstructBuilt Giga Brain
- **Voice**: Communication standards and tone guidelines
- **Locale**: Bucks County service area definition

#### Specialized Modules

- **Standards 2026**: Current year best practices and requirements
- **Grounding**: Instructions for using live search results
- **Routing**: Mode-specific behavior guidelines
- **Blog Spec**: Detailed blog content generation specifications
- **Construction Focus**: Specialized construction and painting knowledge
- **Competitive Intel**: Market analysis and competitor research frameworks
- **Local SEO**: Local search optimization strategies

## Usage

### Default Compositions

Each mode (market, blog, page, audit, framer, chat) has a default composition of modules:

```typescript
const marketComposition = {
  modules: [
    "identity",
    "voice",
    "locale",
    "standards_2026",
    "grounding",
    "routing",
    "competitive_intel",
  ],
};
```

### Customizing Compositions

Users can customize which modules are active for each mode through the Settings panel:

1. Open Settings (gear icon)
2. Navigate to the "Prompts" tab
3. Select a mode from the dropdown
4. Toggle modules on/off (required modules cannot be disabled)

### Programmatic Usage

```typescript
import { composePrompt, getCompositionForMode } from "@/lib/prompts";

// Get default composition for a mode
const composition = getCompositionForMode("blog");

// Compose the final prompt
const systemPrompt = composePrompt(composition);
```

## Benefits

1. **Maintainability**: Update individual modules without affecting others
2. **Flexibility**: Mix and match modules for different use cases
3. **Consistency**: Shared modules ensure consistent behavior across modes
4. **Customization**: Users can tailor prompts to their specific needs
5. **Testing**: Individual modules can be tested and refined independently

## Adding New Modules

To add a new prompt module:

```typescript
import { PROMPT_MODULES, addCustomModule } from "@/lib/prompts";

const newModule = {
  id: "custom_module",
  name: "Custom Module",
  description: "Does something special",
  content: "Custom prompt instructions...",
  tags: ["custom", "special"],
};

addCustomModule(newModule);
```

## Future Enhancements

- Module versioning and compatibility
- User-defined custom modules
- Module performance analytics
- A/B testing different module combinations
- Export/import module configurations</content>
  <parameter name="filePath">c:\Users\Gjhof\Desktop\gc-copilot\MODULAR_PROMPTS.md
