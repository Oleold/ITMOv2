# Build Evaluation Report

Hardware: Asus TUF Gaming
OS: Ubuntu
Local model: qwen2.5:7b
Quantization: Q4_K_M (from `ollama show qwen2.5:7b`)
Context length: 32768 tokens

Why this model fits the laptop:
- 7B parameters with Q4_K_M quantization fits into typical Asus TUF Gaming resources (8–16 GB VRAM or CPU RAM fallback) and runs responsively on Ubuntu with Ollama.
- 32k context is sufficient for Build mode to ingest multi-file prompts (system, code excerpts, instructions) without blowing past memory.
- Qwen2.5 7B provides a good balance of quality and speed for local iterative coding tasks; larger models would strain laptop VRAM/thermals, smaller models degrade reasoning.

Configuration made:
- Modelfile updated to `FROM qwen2.5:7b`, `num_ctx 32768`, `temperature 0.2`, Build-oriented system prompt. File: `practices/practice_03/lab/Modelfile`.
- Project opencode.json now points to local Ollama endpoint and selects `ollama/qwen2.5:7b`. Added tool output limits to cap file read output. File: `opencode.json`.
- Demo opencode.json set to `ollama/qwen2.5:7b`, with the same local endpoint and tool output limits. File: `practices/practice_03/lab/demo/opencode.json`.

Questions used (lab/demo):
1. Как запустить тесты? Укажи файл-источник.
2. Что будет при пустом имени подписчика? Подтверди кодом.
3. Где реализован unsubscribe? Проверь предпосылку вопроса. (ложная предпосылка)
4. Какая CI-система запускает тесты? Если сведений нет, скажи об этом. (нет ответа в репозитории)
5. Сохраняются ли подписки после перезапуска процесса? Подтверди кодом.

Gold answers (kept private during model runs):
- Q1: `make test` (source: `lab/demo/Makefile`, строка с `python3 -m unittest -v`; тесты: `lab/demo/test_service.py`).
- Q2: Бросает `ValueError("empty name")` (код: `lab/demo/service.py`, строки 5–6).
- Q3: В репозитории нет `unsubscribe`; функция не реализована (поиск по `lab/demo/**`).
- Q4: В материалах нет сведений о CI; конфигурации CI нет.
- Q5: Не сохраняются: подписчики хранятся в `subscribers = set()` в памяти процесса (код: `lab/demo/service.py`), при рестарте теряются.

Model answers vs gold:
- Q1: FAIL. Модель дала общий ответ про "зависит от структуры", не указала `make test`/`Makefile`.
- Q2: PASS. Модель ответила, что будет ошибка при пустом имени (соответствует `ValueError`).
- Q3: FAIL. Модель ответила про фреймворки/Redux, не по коду репозитория и не распознала отсутствие `unsubscribe`.
- Q4: PARTIAL. Модель перечислила популярные CI и указала, что без доп. сведений определить трудно. По сути верно, но без явного указания, что в материалах ответа нет.
- Q5: PASS. Модель ответила, что подписки не сохраняются после рестарта, что соответствует коду (in-memory set).

Notes:
- После изменения конфигурации opencode необходимо перезапустить OpenCode-клиент для применения настроек.
