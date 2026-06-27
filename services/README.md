# Services

This directory is a placeholder for business service implementations.

## Increment 0 Status

In increment 0, this layer is not yet implemented. It will be developed in subsequent increments.

## Future Responsibilities

The business services layer will provide:

- **Validation Engine**: Verify intent requests and ensure compliance with project constraints
- **Graph Storage**: Postgres database with pgvector for semantic search and relationship management
- **Sandbox Runner**: Execute code in isolated environments for safe execution
- **Target Repository I/O**: Interface with external repositories for project management

## Integration Point

The current seam between the AI runtime and business services is located at:

```
ai-runtime/src/evocode_runtime/services/
```

Future implementations will extend this seam to support the services listed above.
