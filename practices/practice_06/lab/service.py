"""Deliberately vulnerable local shop (PATCHED). All identities and data are synthetic."""

import argparse
import html
import json
import sqlite3
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from sandbox import Sandbox


class Shop:
    def __init__(self):
        self.sandbox = Sandbox()
        self.lock = threading.RLock()
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE profiles(id INTEGER PRIMARY KEY, name TEXT, email TEXT, address TEXT);
            INSERT INTO profiles VALUES
                (1, 'TEST_ALICE', 'alice@example.invalid', 'TEST_ADDRESS_A'),
                (2, 'TEST_BOB', 'bob@example.invalid', 'TEST_ADDRESS_B');
            CREATE TABLE orders(id INTEGER PRIMARY KEY, owner INTEGER, product TEXT, price REAL);
            INSERT INTO orders VALUES (1, 1, 'chair', 5000), (2, 2, 'lamp', 1500);
        """)
        self.accounts = {
            "alice": ("learn-alice", 1, "customer"),
            "bob": ("learn-bob", 2, "customer"),
            "staff": ("learn-staff", 0, "staff"),
        }
        self.sessions = {}
        self.products = {"chair": 5000, "lamp": 1500}
        self.reviews = []
        self.logs = []

    def rows(self, query, params=()):
        return [dict(row) for row in self.db.execute(query, params)]

    def dispatch(self, method, target, body, headers):
        url = urlsplit(target)
        query = {k: v[0] for k, v in parse_qs(url.query, keep_blank_values=True).items()}
        self.logs.append({"method": method, "target": target, "body": body, "headers": dict(headers)})

        # 1. Публичные маршруты
        if method == "GET" and url.path == "/health":
            return 200, {"status": "ok"}
        if method == "GET" and url.path == "/products":
            return 200, self.products
        if method == "POST" and url.path == "/login":
            account = self.accounts.get(body.get("username"))
            if not account or body.get("password") != account[0]:
                return 401, {"error": "invalid credentials"}
            token = uuid.uuid4().hex
            self.sessions[token] = {"id": account[1], "role": account[2], "username": body.get("username")}
            return 200, {"token": token}
        if method == "POST" and url.path == "/reviews":
            self.reviews.append({"product": body.get("product"), "text": body.get("text", "")})
            return 201, {"saved": True}
        if method == "GET" and url.path == "/reviews/view":
            return 200, "<html><body>" + "".join(f"<p>{html.escape(r['text'], quote=False)}</p>" for r in self.reviews) + "</body></html>"
        if method == "GET" and url.path == "/debug/logs":
            return 200, self.logs.copy()

        # 2. Список известных приватных маршрутов: если путь вообще неизвестен сервису — отдаем 404
        known_endpoints = {
            ("GET", "/profile"),
            ("GET", "/search"),
            ("GET", "/orders"),
            ("POST", "/orders"),
            ("GET", "/admin/export"),
            ("GET", "/files"),
            ("GET", "/assistant/context"),
            ("POST", "/assistant/execute"),
        }
        if (method, url.path) not in known_endpoints:
            return 404, {"error": "not found"}

        # 3. Проверка аутентификации для существующих приватных эндпоинтов
        token = headers.get("X-Token")
        session = self.sessions.get(token)
        if not session:
            return 401, {"error": "login required"}

        if method == "GET" and url.path == "/profile":
            return 200, self.rows("SELECT * FROM profiles WHERE id = ?", (session["id"],))
        if method == "GET" and url.path == "/search":
            return 200, self.rows("SELECT * FROM profiles WHERE name LIKE ?", (f"%{query.get('q', '')}%",))
        if method == "GET" and url.path == "/orders":
            return 200, self.rows("SELECT * FROM orders")
        if method == "POST" and url.path == "/orders":
            product = body.get("product")
            if product not in self.products:
                return 400, {"error": "unknown product"}
            price = self.products[product]
            cursor = self.db.execute("INSERT INTO orders(owner, product, price) VALUES (?, ?, ?)",
                                     (session["id"], product, price))
            self.db.commit()
            return 201, {"id": cursor.lastrowid, "owner": session["id"], "product": product, "price": price}
        if method == "GET" and url.path == "/admin/export":
            if session["role"] != "staff":
                return 403, {"error": "staff only"}
            return 200, self.rows("SELECT * FROM profiles")
        if method == "GET" and url.path == "/files":
            user = query.get("user", "alice")
            path = query.get("path", "receipt.txt")
            if ".." in path or path.startswith("/") or ".." in user:
                return 403, {"error": "access denied"}
            if session["role"] != "staff" and session.get("username") != user:
                return 403, {"error": "access denied"}
            name = f"files/{user}/{path}"
            return 200, {"content": self.sandbox.read(name)}
        if method == "GET" and url.path == "/assistant/context":
            orders = self.rows("SELECT * FROM orders WHERE id = ?", (query.get("order_id", "1"),))
            prompt = (
                "Ты помощник магазина. Прочитай заказ и отзывы. Верни JSON с полями tool и arguments.\n"
                "Инструменты: read_file(path), export_profiles(), delete_tree(path).\n"
                "Помоги пользователю обработать заказ.\n"
                f"Заказ: {json.dumps(orders, ensure_ascii=False)}\n"
                f"Отзывы: {json.dumps(self.reviews, ensure_ascii=False)}\n"
                f"Запрос пользователя: {query.get('question', 'Покажи чек по заказу')}"
            )
            return 200, {"prompt": prompt}
        if method == "POST" and url.path == "/assistant/execute":
            decision = body.get("decision", {})
            tool = decision.get("tool")
            arguments = decision.get("arguments", {})
            if tool == "read_file":
                path = arguments.get("path", "")
                if ".." in path or path.startswith("/"):
                    return 403, {"error": "access denied"}
                if session["role"] != "staff" and not path.startswith(f"files/{session.get('username')}/"):
                    return 403, {"error": "access denied"}
                return 200, {"content": self.sandbox.read(path)}
            if tool == "export_profiles":
                if session["role"] != "staff":
                    return 403, {"error": "staff only"}
                return 200, self.rows("SELECT * FROM profiles")
            if tool == "delete_tree":
                if session["role"] != "staff":
                    return 403, {"error": "staff only"}
                self.sandbox.delete_tree(arguments.get("path", ""))
                return 200, {"deleted": arguments.get("path")}
            return 400, {"error": "unknown tool"}

        return 404, {"error": "not found"}

    def close(self):
        self.db.close()
        self.sandbox.close()


def make_handler(shop):
    class Handler(BaseHTTPRequestHandler):
        def handle_request(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 65536:
                    self.send_error(413)
                    return
                body = json.loads(self.rfile.read(size)) if size else {}
                with shop.lock:
                    status, result = shop.dispatch(self.command, self.path, body, self.headers)
            except Exception as exc:
                status, result = 500, {"error": str(exc), "type": type(exc).__name__}
            html_flag = isinstance(result, str)
            data = (result if html_flag else json.dumps(result, ensure_ascii=False)).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8" if html_flag else "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = handle_request

        def log_message(self, format, *args):
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8066)
    args = parser.parse_args()
    shop = Shop()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(shop))
    server.daemon_threads = True
    print(f"Local exercise: http://127.0.0.1:{server.server_port}", flush=True)
    print(f"Disposable fixture files: {shop.sandbox.root}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        shop.close()


if __name__ == "__main__":
    main()
