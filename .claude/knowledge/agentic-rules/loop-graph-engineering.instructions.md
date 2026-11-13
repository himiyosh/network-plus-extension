---
applyTo: "**/*.agent.md,**/*SKILL.md,**/*.prompt.md,**/*workflow*.py,**/*workflow*.ts,**/*workflow*.js,**/*workflow*.cs,**/*workflow*.go"
description: "Engineering contract for bounded agent loops and graph/DAG workflows."
---

# Loop and Graph engineering

## Selection rule

Use the least complex control model that satisfies the requirement.

| Model | Use when |
| --- | --- |
| Function or single model call | Deterministic code or one bounded request can complete the task |
| Sequential workflow | Steps and transitions are known in advance |
| Bounded evaluator-optimizer loop | Iterative refinement has measurable acceptance criteria |
| Graph/DAG workflow | Fixed topology, conditional routing, fan-out/fan-in, typed messages, checkpoints, or human transitions are required |
| Autonomous agent loop | The number and order of steps cannot be predicted and environment feedback must determine the next action |

Do not introduce a graph framework when native control flow is sufficient. Framework adoption must have a measurable benefit in reliability, observability, recovery, or routing safety.

## State and transition contract

- Define a typed state schema with run ID, workflow version, current node, inputs, outputs, attempts, budgets, approval state, and terminal status.
- Each node declares accepted input, emitted output, side effects, retry class, timeout, and failure transition.
- Each edge has an explicit condition. Do not use an undocumented fallback edge.
- Define terminal states for success, failure, cancellation, blocked, and human-decision-required.
- Validate state at every node boundary. Invalid state fails closed instead of being coerced into a success-shaped default.

## Bounded execution

Every loop declares hard limits before execution:

- Maximum iterations.
- Maximum elapsed time.
- Maximum model and tool calls.
- Maximum token or cost budget when the runtime exposes it.
- Maximum transient retries per node.

Stop when a hard limit is reached. Report the last completed node, remaining work, and resumable checkpoint. Do not silently extend the budget.

Detect no-progress states by comparing normalized state, accepted findings, or objective metrics across iterations. Stop on repeated state, repeated failure class, oscillation between states, or a cycle that produces no new evidence.

## Reliability and side effects

- Retry only errors classified as transient. Use bounded backoff and preserve the original error.
- Make write nodes idempotent by using operation IDs, read-back verification, or conditional writes.
- Define compensation or manual recovery for partially completed external writes.
- Do not retry destructive, privileged, billing, production, or externally visible actions without explicit approval.
- Multiple workers must not edit the same artifact concurrently. Partition ownership or serialize the write stage.
- Bound fan-out concurrency and define deterministic fan-in ordering and duplicate handling.

## Checkpoints and recovery

- Write checkpoints at stable state boundaries, after verified side effects, and before human approval.
- A checkpoint records workflow version, state schema version, completed nodes, pending nodes, budgets consumed, artifact identities, and external operation IDs.
- Resume validates source versions and external state before continuing.
- Workflow changes include checkpoint migration or an explicit incompatible-version error.
- Replay mode must not repeat external side effects. Replace writes with recorded results or dry-run adapters.

## Human-in-the-loop

Pause before destructive, external, privileged, production, policy-sensitive, or ambiguous transitions. The approval request includes proposed action, affected resources, evidence, rollback, and the exact continuation state.

Approval, rejection, revision request, expiration, and cancellation are distinct transitions and are recorded in state.

## Observability

Emit structured events for run start/end, node start/end, edge selection, model/tool call, retry, checkpoint, approval, compensation, and terminal transition.

Include correlation ID, workflow/node version, model/tool identity, latency, retry count, token/cost data when available, and sanitized error category. Do not log secrets, credentials, customer payloads, or unrestricted model reasoning.

## Tests

At minimum, test:

- Each node's valid and invalid input.
- Every edge and terminal transition.
- Loop success, maximum budget, no-progress, oscillation, timeout, cancellation, and repeated failure.
- Fan-out limits, fan-in ordering, duplicate messages, and worker failure.
- Checkpoint save, resume, replay, and version migration.
- Human approve, reject, revise, expire, and cancel paths.
- Idempotent write and compensation behavior.

Use deterministic fixtures for routing and transition tests. End-to-end evaluation measures both coverage and actual outcome accuracy.

## References

- [Microsoft Agent Framework Workflows](https://learn.microsoft.com/agent-framework/workflows/)
- [Durable Task extension for Microsoft Agent Framework](https://learn.microsoft.com/azure/durable-task/sdks/durable-agents-microsoft-agent-framework)
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
