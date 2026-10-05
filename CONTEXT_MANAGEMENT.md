# Codex Context Management Notes

This document records the context-management observations and configuration checks from this session. It is a practical reference, not a specification of Codex internals.

## What the counters mean

The visible token-usage counter and the context-window indicator are different measurements.

- The session initially showed a **1.05M** context window.
- After the first short `Hello` turn, the displayed window changed to **828K** while the visible usage was only about **2.61K tokens**.
- After a second turn, usage increased to about **27.7K tokens**, but the displayed context window remained at **828K**.

The second observation shows that the context-window number is not the same counter as token usage and does not decrease one-for-one with it. It is more likely the model's effective context capacity or a capacity value established when the session was initialized. The exact Codex UI calculation is not publicly exposed.

OpenAI's API documentation separately defines input, output, cached, reasoning, and total token usage, while a model's context window is its maximum context capacity:

- [Response usage fields](https://developers.openai.com/api/reference/cli/resources/responses/methods/retrieve)
- [GPT-6 Astra model limits](https://developers.openai.com/api/docs/models/gpt-6-astra)

## What may occupy context

The model request can include more than the visible conversation, including:

- system and developer instructions;
- tool definitions and runtime metadata;
- project instructions such as `AGENTS.md`;
- skill metadata or the full instructions for a selected skill;
- MCP/app/plugin definitions;
- conversation history and any compacted conversation state;
- reserved capacity for reasoning, tool calls, or future output.

The exact contribution of each category cannot be measured from the Codex UI. In particular, the observed 1.05M-to-828K change does **not** prove that default services consumed exactly 222K tokens.

## Conversation display and compaction

If earlier messages appear hidden, the agent is not deleting them; the model cannot control the chat renderer. Possible causes are:

1. the client collapsed older turns;
2. the client compacted the conversation for continued work; or
3. a temporary rendering/synchronization issue occurred.

Codex supports conversation compaction, which compresses prior state while preserving task-relevant information. See the [official compaction guidance](https://developers.openai.com/api/docs/guides/latest-model). Refreshing the client can help distinguish a display issue from a persistent history issue:

- macOS: `Command-R`
- hard refresh: `Command-Shift-R`
- alternatively, close and reopen the conversation/app

## Inspectable Codex configuration

Codex configuration is TOML, not Claude Code's JSON format.

- User-wide configuration: `~/.codex/config.toml`
- Project configuration: `.codex/config.toml`
- MCP server sections: `[mcp_servers.<server-name>]`

Useful inspection commands:

```bash
codex mcp list
codex mcp --help
rg --files --hidden -g 'AGENTS.md' -g '.agents/**' -g '.codex/**'
```

In this session, the user config existed but contained no `mcp_servers` entries, the project had no `.codex/config.toml`, and `codex mcp list` reported:

```text
No MCP servers configured yet.
```

If a server is configured, remove or comment out its entire section, or use `codex mcp remove <server-name>`, then restart Codex. MCP servers can also be inspected with `/mcp` in the Codex terminal UI.

## Available context-reduction controls

The following controls are documented for Codex:

```toml
# ~/.codex/config.toml

# Remove the web-search tool.
web_search = "disabled"

# Disable multi-agent tools.
[agents]
enabled = false

# Reduce the available-skills catalog budget; this does not disable selected skills.
[skills]
max_context_tokens = 2000

# Disable one skill without deleting it.
[[skills.config]]
path = "/Users/you/.agents/skills/example/SKILL.md"
enabled = false
```

There is no documented personal setting equivalent to one universal deny list for every built-in tool, or to Claude Code's single switches for all connectors, workflows, bundled skills, or artifacts. Plugin availability and MCP allowlists can be restricted in managed/admin configuration.

Relevant official documentation:

- [Codex configuration layers](https://developers.openai.com/es-419/docs/config-file/config-basic)
- [MCP configuration](https://developers.openai.com/es-419/docs/extend/mcp)
- [Skills configuration](https://developers.openai.com/es-419/docs/build-skills)
- [Web-search configuration](https://developers.openai.com/es-419/docs/agent-approvals-security)
- [Managed plugin/MCP configuration](https://developers.openai.com/es-419/docs/enterprise/managed-configuration)
