import json
from collections.abc import AsyncIterator

import httpx

from store import FileStore

ACTION_GUIDANCE = {
    "research": "Your job is to help the user research and find answers. Provide factual, well-sourced information. If you're uncertain, say so.",
    "brainstorm": "Your job is to help the user brainstorm. Generate diverse, creative, divergent ideas. Quantity over perfection. Build on the context provided.",
    "breakdown": "Your job is to help the user break work down into concrete, actionable steps. Create a clear step-by-step task list. Each step should be small enough to start immediately.",
    "freeform": "Help the user with whatever they need based on the context provided.",
}


def build_context_messages(
    store: FileStore,
    note_id: str | None,
    action: str,
    prompt: str,
    selection: str | None,
    cursor_context: str | None,
) -> list[dict]:
    messages: list[dict] = []

    # Build system message with note context
    system_parts = ["You are an AI assistant embedded in a note-taking app called Dwell. Be concise and direct. Think briefly before answering."]

    guidance = ACTION_GUIDANCE.get(action, ACTION_GUIDANCE["freeform"])
    system_parts.append(guidance)

    if note_id:
        note = store.get_note(note_id)
        if note:
            system_parts.append(f"\n--- Current Note ---\nTitle: {note.title}\n\n{note.body}")

            tasks = store.note_tasks(note_id)
            if tasks:
                task_lines = []
                for t in tasks:
                    task_lines.append(f"- [{t.status}] {t.title}")
                system_parts.append("\n--- Tasks ---\n" + "\n".join(task_lines))

            questions = store.note_questions(note_id)
            if questions:
                q_lines = []
                for q in questions:
                    line = f"- [{q.status}] {q.question}"
                    if q.answer:
                        line += f"\n  Answer: {q.answer}"
                    q_lines.append(line)
                system_parts.append("\n--- Questions ---\n" + "\n".join(q_lines))

    messages.append({"role": "system", "content": "\n\n".join(system_parts)})

    # Build user message
    user_parts = []
    if selection:
        user_parts.append(f"Selected text:\n> {selection}")
    if cursor_context:
        user_parts.append(f"Context around cursor:\n{cursor_context}")
    user_parts.append(prompt)

    messages.append({"role": "user", "content": "\n\n".join(user_parts) + " /no_think"})

    return messages


async def stream_completion(config: dict, messages: list[dict]) -> AsyncIterator[str]:
    headers = {"Content-Type": "application/json"}
    if config.get("api_key"):
        headers["Authorization"] = f"Bearer {config['api_key']}"

    payload: dict = {
        "model": config.get("model", "llama3"),
        "messages": messages,
        "max_tokens": config.get("max_tokens", 4096),
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            async with client.stream("POST", config["endpoint"], json=payload, headers=headers) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    yield f"data: {json.dumps({'type': 'error', 'message': f'API returned {response.status_code}: {body.decode()}'})}\n\n"
                    return

                thinking_started = False
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content")
                        reasoning = delta.get("reasoning") or delta.get("reasoning_content")
                        if content:
                            yield f"data: {json.dumps({'type': 'delta', 'content': content})}\n\n"
                        elif reasoning and not thinking_started:
                            thinking_started = True
                            yield f"data: {json.dumps({'type': 'thinking'})}\n\n"
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except httpx.ConnectError:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Could not connect to AI endpoint. Is it running?'})}\n\n"
    except httpx.TimeoutException:
        yield f"data: {json.dumps({'type': 'error', 'message': 'AI request timed out'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
