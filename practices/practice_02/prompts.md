# Журнал экспериментов Практики 2

Файл ведёт OpenCode по вашим запросам. Агент записывает фактические результаты экспериментов и вносит изменения в связанные файлы. Свою оценку сообщайте ему в чате; вручную заполнять шаблон не нужно.

- Выбранный слабый артефакт Практики 1: `practices/practice_01/tests_unit.md`
- Что в нём нужно улучшить: устранить абстрактные проверки; добавить негативные сценарии (KeyError при отсутствии ключа `diff` в payload, пустой `diff`, невалидный JSON парсера модели, таймауты)
- Как поймём, что изменение полезно: появились точные контракты Given‑When‑Then, валидация входных данных, привязка проверок к строкам `app/api.py` и `TRAINING_PR.diff`, фиксация инвариантов сервиса

| Техника | Файл эксперимента | Изменённый файл Практики 1 | Конкретное изменение (шаги) | Проверка | Что отклонили |
|---|---|---|---|---|---|
| Few-shot | [`few_shot/experiment.md`](few_shot/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены 5 юнит‑проверок шагами: Given пустой/отсутствующий `diff` → 4xx; Given длинный `diff` → prompt ≤ 8000; Given невалидный JSON от LLM → сообщение об ошибке; Given вызов `review()` → в ответе есть `comment` | Просмотр diff в `tests_unit.md`, `make step2` | Принято, 5/5 |
| R.C.T.F. | [`rctf/experiment.md`](rctf/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены 4 проверки: тип `diff`=str; лишние поля игнорируются; минимальная длина `diff`=5; инвариант «LLM не вызывается при ошибке валидации» | Просмотр diff, `make step2` | Принято, 5/5 |
| Chain of Verification | [`chain_of_verification/experiment.md`](chain_of_verification/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Уточнены 2 строки: лишние поля → 2xx игнорируются; минимальная длина diff → min 5; добавлены ссылки на `TRAINING_PR.diff` | Просмотр diff, `make step2` | Принято, 5/5 |
| Tree of Thoughts | [`tree_of_thoughts/experiment.md`](tree_of_thoughts/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Уточнены подтверждения для 2 строк в формате Given‑When‑Then без изменения структуры | Просмотр diff, `make step2` | Принято, 5/5 |
| RAG | [`rag/experiment.md`](rag/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Добавлены источники в подтверждения трёх строк (ссылки на `TRAINING_PR.diff` и README); привязка к `app/api.py` | Просмотр diff, `make step2` | Принято, 5/5 |
| ReAct | [`react/experiment.md`](react/experiment.md) | [`practice_01/tests_unit.md`](../practice_01/tests_unit.md) | Унификация стиля подтверждений (Given/When/Then, «Основание: …»); финальная вычитка | Просмотр diff, `make step2` | Принято, 5/5 |
