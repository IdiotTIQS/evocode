# EvoCode

EvoCode is a four-layer agent-driven software engineering platform that enables autonomous code generation and system evolution through intelligent intent processing.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend Console (Port 3000)               │
│         User Interface & Intent Submission              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         Spring Boot Control Plane (Port 8080)           │
│  Orchestration, Request Routing & State Management      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│          Python AI Runtime (Port 8000)                  │
│    Intent Analysis, Code Generation & Execution        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            Business Services Layer                      │
│  Validation, Storage, Sandboxing & Repository I/O      │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

- **`frontend/`** - Next.js/TypeScript frontend application
- **`control-plane/`** - Spring Boot service for orchestration
- **`ai-runtime/`** - Python service for intent processing and code generation
- **`services/`** - Business service implementations and utilities
- **`contracts/`** - Cross-layer contract definitions (single source of truth)

## Local Development

### Startup Order

Start services in this order to ensure proper initialization:

1. **Python AI Runtime** (Port 8000)
   ```bash
   cd ai-runtime
   python -m evocode_runtime
   ```

2. **Spring Boot Control Plane** (Port 8080)
   ```bash
   cd control-plane
   ./mvnw spring-boot:run
   ```

3. **Frontend Console** (Port 3000)
   ```bash
   cd frontend
   npm run dev
   ```

### Prerequisites

- Python 3.10+
- Java 17+
- Node.js 18+
- Git

## Cross-Layer Contracts

All layers adhere to the contract definitions in the `contracts/` directory. These schemas define:

- **IntentRequest**: Structure for user intents and project context
- **RunAcknowledgement**: Response format for intent processing results

See `contracts/README.md` for details on maintaining contract consistency across layers.

## Contributing

When modifying contracts or adding features:

1. Update the contract if needed in `contracts/`
2. Synchronize changes to all affected layers
3. Test cross-layer integration
4. Document changes in relevant layer READMEs

## License

EvoCode is part of the agent-driven engineering platform.
