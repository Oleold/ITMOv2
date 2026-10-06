import sys
import json
import os

def handle_request(req):
    if req.get("method") == "tools/list":
        return {
            "tools": [{
                "name": "read_safe",
                "description": "Безопасное чтение файла. Возвращает ошибку, если файла нет.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"filepath": {"type": "string"}},
                    "required": ["filepath"]
                }
            }]
        }
    elif req.get("method") == "tools/call":
        args = req.get("params", {}).get("arguments", {})
        filepath = args.get("filepath", "")
        if not os.path.exists(filepath):
            return {"content": [{"type": "text", "text": f"Ошибка: Файл {filepath} не найден!"}], "isError": True}
        with open(filepath, "r") as f:
            return {"content": [{"type": "text", "text": f.read()}]}
    return {}

if __name__ == "__main__":
    for line in sys.stdin:
        try:
            req = json.loads(line)
            res = handle_request(req)
            print(json.dumps({"jsonrpc": "2.0", "id": req.get("id"), "result": res}))
            sys.stdout.flush()
        except Exception:
            pass
