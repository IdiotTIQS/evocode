# Contracts

This directory is the single source of truth for cross-layer contracts.

## Intent Contract

The `intent.schema.json` file defines two core schemas used across all four layers of the EvoCode platform:

- **IntentRequest**: Represents a user intent with a required description and project identifier
- **RunAcknowledgement**: Represents the acknowledgement of a run with a unique identifier, status, and message

## Mirrored Locations

Any changes to the contract definitions in this directory **must be synchronized** to the following mirror locations:

- **Frontend**: `frontend/src/types/intent.ts`
- **Control Plane**: `control-plane/.../dto/`
- **AI Runtime**: `ai-runtime/.../models.py`

## Update Process

When modifying any contract:

1. Update the schema in `intent.schema.json`
2. Synchronize all three mirror locations
3. Run validation tests to ensure consistency across layers
4. Update documentation as needed

This ensures all layers maintain a consistent understanding of the request/response contracts.
